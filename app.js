/* ==========================================================
   PustakaKita - app.js
   1. Konfigurasi   2. Data tetap   3. State   4. Helper   5. Tema
   6. Ambil data    7. Tampilan     8. Chat    9. Modal    10. Event   11. Mulai
   ========================================================== */


/* ---------- 1. KONFIGURASI ---------- */
const SUPABASE_URL = 'https://ciwkmgjqycnhhfmksgzp.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpd2ttZ2pxeWNuaGhmbWtzZ3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MjExMzcsImV4cCI6MjEwODE5NzEzN30.1oWNVu3JI7pxI3EuLADkh-6vpiUZwzieyIbcp4VwOOU'

/* ==========================================================
   PATCH app.js - Mode MAINTENANCE (tutup website sementara)
   Ada 10 langkah di app.js + 1 di style.css (maintenance.css) + 1 di Supabase (maintenance.sql).
   Tidak ada perubahan di index.html (layar maintenance dibuat oleh JS).

   Cara kerja singkat:
   - Status disimpan di tabel `settings` (key = 'maintenance'), dibaca semua pengunjung.
   - ON  : layar penuh "Maintenance" menutup website. Semua elemen lain di-`inert`
           (tidak bisa diklik / difokus / dibaca pembaca layar).
   - Pengaman klien: SEMUA permintaan ke Supabase (tulis maupun baca) dari non-admin ditolak
     di satu pintu (fungsi maintFetch) dengan pesan "Error 503 ... maintenance".
     Kecuali: baca status maintenance, baca profil sendiri, perpanjang sesi, dan login admin.
   - Admin: tombol kecil di pojok kiri bawah untuk membuka kembali website (2x verifikasi).
     Menyalakan maintenance: lewat Pengaturan admin (2x verifikasi).
   - PENTING: pengaman di browser bisa dilewati orang yang paham teknis. Penguncian yang
     sebenarnya ada di database: jalankan maintenance.sql di Supabase.
   ========================================================== */


/* ==========================================================
   LANGKAH 1: Bagian "1. KONFIGURASI"
   CARI baris ini:

     const db = supabase.createClient(new URL(SUPABASE_URL).origin, SUPABASE_KEY)

   HAPUS baris itu, lalu TEMPEL kode di bawah ini di tempat yang sama.
   ========================================================== */

// ---------- MAINTENANCE: teks (ubah sesukamu) ----------
const MAINT_TITLE = 'Sedang Maintenance'
const MAINT_TEXT = 'PustakaKita sedang dalam perawatan sistem. Semua layanan dijeda sementara supaya data peminjaman dan akunmu tetap aman. Kami akan segera kembali.'
const MAINT_POLL = 30000   // layar maintenance mengecek status otomatis tiap 30 detik

// pesan error saat user mencoba aksi ke server selama maintenance
const MAINT_ERR = label =>
  `Error 503: Server sedang maintenance. ${label} tidak dapat diproses sekarang. Data kamu aman, coba lagi setelah maintenance selesai.`

// nama aksi di pesan error (berdasarkan tabel / endpoint yang dituju)
const MAINT_LABELS = {
  loans: 'Booking / peminjaman',
  books: 'Pengelolaan buku',
  messages: 'Pengiriman pesan',
  loan_msgs: 'Pengiriman pesan',
  loan_chats: 'Percakapan',
  notifications: 'Pembaruan notifikasi',
  settings: 'Perubahan pengaturan',
  profiles: 'Perubahan profil'
}
const MAINT_RPC = {
  request_return: 'Pengajuan pengembalian buku',
  hide_loan_chat: 'Penghapusan chat',
  update_my_profile: 'Penyimpanan biodata',
  set_username: 'Perubahan username',
  set_contact_email: 'Perubahan e-mail',
  login_email: 'Proses masuk',
  username_free: 'Proses pendaftaran',
  email_taken: 'Proses pendaftaran'
}

// status maintenance (dipakai oleh pengaman fetch di bawah)
const M = {
  on: null,            // null = belum diketahui, true / false
  ready: null,         // Promise pengecekan pertama
  shown: false,        // layar sedang tampil
  checking: false,
  busy: false,         // proses 2x verifikasi sedang berjalan
  allowLogin: false,   // true hanya selama form "Masuk admin" mengirim permintaan
  adminAttempt: false, // login lewat form admin sedang berlangsung
  next: 0,             // waktu pengecekan otomatis berikutnya
  timer: 0
}

function maintAdmin() {
  try {
    return S.me && S.me.role === 'admin'
  } catch (e) {
    return false
  }
}

const maintFrozen = () => M.on === true && !maintAdmin()

function maintLabel(url) {
  const path = url.pathname

  if (path.includes('/storage/')) return 'Unggah berkas'
  if (path.includes('/auth/')) return 'Proses akun'

  if (path.includes('/rest/v1/rpc/')) {
    const fn = path.split('/rpc/')[1]
    return MAINT_RPC[fn] || 'Aksi akun'
  }

  const table = (path.split('/rest/v1/')[1] || '').split('/')[0]
  return MAINT_LABELS[table] || 'Aksi ini'
}

// permintaan yang BOLEH lewat saat maintenance (non-admin)
function maintAllowed(url, method) {
  const path = url.pathname

  // baca status maintenance
  if (method === 'GET' && path.startsWith('/rest/v1/settings')) return true

  // baca profil SENDIRI (perlu untuk mengenali admin)
  if (method === 'GET' && path.startsWith('/rest/v1/profiles') && /(^|&)id=eq\./.test(url.search.slice(1))) return true

  // perpanjang sesi & keluar
  if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') return true
  if (path === '/auth/v1/logout') return true

  // login admin (hanya saat form "Masuk admin" sedang mengirim)
  if (M.allowLogin && (path === '/auth/v1/token' || path === '/rest/v1/rpc/login_email')) return true

  return false
}

// SATU PINTU untuk semua permintaan ke Supabase (REST, RPC, Storage, Auth)
async function maintFetch(input, init) {
  let url
  let method

  try {
    url = new URL(typeof input === 'string' ? input : input.url, location.href)
    method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase()
  } catch (e) {
    return fetch(input, init)
  }

  const allowed = maintAllowed(url, method)

  // status belum diketahui (baru membuka halaman): tunggu pengecekan pertama
  if (!allowed && M.on === null && M.ready) await M.ready

  if (!M.on || allowed || maintAdmin()) return fetch(input, init)

  const msg = MAINT_ERR(maintLabel(url))

  // bentuk galat yang dimengerti supabase-js (REST, Storage, dan Auth)
  return new Response(
    JSON.stringify({ message: msg, msg, error: msg, error_description: msg, code: 'MAINT' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  )
}

const db = supabase.createClient(new URL(SUPABASE_URL).origin, SUPABASE_KEY, { global: { fetch: maintFetch } })


/* ==========================================================
   LANGKAH 2: Bagian "4a. IKON SVG"
   Di objek ICON, setelah ikon `bolt` (beri koma di akhir baris bolt),
   tambahkan tiga ikon ini:

   bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
   wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.5-.6-.6-2.5z"/>',
   lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
   shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'
   ========================================================== */


/* ==========================================================
   LANGKAH 3: Bagian "6. AMBIL DATA"
   a) Di fungsi loadData(): CARI bagian awal ini

     async function loadData(animate) {
       const books = await db.from('books').select('*').order('created_at', { ascending: false })
       S.books = books.data || []

       const settings = await db.from('settings').select('*')
       S.set = { multi_book: false, multi_rent: false, email_verif: false, duration_var: false }
         ; (settings.data || []).forEach(row => { S.set[row.key] = row.value })

       S.mine = []
       S.all = []

   GANTI dengan: */

/* ...sisa loadData() (mulai dari `if (S.me) {`) TIDAK berubah.

   b) Di loadChat(), loadPesan(), dan loadNotifs(): ubah baris pertama pengecekan.
      loadChat()  : CARI  if (!S.me) return   -> GANTI  if (!S.me || maintFrozen()) return
      loadPesan() : CARI  if (!S.me) return   -> GANTI  if (!S.me || maintFrozen()) return
      loadNotifs(): TAMBAHKAN baris ini tepat di bawah `async function loadNotifs() {`
                      if (maintFrozen()) return
   ========================================================== */


/* ==========================================================
   LANGKAH 4: Bagian "5c. NOTIFIKASI" - fungsi refreshBadges()
   TAMBAHKAN satu baris di paling akhir fungsi (sebelum kurung tutup):

     maintDraw()

   (agar tombol admin / tautan "Masuk admin" ikut berubah saat status akun berubah)
   ========================================================== */


/* ==========================================================
   LANGKAH 5: Bagian "7. TAMPILAN" - viewPengaturan()
   Di fungsi viewPengaturan(), CARI baris terakhir template (yang berisi toggle email_verif):

     ${toggle('email_verif', 'Verifikasi E-mail', '...')}`

   Biarkan baris itu, tetapi TAMBAHKAN blok di bawah ini tepat setelah baris tersebut
   (sebelum tanda ` penutup template). Contoh hasil akhirnya:

     ${toggle('email_verif', 'Verifikasi E-mail', '...')}
     <h3 style="margin:1.2rem 0 .6rem">Sistem</h3>
     <label class="setting danger">
       <input type="checkbox" id="maintenance" ${S.set.maintenance === true || S.set.maintenance === 'true' ? 'checked' : ''}>
       <span>${ico('wrench')}Mode Maintenance (tutup website sementara)<small>Hidup: semua pengguna selain admin ditutup dari website dan tidak bisa mengirim aksi apa pun ke server. Perlu 2x konfirmasi. Untuk membukanya kembali, pakai tombol kecil di pojok kiri bawah layar.</small></span>
     </label>`
   ========================================================== */


/* ==========================================================
   LANGKAH 6: Bagian "7. TAMPILAN" - tempel blok ini (fungsi baru)
   Taruh di mana saja di level paling luar, mis. tepat di bawah viewPengaturan().
   ========================================================== */

// ---------- MAINTENANCE: logika utama ----------
const MAINT_KEEP = ['maint', 'confirm', 'toasts', 'busy', 'offline']   // elemen yang TIDAK dikunci

// kunci / buka seluruh halaman di belakang layar maintenance
function maintLock(on) {
  Array.from(document.body.children).forEach(el => {
    if (el.tagName === 'SCRIPT' || MAINT_KEEP.includes(el.id)) return

    el.inert = on
    if (on) el.setAttribute('aria-hidden', 'true')
    else el.removeAttribute('aria-hidden')
  })

  document.body.classList.toggle('maint-on', on)
}

// roda gigi: lingkaran bergerigi (garis putus-putus tebal) + badan + lubang tengah
function maintGear(cx, cy, r, teeth, cls) {
  const tooth = (2 * Math.PI * r) / teeth / 2

  return `
    <g class="gear ${cls}" style="transform-origin:${cx}px ${cy}px">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="${(r * 0.34).toFixed(1)}" stroke-dasharray="${tooth.toFixed(2)} ${tooth.toFixed(2)}"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.88).toFixed(1)}" fill="currentColor"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.62).toFixed(1)}" fill="none" stroke="var(--card)" stroke-width="2" opacity=".55"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.3).toFixed(1)}" fill="var(--card)"/>
    </g>`
}

function maintHtml() {
  const word = 'MAINTENANCE  ·  SEDANG DIPERBAIKI  ·  DATA AMAN  ·  SEGERA KEMBALI  ·  '
  const strip = word.repeat(5)

  return `
    <div class="mbg" aria-hidden="true"><i class="mgrid"></i><i class="mglow g1"></i><i class="mglow g2"></i></div>
    <div class="mband top" aria-hidden="true"><div class="mmq"><span>${strip}</span><span>${strip}</span></div></div>

    <div class="mtilt">
      <div class="mcard" id="mcard" tabindex="-1">
        <svg class="mgears" viewBox="0 0 190 120" role="img" aria-label="Roda gigi berputar" style="--n:0">
          ${maintGear(62, 62, 34, 14, 'ga')}
          ${maintGear(120, 62, 22, 9, 'gb')}
          ${maintGear(143, 36, 13, 6, 'gc')}
        </svg>

        <span class="mbadge" style="--n:1"><i class="led"></i>Status: Maintenance</span>
        <h2 id="maint-t" style="--n:2">${MAINT_TITLE}<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></h2>
        <p id="maint-d" style="--n:3">${MAINT_TEXT}</p>
        <div class="mbar" style="--n:4" aria-hidden="true"><i></i></div>

        <ul class="mchips" style="--n:5">
          <li>${ico('shield')}Data kamu aman</li>
          <li>${ico('lock')}Layanan dijeda</li>
          <li>${ico('clock')}Segera kembali</li>
        </ul>

        <div class="mcheck" style="--n:6">
          <span class="hint" id="mcount" aria-live="polite"></span>
          <button type="button" class="btn ghost sm" id="mcheckbtn" data-mcheck>${ico('restart')}Cek sekarang</button>
        </div>
        <small class="hint" id="mlast" style="--n:7"></small>

        <div id="mzone" style="--n:8"></div>
      </div>
    </div>

    <div class="mband bot" aria-hidden="true"></div>
    <div class="mcorner" id="mcorner"></div>`
}

// bagian yang bergantung pada siapa yang membuka: admin = tombol pojok kiri bawah, lainnya = tautan "Masuk admin"
function maintDraw() {
  const box = $('#maint')
  if (!box || !M.shown) return

  const admin = !!maintAdmin()
  const sig = admin ? 'admin' : 'user'
  if (box.dataset.sig === sig) return
  box.dataset.sig = sig

  // tombol untuk admin TIDAK dibuat sama sekali bagi pengguna biasa (tidak ada di DOM)
  $('#mcorner').innerHTML = admin
    ? `<button type="button" class="madmin" data-mopen aria-label="Buka kembali website (khusus admin)" title="Buka kembali website (khusus admin)">${ico('wrench')}<span>Buka website</span></button>`
    : ''

  $('#mzone').innerHTML = admin
    ? ''
    : `<button type="button" class="mlink" data-madminlogin>${ico('lock')}Masuk admin</button>
       <div class="mlogin" id="mlogin"><div>
         <form id="maintlogin" autocomplete="off">
           <input name="ident" placeholder="Username atau e-mail admin" autocomplete="username" required>
           <input name="password" type="password" placeholder="Kata sandi" autocomplete="current-password" required>
           <button class="btn">Masuk</button>
           <p class="hint">Hanya akun admin yang bisa masuk saat maintenance.</p>
         </form>
       </div></div>`
}

function maintLoginToggle() {
  const panel = $('#mlogin')
  if (!panel) return

  panel.classList.toggle('open')
  if (panel.classList.contains('open')) {
    setTimeout(() => panel.querySelector('input')?.focus({ preventScroll: true }), P.potato ? 0 : 380)
  }
}

// login admin dari layar maintenance
async function maintAdminLogin(form) {
  const ident = form.ident.value.trim().toLowerCase()
  const password = form.password.value
  if (!ident || !password) return

  const tab = ident.includes('@') ? 'email' : 'username'
  let result

  M.adminAttempt = true
  M.allowLogin = true
  busy(1)

  try {
    result = await authenticate(false, tab, ident, { password })
  } finally {
    M.allowLogin = false
    busy(-1)
  }

  if (result.error) {
    M.adminAttempt = false
    return toast(friendlyError(result.error), true)
  }

  form.reset()
}

// efek miring kartu + sorotan mengikuti kursor (mati di Potato Mode)
function maintTilt(e) {
  if (P.potato) return

  const box = $('#maint')
  if (!box) return

  box.style.setProperty('--rx', ((0.5 - e.clientY / innerHeight) * 7).toFixed(2) + 'deg')
  box.style.setProperty('--ry', ((e.clientX / innerWidth - 0.5) * 9).toFixed(2) + 'deg')
  box.style.setProperty('--mx', e.clientX + 'px')
  box.style.setProperty('--my', e.clientY + 'px')
}

function maintTick() {
  const el = $('#mcount')
  if (!el || !M.on) return

  const left = Math.max(0, Math.ceil((M.next - Date.now()) / 1000))
  el.textContent = M.checking ? 'Mengecek status...' : `Pengecekan otomatis dalam ${left} dtk`

  if (left <= 0 && !M.checking) maintCheck()
}

function maintShow() {
  if (M.shown) return maintDraw()
  M.shown = true

  // tutup apa pun yang sedang terbuka
  try { closeModal() } catch (e) { }
  try { closeReader(true) } catch (e) { }
  try { setChat(false) } catch (e) { }
  try { setMenu(false) } catch (e) { }
  if (!maintAdmin()) closeAsk(false)

  let el = $('#maint')

  if (!el) {
    el = document.createElement('div')
    el.id = 'maint'
    el.className = 'maint'
    el.setAttribute('role', 'alertdialog')
    el.setAttribute('aria-modal', 'true')
    el.setAttribute('aria-labelledby', 'maint-t')
    el.setAttribute('aria-describedby', 'maint-d')
    el.innerHTML = maintHtml()
    el.addEventListener('pointermove', maintTilt, { passive: true })
    document.body.append(el)
  }

  el.dataset.sig = ''
  maintLock(true)
  maintDraw()

  void el.offsetWidth
  el.classList.add('show')

  M.next = Date.now() + MAINT_POLL
  clearInterval(M.timer)
  M.timer = setInterval(maintTick, 1000)
  maintTick()

  setTimeout(() => { try { $('#mcard').focus({ preventScroll: true }) } catch (e) { } }, 100)
}

function maintHide() {
  if (!M.shown) return
  M.shown = false
  clearInterval(M.timer)

  const el = $('#maint')
  maintLock(false)
  if (!el) return

  el.classList.remove('show')

  const done = () => { if (!M.shown) el.remove() }
  if (P.potato) done()
  else setTimeout(done, 560)
}

// terapkan status baru. reload=false dipakai loadData() (supaya data tidak dimuat dua kali)
function maintApply(on, reload = true) {
  const was = M.on === true
  M.on = !!on

  if (M.on) return maintShow()

  maintHide()

  if (was) {
    toast('Maintenance selesai. Website sudah dibuka kembali.')
    if (reload) loadData(true)
    loadChat()
    loadPesan()
    loadNotifs()
  }
}

// baca status maintenance dari server (boleh dilakukan siapa pun)
async function maintCheck(manual) {
  if (M.checking) return M.on

  M.checking = true
  M.next = Date.now() + MAINT_POLL

  const box = $('#maint')
  const btn = $('#mcheckbtn')
  if (box) box.classList.add('checking')
  if (btn) btn.disabled = true
  maintTick()

  const started = Date.now()
  let res

  try {
    res = await db.from('settings').select('value').eq('key', 'maintenance').maybeSingle()
  } catch (e) {
    res = { error: e }
  }

  // klik manual: beri jeda minimal supaya animasi pengecekan terlihat
  if (manual) await new Promise(resolve => setTimeout(resolve, Math.max(0, 700 - (Date.now() - started))))

  M.checking = false
  if (box) box.classList.remove('checking')
  if (btn) btn.disabled = false

  const last = $('#mlast')
  if (last) last.textContent = 'Terakhir dicek: ' + new Date().toLocaleTimeString('id-ID')

  if (res.error) {
    if (M.on === null) M.on = false
    if (manual) toast('Tidak bisa menghubungi server. Coba lagi sebentar lagi.', true)
    maintTick()
    return M.on
  }

  const on = !!res.data && (res.data.value === true || res.data.value === 'true')
  maintApply(on)

  if (manual && M.on) toast('Masih dalam maintenance. Mohon tunggu sebentar lagi.')
  maintTick()
  return M.on
}

// ubah status maintenance (hanya admin) dengan 2x verifikasi
async function maintToggle(turnOn) {
  if (!maintAdmin()) return toast('Hanya admin yang dapat mengubah mode maintenance', true)
  if (M.busy) return

  M.busy = true

  try {
    const first = await ask(turnOn
      ? {
        title: 'Aktifkan mode maintenance?',
        text: 'Website akan ditutup untuk semua pengguna selain admin. Mereka tidak bisa membuka halaman maupun mengirim aksi apa pun ke server.',
        yes: 'Ya, lanjut',
        no: 'Batal',
        icon: 'wrench'
      }
      : {
        title: 'Buka kembali website?',
        text: 'Mode maintenance akan dimatikan dan website bisa diakses semua pengguna lagi.',
        yes: 'Ya, lanjut',
        no: 'Batal',
        icon: 'wrench'
      })
    if (!first) return

    const second = await ask(turnOn
      ? {
        title: 'Konfirmasi terakhir',
        text: 'Yakin menutup website sekarang? Semua pengguna yang sedang online akan langsung melihat layar maintenance.',
        yes: 'Ya, tutup website',
        no: 'Batal',
        danger: true,
        icon: 'warn'
      }
      : {
        title: 'Konfirmasi terakhir',
        text: 'Yakin membuka website sekarang? Perubahan langsung berlaku untuk semua pengguna.',
        yes: 'Ya, buka website',
        no: 'Batal',
        danger: true,
        icon: 'warn'
      })
    if (!second) return

    const ok = await run(
      db.from('settings').upsert({ key: 'maintenance', value: turnOn }),
      turnOn ? 'Mode maintenance aktif. Website ditutup untuk semua pengguna.' : null
    )

    if (ok) {
      S.set.maintenance = turnOn
      maintApply(turnOn)
    }
  } finally {
    M.busy = false
  }
}

/* ---------- 2. DATA TETAP ---------- */
const KATEGORI = [
  'Fiksi', 'Novel', 'Cerpen dan Puisi', 'Komik', 'Non-Fiksi',
  'Pelajaran', 'Matematika', 'Sains', 'Teknologi', 'Sejarah',
  'Biografi', 'Bahasa', 'Agama', 'Seni dan Budaya', 'Olahraga',
  'Pengembangan Diri', 'Referensi', 'Lainnya'
]

const STATUS = {
  booking: 'Menunggu persetujuan',
  approved: 'Disetujui, ambil di perpustakaan',
  dipinjam: 'Sedang dipinjam',
  dikembalikan: 'Dikembalikan',
  selesai: 'Selesai',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan'
}

// label pendek untuk tabel admin + urutan alur status (dipakai untuk sort)
const STATUS_SHORT = {
  booking: 'Menunggu',
  approved: 'Disetujui',
  dipinjam: 'Dipinjam',
  dikembalikan: 'Dikembalikan',
  selesai: 'Selesai',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan'
}
const STATUS_ORDER = ['booking', 'approved', 'dipinjam', 'dikembalikan', 'selesai', 'ditolak', 'dibatalkan']

const SORTS = [
  ['status', 'Urutkan: status (perlu tindakan dulu)'],
  ['terbaru', 'Urutkan: pengajuan terbaru'],
  ['terlama', 'Urutkan: pengajuan terlama'],
  ['terlambat', 'Urutkan: terlambat dulu']
]

// urutan katalog buku (kunci dipakai oleh sortBooks)
const BSORTS = [
  ['terbaru', 'Urutkan: terbaru diunggah'],
  ['terlama', 'Urutkan: terlama diunggah'],
  ['diubah', 'Urutkan: terakhir diubah'],
  ['nama_az', 'Urutkan: nama A-Z'],
  ['nama_za', 'Urutkan: nama Z-A'],
  ['stok_rendah', 'Urutkan: stok terendah'],
  ['stok_tinggi', 'Urutkan: stok tertinggi'],
  ['rilis_baru', 'Urutkan: tahun terbit terbaru'],
  ['rilis_lama', 'Urutkan: tahun terbit terlama'],
  ['hal_sedikit', 'Urutkan: halaman tersedikit'],
  ['hal_banyak', 'Urutkan: halaman terbanyak'],
  ['limited', 'Urutkan: LIMITED TIME dulu']
]

const COOLDOWN_CHAT = 5000

// informasi pengambilan buku (ubah di sini jika lokasi berpindah)
const LOKASI = 'Perpustakaan SMAN 03, di samping Kelas 10.5'
const CATATAN = 'Temui penjaga perpustakaan untuk mengambil dan mengembalikan buku.'

// akun yang belum punya e-mail asli memakai alamat alias ini (tidak pernah dikirimi e-mail).
// Supabase menolak domain palsu (tanpa MX record), jadi dipakai domain nyata dengan nama acak.
// Syarat: "Confirm email" dan "Secure email change" di Supabase harus tetap MATI.
// jika satu domain ditolak Supabase, domain berikutnya dicoba otomatis
const ALIAS_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'proton.me']

// peminjaman & katalog
const DEFAULT_DAYS = 5      // durasi tetap; admin bisa menyalakan "Variasi durasi" di Pengaturan admin
const PER_PAGE = 12         // jumlah buku per halaman katalog
const EBOOK_MAX_MB = 50     // batas ukuran PDF e-book (sesuai batas Supabase gratis)
const LIMITED_HTML = ' - <span class="ltd">LIMITED TIME!</span>'

// versi website = jumlah commit di GitHub (contoh: 25 commit -> "v1.25")
const GITHUB_REPO = 'OWNER/REPO'    // <-- GANTI, contoh: 'username/pustakakita' (repo harus public)
const VERSION_MAJOR = 1
const VERSION_FALLBACK = 'v6.769'     // dipakai jika GitHub tidak bisa dihubungi / repo belum diisi
const RELEASE_ID = '2026-10-29b'    // ganti setiap rilis baru supaya tanda NEW! muncul lagi

// data tab Developer (ubah sesukamu)
const DEVELOPER = {
  name: 'Tim Ekskul Coding',
  role: 'Developer Utama: Wildan',
  contact: '',   // contoh: 'email@contoh.com'
  link: ''       // contoh: 'https://github.com/username'
}

// catatan update manual (tampil di tab Update Log, di atas riwayat commit GitHub)
// Urutan: yang terbaru di atas. Tiap rilis baru = tambah satu entri baru di paling atas,
// entri lama jangan dihapus/diubah supaya riwayatnya tetap ada. Jangan lupa ganti RELEASE_ID.
const CHANGELOG = [
  {
    title: 'Fixes & Reworked',
    date: '29 Okt 2026',
    items: [
      'Tampilan pembaca e-book modern.',
      'Tombol Layar penuh dan tombol Ukuran halaman (muat layar / isi lebar) untuk mode horizontal.',
      'Arah baca kanan-ke-kiri per e-book.',
      '[Fix] Penanda otomatis tidak lagi terlihat saat membaca; baru terlihat ketika e-book dibuka kembali.',
      'Ikon baru yang lebih modern.'
    ]
  },
  {
    title: 'BIG UPDATE: E-Book, Notifikasi & Setelan',
    date: '29 Okt 2026',
    items: [
      'E-Book: jenis buku baru selain Buku Fisik. Bisa dibaca online atau diunduh (PDF).',
      'Katalog dipisah per jenis: tab Buku Fisik dan E-Book.',
      'Pembaca e-book kustom: mode Horizontal (geser halaman) dan Vertikal (gulir) yang berganti otomatis saat HP diputar, plus zoom dan slider halaman.',
      'Penanda halaman e-book: otomatis di halaman terakhir dibuka, atau tandai manual (penanda manual membatalkan yang otomatis).',
      'Setelan (Settings): biodata, tema, Potato Mode, mode baca, dan lainnya (info & tema tetap ada di header).',
      'Potato Mode!: mematikan animasi dan efek berat untuk perangkat lama.',
      '[ Lebih banyak ANIMASI ] (bisa dimatikan lewat Potato Mode).',
      'Tab Notifikasi: riwayat notifikasi, ketuk untuk menandai dibaca, tandai semua dibaca, tahan untuk menghapus.',
    ]
  },
  {
    title: 'Perbaikan daftar Pesan di HP',
    date: '24 Okt 2026',
    items: [
      'Perbaikan: daftar chat di halaman Pesan (tampilan HP) yang melebar keluar layar, sehingga jam/tanggal terpotong.'
    ]
  },
  {
    title: 'Menu slide di HP',
    date: '24 Okt 2026',
    items: [
      'Tampilan HP: menu navigasi kini berupa panel slide dari kiri (tombol ☰ di kiri logo PustakaKita) sehingga header lebih rapi.',
      'Informasi (!), ganti tema, dan akun dipindah ke dalam menu slide di HP; angka notifikasi tampil di tombol ☰.'
    ]
  },
  {
    title: 'Perbaikan Pesan di HP',
    date: '24 Okt 2026',
    items: [
      'Perbaikan: chat di halaman Pesan (tampilan HP) yang kadang tampil kosong saat dibuka di sebagian perangkat.'
    ]
  },
  {
    title: 'Pembaruan besar',
    date: '23 Okt 2026',
    items: [
      'Sistem Halaman Katalog',
      'Urutan Buku-Buku Katalog',
      'Tahun Terbit & Jumlah Halaman Buku',
      '[ADMIN] kini tahu siapa admin yang membalas Chat Customer Service dan Pesan.',
      'Kelola peminjaman: urutkan & filter status, plus waktu pengajuan.',
      'Bubble angka notifikasi di Chat Customer Service, Pesan, Pinjaman saya, dan Kelola peminjaman.',
      'Label versi website dari jumlah commit GitHub dan menu Informasi (!).',
      'Peminjaman yang sudah dikembalikan otomatis ditandai selesai setelah 24 jam.',
      'User bisa mengajukan pengembalian kapan saja saat sedang meminjam.',
      'Peringatan tetap di akun (dan e-mail) untuk buku yang terlambat dikembalikan.',
      'Daftar pesan ala WhatsApp di HP dengan chat layar penuh.',
      'Durasi pinjam tetap 5 hari; [ADMIN] bisa menyalakan variasi durasi.',
      'Katalog kini berhalaman.',
      'Label LIMITED TIME untuk buku tertentu.',
      'Tombol konfirmasi kustom (Ya / Batal) menggantikan kotak konfirmasi bawaan browser.',
      'Buku kini punya Tahun Terbit dan Jumlah Halaman (tampil di katalog dan detail buku).',
      'Katalog bisa diurutkan: stok, nama, tahun terbit, jumlah halaman, tanggal unggah, dan terakhir diubah.',
      'Kategori baru: Novel, Cerpen dan Puisi, Matematika, Teknologi, Seni dan Budaya, Olahraga, Pengembangan Diri, Referensi.'
    ]
  }
]


/* ---------- 3. STATE ---------- */
const S = {
  me: null,        // profil user yang login
  books: [],       // semua buku
  mine: [],        // peminjaman MILIK user yang login saja
  all: [],         // semua peminjaman (khusus admin)
  msgs: [],        // pesan chat
  view: 'katalog',
  q: '',
  cat: '',
  f: '',
  thread: null,    // admin: id user yang sedang dibuka chat-nya
  lastSend: 0,
  chatOpen: false,
  set: { multi_book: false, multi_rent: false, email_verif: false, duration_var: false },  // pengaturan admin
  chats: [],       // percakapan peminjaman (halaman Pesan)
  cmsgs: [],
  chatSel: null,
  draft: '',
  pLoad: false,    // true saat chat Pesan sedang dimuat ulang
  authTab: 'username',  // tab form masuk/daftar: 'username' atau 'email'
  authReg: 0,
  flow: null,      // langkah kode e-mail yang sedang berjalan
  cancel: null,    // data pembatalan yang sedang diproses
  reopen: false,   // user memulai chat baru setelah diakhiri
  page: 1,         // halaman katalog
  bsort: 'terbaru', // urutan katalog buku
  kind: (() => { try { return localStorage.getItem('katalog-jenis') === 'ebook' ? 'ebook' : 'fisik' } catch (e) { return 'fisik' } })(),  // katalog aktif: 'fisik' | 'ebook'
  notifs: [],      // riwayat notifikasi akun ini
  notifErr: false, // true jika tabel notifications belum ada
  notifsReady: false,
  nf: 'all',       // filter notifikasi: 'all' | 'unread'
  sort: 'status',  // urutan tabel Kelola peminjaman
  sf: '',          // filter status Kelola peminjaman
  seen: {},        // penanda "sudah dilihat" untuk bubble notifikasi (disimpan per akun di perangkat)
  pOpen: false,    // mode HP: chat Pesan terbuka layar penuh
  lastAuto: 0,     // terakhir kali "selesai otomatis" dijalankan
  infoTab: 'about' // tab menu Informasi
}

const SPINNER = '<div class="loadwrap"><div class="spinner"></div></div>'


/* ---------- 4. HELPER ---------- */
const $ = selector => document.querySelector(selector)

/* ---------- 4a. IKON SVG (pengganti emoji pada tombol & antarmuka) ---------- */
// Semua ikon memakai garis tipis 24x24 dan mengikuti warna teks (currentColor).
const ICON = {
  book: '<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H10a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H3.5A1.5 1.5 0 0 1 2 16.5z"/><path d="M22 4.5A1.5 1.5 0 0 0 20.5 3H14a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h6.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  tablet: '<rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M11 18h2"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  minimize: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  fitwidth: '<path d="M3 4v16M21 4v16M7 12h10M7 12l3-3M7 12l3 3M17 12l-3-3M17 12l-3 3"/>',
  fitscreen: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="8" y="7" width="8" height="10" rx="1"/>',
  horiz: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  vert: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  auto: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M3 21v-5h5M21 3v5h-5"/>',
  dirltr: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  dirrtl: '<path d="M20 12H4M10 6l-6 6 6 6"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  clip: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.6-.3-1-.5-1.4-.3-.5-.5-.9-.5-1.4 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="10" cy="7" r=".8"/><circle cx="15" cy="7.5" r=".8"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  warn: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17.5v.01"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  inbox: '<path d="M4 13h5l1 3h4l1-3h5"/><path d="M4 13 6.5 5h11L20 13v6H4z"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.5-.6-.6-2.5z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'
}

// ico('book') -> <svg>. Tambahkan 'fill' sebagai argumen ke-2 untuk ikon terisi.
const ico = (name, extra = '') =>
  `<svg class="ic ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`



function esc(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(text ?? '').replace(/[&<>"']/g, c => map[c])
}

function fmtDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// hari ini: jam saja; selain itu: tanggal singkat
function fmtShort(d) {
  const x = new Date(d)
  if (x.toDateString() === new Date().toDateString()) return fmtTime(d)
  return x.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

const kindOf = b => (b && b.kind === 'ebook' ? 'ebook' : 'fisik')

// "5 mnt lalu", "2 jam lalu", ...
function timeAgo(d) {
  const sec = Math.round((Date.now() - new Date(d)) / 1000)
  if (sec < 45) return 'baru saja'

  const min = Math.round(sec / 60)
  if (min < 60) return min + ' mnt lalu'

  const hour = Math.round(min / 60)
  if (hour < 24) return hour + ' jam lalu'

  const day = Math.round(hour / 24)
  if (day < 7) return day + ' hari lalu'

  return fmtDate(d)
}

function isLate(loan) {
  return loan.status === 'dipinjam' && new Date(loan.due_at) < new Date()
}

function daysLate(loan) {
  return Math.max(1, Math.ceil((Date.now() - new Date(loan.due_at)) / 86400000))
}

function isMobile() {
  return matchMedia('(max-width: 700px)').matches
}

// label stok (+ LIMITED TIME kuning jika buku ditandai limited dan stok masih ada)
function stockLabel(b) {
  if (b.kind === 'ebook') return `<em class="ok">${ico('tablet')}Baca online</em>`

  const limited = b.limited && b.stock > 0 ? LIMITED_HTML : ''
  return `<em class="${b.stock ? 'ok' : 'no'}">${b.stock ? 'Stok ' + b.stock + limited : 'Stok habis'}</em>`
}

// tahun terbit & jumlah halaman: baris kecil di kartu katalog (kosong jika belum diisi)
function bookMeta(b) {
  const year = +b.publish_year
  const pages = +b.pages
  const parts = []

  if (year > 0) parts.push(year)
  if (pages > 0) parts.push(pages.toLocaleString('id-ID') + ' hlm')

  return parts.length ? `<small class="bmeta">${parts.join(' · ')}</small>` : ''
}

// tahun terbit & jumlah halaman: dua kotak info di detail buku
function bookFacts(b) {
  const year = +b.publish_year
  const pages = +b.pages
  const items = []

  if (year > 0) items.push(['calendar', year, 'Tahun terbit'])
  if (pages > 0) items.push(['file', pages.toLocaleString('id-ID'), 'Halaman'])

  return items.length
    ? `<div class="facts">${items.map(([icon, value, label]) =>
      `<div><span aria-hidden="true">${ico(icon)}</span><b>${value}</b><small>${label}</small></div>`).join('')}</div>`
    : ''
}

// nama pengirim pesan. Admin bisa melihat NAMA admin yang membalas; user hanya melihat "Admin".
function senderLabel(m, isAdmin, userName) {
  if (!m.from_admin) return esc(userName)
  return isAdmin && m.sender_name ? 'Admin · ' + esc(m.sender_name) : 'Admin'
}

function toast(message, isError) {
  const el = document.createElement('div')
  el.className = 'toast' + (isError ? ' err' : '')
  el.textContent = message
  $('#toasts').append(el)
  setTimeout(() => el.remove(), 3200)
}

let busyCount = 0

function busy(delta) {
  busyCount += delta
  $('#busy').hidden = busyCount <= 0
}

function friendlyError(error) {
  const msg = error.message || ''

  if (error.code === '23505') {
    return /loans_active_uq/.test(msg)
      ? 'Kamu sudah booking atau meminjam buku ini'
      : 'Username atau e-mail itu sudah dipakai'
  }
  if (/invalid login credentials/i.test(msg)) return 'Username/e-mail atau kata sandi salah'
  if (/already (been )?registered/i.test(msg)) return 'E-mail sudah dipakai akun lain'
  if (/signups not allowed/i.test(msg)) return 'E-mail ini belum terdaftar atau belum terverifikasi'
  if (/database error saving new user/i.test(msg)) return 'Username atau e-mail sudah dipakai'
  if (/email address .* is invalid/i.test(msg)) return 'Supabase menolak e-mail: ' + msg
  return msg
}

async function run(promise, successMessage) {
  busy(1)
  const { error } = await promise
  busy(-1)

  if (error) {
    toast(friendlyError(error), true)
    return false
  }

  if (successMessage) toast(successMessage)
  return true
}


/* ---------- 4b. DIALOG KONFIRMASI KUSTOM (pengganti confirm() bawaan browser) ---------- */
// Cara pakai (di dalam fungsi async):
//   if (!(await ask({ title: 'Hapus?', text: 'Yakin?', yes: 'Ya, hapus', danger: true }))) return
//
// Opsi:
//   title   judul dialog              (default 'Konfirmasi')
//   text    isi pesan
//   yes     teks tombol setuju        (default 'Ya')
//   no      teks tombol batal         (default 'Batal'; isi false untuk menyembunyikannya = dialog info)
//   danger  true = tombol & ikon merah, fokus awal di tombol batal (aksi berbahaya)
//   icon    emoji pengganti ikon bawaan
// Hasil: true jika menekan tombol setuju, false jika batal / Esc / klik di luar kotak.
let askDone = null     // fungsi resolve milik dialog yang sedang terbuka
let askFocus = null    // elemen yang fokus sebelum dialog dibuka (dikembalikan saat ditutup)
let askAt = 0          // waktu dialog dibuka (klik latar 0,4 dtk pertama diabaikan)

function ask(options) {
  const o = typeof options === 'string' ? { text: options } : options

  // jika masih ada dialog terbuka, tutup dulu sebagai "batal"
  if (askDone) closeAsk(false)

  const noButton = o.no === false
    ? ''
    : `<button type="button" class="btn ghost" data-cfm="no">${esc(o.no || 'Batal')}</button>`

  $('#confirm').innerHTML = `
    <div class="cbox ${o.danger ? 'danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="cfm-title" aria-describedby="cfm-text">
      <div class="cicon" aria-hidden="true">${ico(o.icon || (o.danger ? 'warn' : 'help'))}</div>
      <h3 id="cfm-title">${esc(o.title || 'Konfirmasi')}</h3>
      <p id="cfm-text">${esc(o.text)}</p>
      <div class="cact">
        ${noButton}
        <button type="button" class="btn ${o.danger ? 'danger' : ''}" data-cfm="yes">${esc(o.yes || 'Ya')}</button>
      </div>
    </div>`

  return new Promise(resolve => {
    askDone = resolve
    askAt = Date.now()
    askFocus = document.activeElement
    $('#confirm').classList.add('open')

    // aksi berbahaya: fokus awal di "Batal" supaya Enter tidak langsung menghapus
    const first = o.danger && o.no !== false ? '[data-cfm="no"]' : '[data-cfm="yes"]'
    setTimeout(() => $('#confirm').querySelector(first)?.focus(), 50)
  })
}

function closeAsk(result) {
  if (!askDone) return

  const done = askDone
  askDone = null
  $('#confirm').classList.remove('open')

  try {
    askFocus?.focus({ preventScroll: true })
  } catch (e) { }
  askFocus = null

  done(result)
}

document.addEventListener('click', e => {
  if (!askDone) return

  // klik area gelap di luar kotak = batal
  if (e.target.id === 'confirm') return Date.now() - askAt < 400 ? undefined : closeAsk(false)

  const button = e.target.closest('[data-cfm]')
  if (button) closeAsk(button.dataset.cfm === 'yes')
})

document.addEventListener('keydown', e => {
  if (!askDone) return

  if (e.key === 'Escape') {
    e.preventDefault()
    return closeAsk(false)
  }

  // Tab hanya berputar di antara tombol dialog
  if (e.key === 'Tab') {
    e.preventDefault()

    const buttons = [...$('#confirm').querySelectorAll('button')]
    const index = buttons.indexOf(document.activeElement)
    const next = e.shiftKey
      ? (index <= 0 ? buttons.length - 1 : index - 1)
      : (index + 1) % buttons.length

    buttons[next].focus()
  }
})


/* ---------- 4c. SETELAN PERANGKAT (Potato Mode, mode baca, dll) ---------- */
// Disimpan di localStorage perangkat ini (bukan per akun).
const PREF_KEY = 'setelan'
const PREF_DEFAULT = { potato: false, readMode: 'auto', fit: 'screen', resume: true, wake: true, notifToast: true }

function loadPrefs() {
  try {
    return { ...PREF_DEFAULT, ...JSON.parse(localStorage.getItem(PREF_KEY)) }
  } catch (e) {
    return { ...PREF_DEFAULT }
  }
}

let P = loadPrefs()

function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(P))
  } catch (e) { }
}

// Potato Mode: class "potato" di <html> mematikan semua animasi lewat CSS
function applyPrefs() {
  document.documentElement.classList.toggle('potato', !!P.potato)
}

applyPrefs()


/* ---------- 5. TEMA (satu tombol ikon) ---------- */
const THEMES = [
  { name: 'ungu', icon: 'palette' },
  { name: 'gelap', icon: 'moon' },
  { name: 'terang', icon: 'sun' }
]

function setTheme(name) {
  const theme = THEMES.find(t => t.name === name) || THEMES[0]

  document.documentElement.dataset.theme = theme.name
  $('#theme').innerHTML = ico(theme.icon)
  $('#theme').title = 'Tema ' + theme.name + ' (klik untuk ganti)'
  drawDrawerFoot()
  document.querySelectorAll('[data-settheme]').forEach(b => b.classList.toggle('on', b.dataset.settheme === theme.name))

  try {
    localStorage.setItem('tema', theme.name)
  } catch (e) { }
}

function cycleTheme(button) {
  const current = document.documentElement.dataset.theme
  const index = THEMES.findIndex(t => t.name === current)
  const next = THEMES[(index + 1) % THEMES.length].name

  // ikon berputar
  button.classList.remove('spin')
  void button.offsetWidth
  button.classList.add('spin')

  // warna baru menyebar seperti gelombang dari tombol
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduce || P.potato) return setTheme(next)

  const box = button.getBoundingClientRect()
  document.documentElement.style.setProperty('--tx', box.left + box.width / 2 + 'px')
  document.documentElement.style.setProperty('--ty', box.top + box.height / 2 + 'px')
  document.startViewTransition(() => setTheme(next))
}

let savedTheme = 'ungu'
try {
  savedTheme = localStorage.getItem('tema') || 'ungu'
} catch (e) { }

setTheme(savedTheme)


/* ---------- 5b. AKUN TERSIMPAN DI PERANGKAT ---------- */
// Yang disimpan hanya token sesi (bukan password), di localStorage perangkat ini.
const ACC_KEY = 'akun-tersimpan'

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(ACC_KEY)) || []
  } catch (e) {
    return []
  }
}

function writeSaved(list) {
  try {
    localStorage.setItem(ACC_KEY, JSON.stringify(list))
  } catch (e) { }
}

function saveAccount(session, profile) {
  const entry = {
    id: session.user.id,
    name: profile.name,
    email: profile.email || '',
    username: profile.username || '',
    role: profile.role,
    access_token: session.access_token,
    refresh_token: session.refresh_token
  }

  const list = loadSaved()
  const index = list.findIndex(a => a.id === entry.id)

  if (index >= 0) list[index] = entry
  else list.push(entry)

  writeSaved(list)
}

async function switchAccount(id) {
  const account = loadSaved().find(a => a.id === id)
  if (!account) return
  if (account.id === S.me?.id) return closeModal()

  const { error } = await db.auth.setSession({
    access_token: account.access_token,
    refresh_token: account.refresh_token
  })

  if (error) {
    writeSaved(loadSaved().filter(a => a.id !== id))
    toast('Sesi ' + account.name + ' sudah berakhir, silakan masuk lagi', true)
    return openAccounts()
  }

  closeModal()
  toast('Berpindah ke ' + account.name)
}

async function forgetAccount(id) {
  if (!id) return

  writeSaved(loadSaved().filter(a => a.id !== id))

  if (id === S.me?.id) {
    await db.auth.signOut({ scope: 'local' })
    toast('Kamu sudah keluar')
    return closeModal()
  }

  openAccounts()
}


/* ---------- 5c. NOTIFIKASI (bubble angka) ---------- */
// "Sudah dilihat" disimpan per akun di localStorage perangkat ini.
// Pesan/pinjaman yang lebih baru dari penanda dihitung sebagai notifikasi baru.
const seenKey = () => 'seen-' + S.me.id

function loadSeen() {
  try {
    S.seen = JSON.parse(localStorage.getItem(seenKey())) || {}
  } catch (e) {
    S.seen = {}
  }
}

function setSeen(key, value) {
  if (S.seen[key] === value) return
  S.seen[key] = value

  try {
    localStorage.setItem(seenKey(), JSON.stringify(S.seen))
  } catch (e) { }
}

function isNew(key, time) {
  const seen = S.seen[key]
  return !seen || new Date(time) > new Date(seen)
}

function lastTime(list) {
  return list.length ? list[list.length - 1].created_at : null
}

const loanSig = l => l.status + (isLate(l) ? '!' : '')

// pesan Chat Customer Service yang belum dibaca
function csUnread() {
  if (!S.me) return 0
  const isAdmin = S.me.role === 'admin'

  return S.msgs.filter(m =>
    !m.ended && m.from_admin !== isAdmin && isNew('cs:' + m.user_id, m.created_at)
  ).length
}

function unreadIn(chatId) {
  const isAdmin = S.me.role === 'admin'

  return S.cmsgs.filter(m =>
    m.chat_id === chatId && !m.sys && m.from_admin !== isAdmin && isNew('pc:' + chatId, m.created_at)
  ).length
}

// pesan peminjaman yang belum dibaca (semua chat yang tidak disembunyikan)
function pesanUnread() {
  if (!S.me) return 0
  const isAdmin = S.me.role === 'admin'

  return S.chats
    .filter(c => isAdmin ? !c.hidden_admin : !c.hidden_user)
    .reduce((sum, c) => sum + unreadIn(c.id), 0)
}

// user: terlambat (tetap ada sampai buku dikembalikan) + perubahan status baru dari admin
function sayaCount() {
  const late = S.mine.filter(isLate).length

  const changed = S.mine.filter(l =>
    !isLate(l) && !['booking', 'dibatalkan'].includes(l.status) && S.seen['loan:' + l.id] !== loanSig(l)
  ).length

  return late + changed
}

// admin: booking menunggu + permintaan pengembalian dari user
function adminCount() {
  return S.all.filter(l => l.status === 'booking' || (l.status === 'dipinjam' && l.return_requested_at)).length
}

function markSayaSeen() {
  S.mine.forEach(l => setSeen('loan:' + l.id, loanSig(l)))
}

// pertama kali di perangkat ini: anggap semua yang sudah ada sebagai "sudah dilihat"
function initSeen() {
  if (!S.me || S.seen._init) return

  S.msgs.forEach(m => setSeen('cs:' + m.user_id, m.created_at))
  S.cmsgs.forEach(m => setSeen('pc:' + m.chat_id, m.created_at))
  markSayaSeen()
  setSeen('_init', 1)
  refreshBadges()
}

function nb(n) {
  return n > 0 ? `<i class="nb">${n > 99 ? '99+' : n}</i>` : ''
}

let navTotal = 0   // jumlah semua bubble angka di menu (ditampilkan di tombol hamburger)

function renderNav() {
  const me = S.me
  const isAdmin = me?.role === 'admin'

  const menu = [['katalog', 'Katalog', 0]]
  if (me && !isAdmin) menu.push(['saya', 'Pinjaman saya', sayaCount()])
  if (me) menu.push(['pesan', 'Pesan', pesanUnread()], ['notif', 'Notifikasi', notifUnread()])
  if (isAdmin) menu.push(['admin', 'Kelola peminjaman', adminCount()], ['pengaturan', 'Pengaturan admin', 0])

  $('#nav').innerHTML = menu
    .map(([key, label, n], i) => `<button class="${S.view === key ? 'on' : ''}" data-v="${key}" style="--i:${i}">${label}${nb(n)}</button>`)
    .join('')

  navTotal = menu.reduce((sum, m) => sum + m[2], 0)
  drawHamb()
  drawDrawerFoot()
}

// tombol hamburger (HP): angka notifikasi, atau titik merah jika ada update log baru
function drawHamb() {
  const btn = $('#hamb')
  if (!btn) return

  const badge = $('#hamb-nb')
  badge.textContent = navTotal > 99 ? '99+' : navTotal
  badge.hidden = navTotal <= 0

  btn.classList.toggle('hasnew', navTotal <= 0 && infoHasNew())
}

// bagian bawah menu slide (HP): akun, Informasi, tema. Di layar lebar bagian ini tersembunyi.
function drawDrawerFoot() {
  const box = $('#dfoot')
  if (!box) return

  const me = S.me
  const theme = THEMES.find(t => t.name === document.documentElement.dataset.theme) || THEMES[0]

  const account = me
    ? `<button class="dbtn acc" data-accounts>
         <span class="ava">${esc(me.name[0] || '?').toUpperCase()}</span>
         <span class="dname">${esc(me.name)}${me.role === 'admin' ? ' <b class="chip">admin</b>' : ''}</span>
       </button>`
    : `<button class="dbtn acc" data-accounts>${ico('user')}Masuk / Daftar</button>`

  const base = ($('#nav') && $('#nav').children.length) || 0

  box.innerHTML = `
    ${account}
    <button class="dbtn" data-v="setelan" style="--i:${base + 1}"><span>${ico('settings')}Setelan</span></button>
    <button class="dbtn" data-info="about" style="--i:${base + 2}"><span>${ico('info')}Informasi</span>${infoHasNew() ? '<i class="newtag">NEW!</i>' : ''}</button>
    <button class="dbtn" data-themebtn style="--i:${base + 3}"><span>${ico(theme.icon)}Tema ${esc(theme.name)}</span><small>ketuk untuk ganti</small></button>`
}

// buka / tutup menu slide (HP)
function setMenu(open) {
  const was = document.body.classList.contains('menu-open')

  document.body.classList.toggle('menu-open', open)
  $('#hamb')?.setAttribute('aria-expanded', String(open))

  if (open) setTimeout(() => $('.drawer-x')?.focus({ preventScroll: true }), 320)
  else if (was) $('#hamb')?.focus({ preventScroll: true })
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !askDone) setMenu(false)
})

// kembali ke layar lebar: tutup panel supaya tidak tertinggal terbuka
matchMedia('(min-width: 1101px)').addEventListener?.('change', e => {
  if (e.matches) setMenu(false)
})

// peringatan tetap untuk user yang terlambat mengembalikan buku
function drawAlerts() {
  const box = $('#alerts')
  if (!box) return

  const late = S.me && S.me.role !== 'admin' ? S.mine.filter(isLate) : []
  box.hidden = !late.length

  box.innerHTML = late.length
    ? `<div class="alertbar">
         <span>${ico('warn')} Kamu terlambat mengembalikan ${late.length > 1 ? late.length + ' buku' : 'buku'}:
           <b>${late.map(l => `${esc(l.books?.title)} (${daysLate(l)} hari)`).join(', ')}</b>.
           Segera kembalikan ke perpustakaan.</span>
         <button class="btn sm" data-v="saya">Lihat</button>
       </div>`
    : ''
}

function refreshBadges() {
  renderNav()
  drawAlerts()
 
  const n = csUnread()
  const badge = $('#bubble-nb')
 
  if (badge) {
    badge.textContent = n > 99 ? '99+' : n
    badge.hidden = n <= 0
  }
 
  maintDraw()
}


/* ---------- 6. AMBIL DATA ---------- */
async function loadData(animate) {
  // pengaturan dibaca PERTAMA (boleh dibaca saat maintenance) supaya status maintenance langsung diterapkan
  const settings = await db.from('settings').select('*')
  S.set = { multi_book: false, multi_rent: false, email_verif: false, duration_var: false, maintenance: false }
    ; (settings.data || []).forEach(row => { S.set[row.key] = row.value })
 
  // gagal membaca (mis. jaringan putus): status maintenance tidak diubah
  if (!settings.error) maintApply(S.set.maintenance === true || S.set.maintenance === 'true', false)
 
  // maintenance & bukan admin: tidak mengambil data apa pun dari server
  if (maintFrozen()) return render(animate)
 
  const books = await db.from('books').select('*').order('created_at', { ascending: false })
  S.books = books.data || []
 
  S.mine = []
  S.all = []

  if (S.me) {
    // peminjaman yang sudah dikembalikan > 24 jam otomatis jadi "selesai" (dicek tiap 5 menit)
    if (Date.now() - S.lastAuto > 300000) {
      S.lastAuto = Date.now()
      await db.rpc('auto_finish_loans')
    }

    const fields = '*,books(title),profiles(name)'

    // peminjaman milik sendiri (disaring berdasarkan user_id)
    const mine = await db.from('loans').select(fields)
      .eq('user_id', S.me.id)
      .order('created_at', { ascending: false })
    S.mine = mine.data || []

    // semua peminjaman, hanya untuk admin
    if (S.me.role === 'admin') {
      const all = await db.from('loans').select(fields)
        .order('created_at', { ascending: false })
      S.all = all.data || []
    }
  }

  render(animate)
}

async function loadChat() {
if (!S.me || maintFrozen()) return

  const { data } = await db.from('messages')
    .select('*,profiles(name)')
    .order('created_at')
  S.msgs = data || []

  if (S.chatOpen) drawChat()
  refreshBadges()
}


async function loadPesan(showSpinner) {
if (!S.me || maintFrozen()) return

  if (showSpinner) {
    S.pLoad = true
    if (S.view === 'pesan') drawPesan()
  }

  const chats = await db.from('loan_chats')
    .select('*,loans(code,books(title)),profiles(name)')
    .order('created_at', { ascending: false })
  const msgs = await db.from('loan_msgs').select('*').order('created_at')

  S.chats = chats.data || []
  S.cmsgs = msgs.data || []
  S.pLoad = false

  if (S.view === 'pesan') drawPesan()
  refreshBadges()
}


/* ---------- 7. TAMPILAN ---------- */

const pAnim = {
  chat: null,     // id chat yang pesannya terakhir digambar (null = belum / harus dianimasikan ulang)
  n: 0,           // jumlah pesan yang sudah digambar di chat itu
  list: false,    // daftar chat sudah pernah tampil (supaya animasi bergantian tidak diulang)
  slide: false,   // HP: chat baru saja dibuka -> animasi geser masuk
  missed: 0,      // pesan baru yang masuk saat pembaca menggulir ke atas
  lock: 0         // jeda singkat setelah gulir otomatis (supaya tombol turun tidak berkedip)
}

// gerak aktif? (mati jika Potato Mode atau perangkat meminta gerak dikurangi)
const pMotion = () => !P.potato && !matchMedia('(prefers-reduced-motion: reduce)').matches

// dipanggil saat masuk ke halaman Pesan
function pesanEnter() {
  pAnim.chat = null
  pAnim.n = 0
  pAnim.list = false
  pAnim.slide = false
  pAnim.missed = 0
  pAnim.lock = 0
}

function viewPesan() {
  return `
    <div class="pesan">
      <aside id="plist"></aside>
      <section class="ppanel">
        <div class="phead" id="phead"></div>
        <div class="pwrap">
          <div id="pmsgs"></div>
          <button type="button" class="pdown" id="pdown" data-pdown aria-label="Ke pesan terbaru">${ico('down')}<i class="nb" id="pdown-nb" hidden></i></button>
        </div>
        <div id="pend" class="cnew" hidden>
          <span class="hint">Percakapan telah diakhiri. Riwayat tetap tersimpan sampai kamu menghapusnya.</span>
          <button class="btn ghost sm" data-pdel>Hapus dari daftarku</button>
        </div>
        <form id="pf" hidden>
          <input id="pbody" name="body" placeholder="Tulis pesan" maxlength="1000" autocomplete="off">
          <button class="btn">Kirim</button>
        </form>
      </section>
    </div>`
}

// awalan pratinjau pesan terakhir di daftar chat
function previewPrefix(m, isAdmin) {
  if (isAdmin) {
    if (!m.from_admin) return ''
    return (m.sender_name && m.sender_name !== S.me.name ? m.sender_name : 'Kamu') + ': '
  }
  return m.from_admin ? '' : 'Kamu: '
}

// Memperbarui daftar chat TANPA membangun ulang semuanya, supaya transisi CSS
// (penanda terpilih, hover) tetap berjalan dan animasi masuk tidak terulang.
function patchPlist(chats, itemOf) {
  const box = $('#plist')

  if (!chats.length) {
    box.innerHTML = '<p class="hint">Belum ada pesan. Chat dibuat otomatis saat admin menyetujui bookingmu.</p>'
    return
  }

  // buang teks kosong ("Belum ada pesan") bila sebelumnya ada
  box.querySelectorAll(':scope > :not(.pitem)').forEach(n => n.remove())

  const fresh = !box.querySelector('.pitem')   // daftar baru dibuat (belum ada baris sama sekali)
  const old = new Map([...box.querySelectorAll(':scope > .pitem')].map(el => [el.dataset.pchat, el]))
  const ids = new Set(chats.map(c => String(c.id)))

  old.forEach((el, id) => { if (!ids.has(id)) el.remove() })

  chats.forEach((c, i) => {
    const it = itemOf(c)
    let el = old.get(String(c.id))

    if (!el) {
      el = document.createElement('button')
      el.type = 'button'
      el.className = 'pitem'
      el.dataset.pchat = c.id
      el.style.setProperty('--i', Math.min(i, 12))

      // pertama kali masuk: muncul bergantian. Chat baru di daftar yang sudah ada: "pop".
      // Daftar yang hanya dibangun ulang (mis. data lain berubah): tanpa animasi.
      if (fresh && !pAnim.list) el.classList.add('pstag')
      else if (!fresh) el.classList.add('pnew')

      el.innerHTML = it.html
      el._sig = it.html
      el._stamp = it.stamp
    } else if (el._sig !== it.html) {
      const hasNewMsg = el._stamp !== it.stamp

      el.innerHTML = it.html
      el._sig = it.html
      el._stamp = it.stamp

      // ada pesan baru di chat ini: baris berkilat sebentar
      if (hasNewMsg) {
        el.classList.remove('pflash')
        void el.offsetWidth
        el.classList.add('pflash')
      }
    }

    el.classList.toggle('on', c.id === S.chatSel)
    el.classList.toggle('unread', it.unread > 0)

    if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null)
  })
}

function drawPesan() {
  if (!$('#plist')) return

  const isAdmin = S.me.role === 'admin'
  const mobile = isMobile()
  const chats = S.chats.filter(c => isAdmin ? !c.hidden_admin : !c.hidden_user)

  if (!chats.some(c => c.id === S.chatSel)) S.chatSel = chats[0]?.id || null
  const cur = chats.find(c => c.id === S.chatSel)
  if (!cur) S.pOpen = false

  const msgsOf = id => S.cmsgs.filter(m => m.chat_id === id)
  const list = cur ? msgsOf(cur.id) : []

  // chat yang sedang terlihat dianggap sudah dibaca
  // (dilakukan SEBELUM daftar digambar supaya angka belum dibaca langsung hilang)
  if (cur && (!mobile || S.pOpen)) {
    const latest = lastTime(list)
    if (latest) setSeen('pc:' + cur.id, latest)
  }

  // daftar percakapan (gaya WhatsApp): judul, pratinjau, jam, jumlah belum dibaca
  patchPlist(chats, c => {
    const last = [...msgsOf(c.id)].reverse().find(m => !m.sys)
    const who = isAdmin ? (c.profiles?.name || '?') : 'Admin perpustakaan'
    const unread = unreadIn(c.id)

    return {
      unread,
      stamp: (last ? (last.id ?? last.created_at) : '') + '|' + (c.ended ? 1 : 0),
      html: `
        <span class="ava">${esc(who[0] || '?').toUpperCase()}</span>
        <div class="pi">
          <div class="pr"><b>${esc(c.loans?.books?.title)}</b><small>${last ? fmtShort(last.created_at) : ''}</small></div>
          <div class="pr">
            <span class="pp">${esc(who)}${c.ended ? ' · berakhir' : ''}${last ? ' · ' + esc(previewPrefix(last, isAdmin) + last.body) : ''}</span>
            ${nb(unread)}
          </div>
        </div>`
    }
  })

  // admin: lihat siapa admin yang terakhir membalas
  let replyInfo = ''
  if (cur && isAdmin) {
    const reply = [...list].reverse().find(m => m.from_admin && !m.sys)
    replyInfo = reply
      ? ` · dibalas terakhir oleh <b>${esc(reply.sender_name || 'admin')}</b>`
      : ' · belum dibalas'
  }

  // pindah ke chat lain = judul ikut beranimasi
  const swap = !S.pLoad && !!cur && pAnim.chat !== cur.id

  $('#phead').innerHTML = cur
    ? `<button class="back" data-pback aria-label="Kembali ke daftar pesan">${ico('left')}</button>
       <div class="ptitle${swap ? ' pswap' : ''}">
         <b>${esc(cur.loans?.books?.title)}</b>
         <small class="hint">${isAdmin ? esc(cur.profiles?.name) + ' · ' : ''}Kode ${esc(cur.loans?.code)}${replyInfo}</small>
       </div>
       ${isAdmin && !cur.ended ? `<button class="btn danger sm${swap ? ' pswap' : ''}" data-pend="${cur.id}">Akhiri percakapan</button>` : ''}`
    : ''

  // mode HP: chat dibuka layar penuh setelah salah satu percakapan diklik
  const wrap = $('.pesan')
  const opened = mobile && S.pOpen && !!cur

  wrap.classList.toggle('open', opened)
  if (opened && pAnim.slide) wrap.classList.add('slide')   // geser masuk hanya saat baru dibuka
  if (!opened) wrap.classList.remove('slide', 'closing')
  pAnim.slide = false

  $('#pf').hidden = !cur || cur.ended
  $('#pend').hidden = !(cur && cur.ended)
  $('#pbody').value = S.draft

  drawPesanMsgs(cur, list, isAdmin)

  if (chats.length) pAnim.list = true
  refreshBadges()
}

// isi percakapan: hanya pesan yang BARU / berpindah chat yang dianimasikan
function drawPesanMsgs(cur, list, isAdmin) {
  const box = $('#pmsgs')

  if (S.pLoad) {
    box.innerHTML = SPINNER
    pAnim.chat = null   // setelah selesai dimuat, pesan dianimasikan masuk
    return
  }

  if (!cur) {
    box.innerHTML = '<p class="hint">Pilih percakapan di samping.</p>'
    pAnim.chat = null
    pAnim.n = 0
    pAnim.missed = 0
    pesanScrollState()
    return
  }

  const changed = pAnim.chat !== cur.id                       // pindah chat / baru masuk halaman
  const hadContent = !!box.querySelector('.msg, .sys')
  const prevTop = box.scrollTop
  const prevGap = box.scrollHeight - box.clientHeight - prevTop

  // pindah chat: 10 pesan terakhir masuk bergantian. Chat yang sama: hanya pesan baru.
  const start = changed ? Math.max(0, list.length - 10) : pAnim.n

  box.innerHTML = list.map((m, i) => {
    const anim = i >= start
    const cls = anim ? ' pin' : ''
    const style = anim ? ` style="--d:${Math.min(i - start, 10) * (changed ? 40 : 70)}ms"` : ''

    return m.sys
      ? `<div class="sys${cls}"${style}>${esc(m.body)}</div>`
      : `<div class="msg ${m.from_admin === isAdmin ? 'me' : ''}${cls}"${style}>
          ${esc(m.body)}
          <small>${senderLabel(m, isAdmin, cur.profiles?.name)}, ${fmtTime(m.created_at)}</small>
        </div>`
  }).join('')

  if (changed || !hadContent) {
    // chat berganti / tampilan baru dibangun: langsung ke pesan paling bawah
    box.scrollTop = box.scrollHeight
    pAnim.missed = 0
  } else {
    // chat yang sama: pertahankan posisi gulir
    box.scrollTop = prevTop

    const added = Math.max(0, list.length - pAnim.n)
    if (added) {
      const mine = list.slice(-added).some(m => m.sys || m.from_admin === isAdmin)

      // pesanmu sendiri, atau kamu sudah di dekat bawah: gulir halus ke pesan baru.
      // Kalau sedang membaca pesan lama: jangan ditarik, tampilkan tombol "pesan baru".
      if (mine || prevGap < 140) pesanToBottom()
      else pAnim.missed += added
    }
  }

  pAnim.chat = cur.id
  pAnim.n = list.length
  pesanScrollState()
}

// gulir ke pesan terbaru (halus, kecuali Potato Mode)
function pesanToBottom() {
  const box = $('#pmsgs')
  if (!box) return

  pAnim.missed = 0
  pAnim.lock = Date.now() + 800

  const btn = $('#pdown')
  if (btn) btn.classList.remove('show')

  box.scrollTo({ top: box.scrollHeight, behavior: pMotion() ? 'smooth' : 'auto' })
}

// tombol "ke pesan terbaru": muncul jika pembaca menggulir jauh dari bawah
function pesanScrollState() {
  const box = $('#pmsgs')
  const btn = $('#pdown')
  if (!box || !btn || Date.now() < pAnim.lock) return

  const away = box.scrollHeight - box.clientHeight - box.scrollTop > 140
  if (!away) pAnim.missed = 0

  const badge = $('#pdown-nb')
  if (badge) {
    badge.textContent = pAnim.missed > 99 ? '99+' : pAnim.missed
    badge.hidden = pAnim.missed <= 0
  }

  btn.classList.toggle('show', away)
}

// event "scroll" tidak menggelembung, jadi dipantau lewat fase capture
document.addEventListener('scroll', e => {
  if (e.target && e.target.id === 'pmsgs') pesanScrollState()
}, true)

// HP: tutup chat dengan animasi geser keluar, lalu kembali ke daftar
function closePesan() {
  const wrap = $('.pesan')

  if (!wrap || !wrap.classList.contains('open') || !pMotion()) {
    S.pOpen = false
    return drawPesan()
  }
  if (wrap.classList.contains('closing')) return

  wrap.classList.add('closing')

  setTimeout(() => {
    S.pOpen = false
    drawPesan()
    wrap.classList.remove('closing')

    // daftar chat masuk lagi dengan halus
    wrap.classList.add('pback')
    setTimeout(() => wrap.classList.remove('pback'), 450)
  }, 260)
}

async function sendPesan(form) {
  const body = form.body.value.trim()

  // kolom kosong: bergetar sebagai tanda
  if (!body) {
    form.body.classList.remove('shake')
    void form.body.offsetWidth
    form.body.classList.add('shake')
    return
  }
  if (!S.chatSel) return

  // tombol Kirim berdenyut selama pesan dikirim (tanpa layar "busy" yang menutup seluruh halaman)
  const button = form.querySelector('.btn')
  if (button) {
    button.disabled = true
    button.classList.add('sending')
  }

  const ok = await quiet(db.from('loan_msgs').insert({
    chat_id: S.chatSel,
    from_admin: S.me.role === 'admin',
    sender_name: S.me.name,
    body
  }))

  if (button) {
    button.disabled = false
    button.classList.remove('sending')
  }

  if (ok) {
    form.reset()
    S.draft = ''
    await loadPesan()
  }
}

function render(animate) {
  const me = S.me
  const isAdmin = me?.role === 'admin'

  // membuka "Pinjaman saya" = perubahan status dianggap sudah dilihat
  if (S.view === 'saya' && me) markSayaSeen()

  $('#auth').innerHTML = me
    ? `<button class="who" data-accounts title="Akun di perangkat ini">
         <span class="ava">${esc(me.name[0] || '?').toUpperCase()}${!S.set.email_verif || me.email_verified ? '' : '<i class="warn" title="E-mail belum diverifikasi">!</i>'}</span>
         <span class="wname">${esc(me.name)}${isAdmin ? ' <b class="chip">admin</b>' : ''}</span>
       </button>`
    : `<button class="btn" data-accounts>Masuk<span class="dsk"> / Daftar</span></button>`

  const views = { katalog: viewKatalog, saya: viewSaya, admin: viewAdmin, pengaturan: viewPengaturan, pesan: viewPesan, notif: viewNotif, setelan: viewSetelan }
  $('#main').className = 'view' + (animate ? ' anim' : '')
  $('#main').innerHTML = (views[S.view] || viewKatalog)()

  if (S.view === 'katalog') drawGrid(animate)
  if (S.view === 'admin') drawRows()
  if (S.view === 'pesan') {
    if (animate) pesanEnter()   // masuk ke halaman Pesan = animasi dimulai dari awal
    drawPesan()
  }
  if (S.view === 'notif') drawNotifs(animate)

  // gelembung chat hanya untuk yang sudah login
  $('#bubble').hidden = !me

  // menu (dengan bubble angka), peringatan terlambat, bubble chat
  refreshBadges()
}

function categoryOptions(selected, withAll) {
  const first = withAll ? '<option value="">Semua kategori</option>' : ''
  return first + KATEGORI
    .map(c => `<option ${c === selected ? 'selected' : ''}>${c}</option>`)
    .join('')
}

function viewKatalog() {
  const addButton = S.me?.role === 'admin' ? '<button class="btn" data-add>Tambah buku</button>' : ''

  return `
    ${kindsBar()}
    <div class="bar">
      <input id="q" placeholder="Cari judul atau penulis" value="${esc(S.q)}">
      <select id="cat">${categoryOptions(S.cat, true)}</select>
      <select id="bsort" aria-label="Urutkan buku">${sortOptions()}</select>
      ${addButton}
    </div>
    <div class="grid" id="grid"></div>
    <div class="pager" id="pager"></div>`
}

// urutkan daftar buku (di tempat) sesuai S.bsort. Nilai kosong (tahun/halaman) selalu di akhir.
function sortBooks(list) {
  const made = b => new Date(b.created_at).getTime() || 0
  const edited = b => new Date(b.updated_at || b.created_at).getTime() || 0
  const name = (a, b) => (a.title || '').localeCompare(b.title || '', 'id', { sensitivity: 'base', numeric: true })

  const by = (key, dir) => (a, b) => {
    const x = +a[key] > 0 ? +a[key] : null
    const y = +b[key] > 0 ? +b[key] : null

    if (x === null && y === null) return name(a, b)
    if (x === null) return 1
    if (y === null) return -1
    return (x - y) * dir || name(a, b)
  }

  const hot = b => (b.limited && b.stock > 0 ? 1 : 0)

  const sorters = {
    terbaru: (a, b) => made(b) - made(a),
    terlama: (a, b) => made(a) - made(b),
    diubah: (a, b) => edited(b) - edited(a),
    nama_az: name,
    nama_za: (a, b) => name(b, a),
    stok_rendah: (a, b) => (a.stock - b.stock) || name(a, b),
    stok_tinggi: (a, b) => (b.stock - a.stock) || name(a, b),
    rilis_baru: by('publish_year', -1),
    rilis_lama: by('publish_year', 1),
    hal_sedikit: by('pages', 1),
    hal_banyak: by('pages', -1),
    limited: (a, b) => (hot(b) - hot(a)) || made(b) - made(a)
  }

  return list.sort(sorters[S.bsort] || sorters.terbaru)
}

function drawGrid(animate) {
  const grid = $('#grid')
  if (!grid) return

  const keyword = S.q.toLowerCase()

  const list = S.books.filter(b => {
    const matchKind = kindOf(b) === S.kind
    const matchCategory = !S.cat || b.category === S.cat
    const matchText = (b.title + ' ' + (b.author || '')).toLowerCase().includes(keyword)
    return matchKind && matchCategory && matchText
  })

  sortBooks(list)
  grid.classList.toggle('stag', !!animate)

  if (!list.length) {
    grid.innerHTML = `<p class="empty">${S.kind === 'ebook' ? 'Belum ada e-book yang cocok.' : 'Belum ada buku yang cocok.'}</p>`
    drawPager(0, 0)
    return
  }

  // halaman katalog
  const pages = Math.ceil(list.length / PER_PAGE)
  S.page = Math.min(Math.max(S.page, 1), pages)
  const start = (S.page - 1) * PER_PAGE
  const marks = S.kind === 'ebook' ? loadMarks() : {}

  grid.innerHTML = list.slice(start, start + PER_PAGE).map((b, i) => {
    const ebook = kindOf(b) === 'ebook'
    const mark = ebook ? marks[b.id] : null

    return `
    <article class="card" data-card="${b.id}" style="--i:${Math.min(i, 14)}">
      <div class="cover">${ico('book')}${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${ebook ? '<span class="kbadge">E-BOOK</span>' : ''}${mark ? `<span class="kmark">${ico('bookmark', 'fill')}hlm ${mark.page}</span>` : ''}</div>
      <div class="ci">
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.author)}</p>
        ${bookMeta(b)}
        ${stockLabel(b)}
      </div>
    </article>`
  }).join('')

  drawPager(pages, list.length)
}

function drawPager(pages, total) {
  const el = $('#pager')
  if (!el) return

  if (pages <= 1) {
    el.innerHTML = ''
    return
  }

  // tampilkan halaman 1, terakhir, dan sekitar halaman aktif
  const show = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - S.page) <= 1) show.push(i)
  }

  let html = `<button data-page="${S.page - 1}" ${S.page === 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya">‹</button>`
  let prev = 0

  show.forEach(i => {
    if (i - prev > 1) html += '<span class="gap">…</span>'
    html += `<button class="${i === S.page ? 'on' : ''}" data-page="${i}">${i}</button>`
    prev = i
  })

  html += `<button data-page="${S.page + 1}" ${S.page === pages ? 'disabled' : ''} aria-label="Halaman berikutnya">›</button>`
  html += `<span class="hint pginfo">Halaman ${S.page} dari ${pages} · ${total} buku</span>`
  el.innerHTML = html
}

function viewSaya() {
  if (!S.mine.length) {
    return '<p class="empty">Kamu belum meminjam buku. Buka katalog dan booking buku pertamamu.</p>'
  }

  return S.mine.map(l => {
    const showCode = ['approved', 'dipinjam'].includes(l.status)
    const late = isLate(l)
    const asked = l.status === 'dipinjam' && l.return_requested_at
    const dueText = l.due_at ? `, jatuh tempo ${fmtDate(l.due_at)}${late ? ` (terlambat ${daysLate(l)} hari)` : ''}` : ''

    return `
      <div class="loan ${late ? 'overdue' : ''}">
        <div>
          <h3>${esc(l.books?.title)}</h3>
          <span class="chip s-${l.status}">${STATUS[l.status]}</span>
          ${asked ? '<span class="chip s-req">Pengembalian diajukan</span>' : ''}
          <p class="${late ? 'late' : ''}">Durasi ${l.days} hari${dueText}</p>
          ${late ? '<p class="late">Segera kembalikan buku ke perpustakaan.</p>' : ''}
          ${asked ? `<p>Diajukan ${fmtDateTime(l.return_requested_at)}. Antar bukunya ke perpustakaan, admin akan mengonfirmasi.</p>` : ''}
        </div>
        ${showCode ? `<div class="code"><small>Tunjukkan kode ke petugas</small><b>${l.code}</b></div>` : ''}
        ${l.status === 'booking' ? `<button class="btn ghost sm" data-cancel="${l.id}">Batalkan</button>` : ''}
        ${l.status === 'dipinjam' && !asked ? `<button class="btn sm" data-reqret="${l.id}">Ajukan pengembalian</button>` : ''}
        ${showCode ? `
          <div class="lokasi">
            <span class="pin">${ico('pin')}</span>
            <div>
              <b>Lokasi: ${LOKASI}</b>
              <p>${CATATAN}</p>
            </div>
          </div>` : ''}
      </div>`
  }).join('')
}

/* ==========================================================
   PATCH app.js - Kelola peminjaman (admin), daftar kompak
   Ada 2 langkah di app.js + 1 langkah di style.css.
   Tidak ada perubahan di index.html.
   ========================================================== */


/* ---------- LANGKAH 1 ----------
   Bagian "7. TAMPILAN": HAPUS fungsi viewAdmin() dan drawRows() yang lama,
   lalu GANTI dengan seluruh kode di bawah ini. */

/* ==========================================================
PATCH app.js - Grafik di Kelola peminjaman (admin)
Murni SVG + CSS, tanpa library. Animasi lewat CSS, jadi Potato Mode
otomatis membuatnya statis.

VERSI RINGKAS. Jika versi sebelumnya sudah kamu tempel, HAPUS dulu semua kode grafik lama
(dari 'const CH_KEY' sampai akhir blok klik grafik), lalu tempel yang ini.

CARA PASANG (2 langkah di app.js + 1 di style.css):
1) Tempel SELURUH isi file ini di app.js, tepat di bawah fungsi drawRows()
   (di level paling luar, jangan di dalam fungsi lain).
2) Di fungsi viewAdmin(), cari baris  <div class="bar">  yang pertama,
   lalu tambahkan baris ini TEPAT DI ATASNYA:
       <section class="charts" id="charts">${chartsHtml()}</section>
3) Tempel grafik-peminjaman.css di paling bawah style.css.
Tidak perlu menyentuh bagian EVENT: semua klik sudah ditangani di bawah.
========================================================== */

const CH_KEY = 'adm-chart'
const CH_DEFAULT = { p: 'minggu', m: '3', t: 'tren' }   // periode, jumlah grafik ('1' | '3' | 'x'), jenis (mode 1 grafik)

const chartCfg = (() => {
  try {
    return { ...CH_DEFAULT, ...JSON.parse(localStorage.getItem(CH_KEY)) }
  } catch (e) {
    return { ...CH_DEFAULT }
  }
})()

const chartHide = { req: false, brw: false, ret: false }   // seri yang disembunyikan lewat legenda
let chartSig = ''                               // tanda isi grafik; sama = tidak diulang animasinya

const CH_COLORS = {
  booking: '#f5b301', approved: '#7459f0', dipinjam: '#10b981', dikembalikan: '#38bdf8',
  selesai: '#94a3b8', ditolak: '#ef4444', dibatalkan: '#fb7185'
}
const CH_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const CH_MON_S = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const CH_DAYS_S = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

// rentang waktu: minggu ini (Senin-Minggu), bulan ini (per tanggal), tahun ini (per bulan)
function chartPeriod() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  let start, end, n, idx, label, tick, title

  if (chartCfg.p === 'tahun') {
    start = new Date(y, 0, 1)
    end = new Date(y + 1, 0, 1)
    n = 12
    idx = t => t.getMonth()
    label = i => `${CH_MONTHS[i]} ${y}`
    tick = i => CH_MON_S[i]
    title = 'tahun ini'
  } else if (chartCfg.p === 'bulan') {
    start = new Date(y, m, 1)
    end = new Date(y, m + 1, 1)
    n = new Date(y, m + 1, 0).getDate()
    idx = t => t.getDate() - 1
    label = i => fmtDate(new Date(y, m, i + 1))
    tick = i => (i === 0 || (i + 1) % 5 === 0 ? i + 1 : '')
    title = 'bulan ini'
  } else {
    const off = (now.getDay() + 6) % 7
    start = new Date(y, m, d - off)
    end = new Date(y, m, d - off + 7)
    n = 7
    idx = t => Math.min(6, Math.max(0, Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - start) / 864e5)))
    label = i => fmtDate(new Date(y, m, d - off + i))
    tick = i => CH_DAYS_S[i]
    title = 'minggu ini'
  }

  const inR = v => {
    if (!v) return false
    const t = new Date(v)
    return t >= start && t < end
  }
  return { n, idx, label, tick, title, inR }
}

// garis melengkung halus melewati titik-titik
function smoothPath(p) {
  let d = `M${p[0][0]},${p[0][1]}`

  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i]
    const b = p[i]
    const c = p[i + 1]
    const e = p[i + 2] || c
    d += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`
  }
  return d
}

// grafik 1: tren (garis + area). Arahkan kursor / ketuk untuk melihat angka.
function trendChart(per, req, brw, ret) {
  const W = 720, H = 150, L = 24, RR = 8, T = 8, B = 18
  const iw = W - L - RR
  const ih = H - T - B
  const n = per.n
  const band = iw / n

  const shown = [['req', req, 'Pengajuan', '#7459f0'], ['brw', brw, 'Dipinjam', '#10b981'], ['ret', ret, 'Kembali', '#38bdf8']].filter(s => !chartHide[s[0]])
  const step = Math.ceil(Math.max(1, ...shown.flatMap(s => s[1])) / 3)
  const yMax = step * 3

  const X = i => L + band * (i + 0.5)
  const Y = v => T + ih - (v / yMax) * ih

  const grid = [0, 1, 2, 3].map(k => `
    <line class="cgl" x1="${L}" x2="${W - RR}" y1="${Y(k * step)}" y2="${Y(k * step)}"/>
    <text class="cax" x="${L - 6}" y="${Y(k * step) + 4}" text-anchor="end">${k * step}</text>`).join('')

  const xs = Array.from({ length: n }, (_, i) => per.tick(i) === ''
    ? '' : `<text class="cax" x="${X(i)}" y="${H - 5}" text-anchor="middle">${per.tick(i)}</text>`).join('')

  const lines = shown.map(([, v, , color]) => {
    const pts = v.map((val, i) => [X(i), Y(val)])
    const d = smoothPath(pts)
    return `<path class="carea" d="${d} L${pts[n - 1][0]},${T + ih} L${pts[0][0]},${T + ih} Z" fill="${color}"/>
            <path class="cline" d="${d}" pathLength="1" stroke="${color}"/>`
  }).join('')

  const hits = Array.from({ length: n }, (_, i) => {
    const x = X(i)
    const h = 26 + shown.length * 15
    const tx = x > W * 0.6 ? x - 142 : x + 10
    const peak = Math.max(...shown.map(s => s[1][i]))
    const ty = Math.max(T, Math.min(T + ih - h, Y(peak) - h / 2))

    return `
    <g class="pt">
      <rect class="hit" x="${x - band / 2}" y="${T}" width="${band}" height="${ih}"/>
      <line class="cguide" x1="${x}" x2="${x}" y1="${T}" y2="${T + ih}"/>
      ${shown.map(([, v, , color]) => `<circle class="cdot" cx="${x}" cy="${Y(v[i])}" r="3.5" fill="${color}"/>`).join('')}
      <g class="ctip" transform="translate(${tx} ${ty})">
        <rect width="132" height="${h}" rx="7"/>
        <text class="ctt" x="9" y="17">${esc(per.label(i))}</text>
        ${shown.map(([, v, name, color], j) => `<text class="ctr" x="9" y="${33 + j * 15}"><tspan fill="${color}">●</tspan> ${name}: <tspan class="ctn">${v[i]}</tspan></text>`).join('')}
      </g>
    </g>`
  }).join('')

  return `<svg class="ctrend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik tren peminjaman ${per.title}">${grid}${xs}${lines}${hits}</svg>`
}

// grafik 2: donat status. Klik potongan = saring daftar di bawah.
function donutChart(loans) {
  const total = loans.length
  if (!total) return '<p class="hint cempty">Belum ada pengajuan di periode ini.</p>'

  const keys = STATUS_ORDER.filter(k => loans.some(l => l.status === k))
  let offset = 0

  const rows = keys.map((k, i) => {
    const c = loans.filter(l => l.status === k).length
    const pct = (c / total) * 100
    const dash = Math.max(pct - (keys.length > 1 ? 0.8 : 0), 0.1)
    const seg = `
      <g class="sg ${S.sf === k ? 'on' : ''}" data-cseg="${k}">
        <circle class="seg" cx="21" cy="21" r="15.9155" transform="rotate(-90 21 21)" fill="none" stroke="${CH_COLORS[k]}" stroke-width="5" pathLength="100" stroke-dasharray="${dash} 100" stroke-dashoffset="${-offset}" style="--i:${i}"/>
        <text class="dc" x="21" y="23" text-anchor="middle">${c}</text>
        <text class="dcl" x="21" y="29" text-anchor="middle">${STATUS_SHORT[k]} · ${Math.round(pct)}%</text>
      </g>`
    offset += pct
    return { k, c, seg }
  })

  return `
    <div class="cdonut">
      <svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Grafik donat status peminjaman">
        ${rows.map(r => r.seg).join('')}
        <text class="dtot" x="21" y="23" text-anchor="middle">${total}</text>
        <text class="dlab" x="21" y="28.5" text-anchor="middle">pengajuan</text>
      </svg>
      <div class="dleg">
        ${rows.map(r => `<button type="button" class="${S.sf === r.k ? 'on' : ''}" data-cseg="${r.k}"><i style="background:${CH_COLORS[r.k]}"></i>${STATUS_SHORT[r.k]}<b>${r.c}</b></button>`).join('')}
      </div>
    </div>`
}

// grafik 3: batang buku terpopuler. Klik batang = cari buku itu di daftar.
function barsChart(loans) {
  const count = {}
  loans.forEach(l => {
    const title = l.books?.title || '(tanpa judul)'
    count[title] = (count[title] || 0) + 1
  })

  const top = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
  if (!top.length) return '<p class="hint cempty">Belum ada pengajuan di periode ini.</p>'

  return `<div class="cbars">${top.map(([title, c], i) => `
    <button type="button" class="cbar ${S.f === title ? 'on' : ''}" data-cbar="${esc(title)}" style="--i:${i}" title="${esc(title)}: ${c} pengajuan">
      <span class="cbl">${esc(title)}</span>
      <span class="cbt"><i class="cfill" style="width:${(c / top[0][1]) * 100}%"></i></span>
      <b>${c}</b>
    </button>`).join('')}</div>`
}

function chartsHtml() {
  const per = chartPeriod()
  const req = Array(per.n).fill(0)
  const brw = Array(per.n).fill(0)
  const ret = Array(per.n).fill(0)

  S.all.forEach(l => {
    if (per.inR(l.created_at)) req[per.idx(new Date(l.created_at))]++
    if (per.inR(l.borrowed_at)) brw[per.idx(new Date(l.borrowed_at))]++
    if (per.inR(l.returned_at)) ret[per.idx(new Date(l.returned_at))]++
  })

  const loans = S.all.filter(l => per.inR(l.created_at))
  const sum = a => a.reduce((x, y) => x + y, 0)

  // isi sama dengan sebelumnya (mis. data dimuat ulang otomatis) = tanpa animasi ulang
  const sig = [chartCfg.p, chartCfg.m, chartCfg.t, S.all.length, chartHide.req, chartHide.brw, chartHide.ret].join('|')
  const quiet = sig === chartSig
  chartSig = sig

  const tab = (attr, val, label, cur) => `<button type="button" class="${cur === val ? 'on' : ''}" data-${attr}="${val}">${label}</button>`
  const card = (title, sub, body, cls = '') => `<div class="cc ${cls}"><div class="cct"><b>${title}</b><small>${sub}</small></div>${body}</div>`

  const legend = `
    <div class="cleg">
      <button type="button" class="${chartHide.req ? 'off' : ''}" data-cleg="req"><i style="background:#7459f0"></i>Pengajuan</button>
      <button type="button" class="${chartHide.brw ? 'off' : ''}" data-cleg="brw"><i style="background:#10b981"></i>Dipinjam</button>
      <button type="button" class="${chartHide.ret ? 'off' : ''}" data-cleg="ret"><i style="background:#38bdf8"></i>Kembali</button>
    </div>`

  const cards = {
    tren: card('Tren peminjaman', per.title, legend + trendChart(per, req, brw, ret), 'wide'),
    status: card('Status peminjaman', per.title, donutChart(loans)),
    buku: card('Buku terpopuler', per.title, barsChart(loans))
  }

  // ringkasan angka (satu baris)
  const peakVal = Math.max(...req)
  const pk = req.indexOf(peakVal)
  const unit = chartCfg.p === 'tahun' ? 'bln' : 'hari'
  const avg = sum(req) / (per.idx(new Date()) + 1)
  const kpiItems = [
    [sum(req), 'Pengajuan'],
    [sum(brw), 'Dipinjam'],
    [sum(ret), 'Kembali'],
    [peakVal > 0 ? `${chartCfg.p === 'bulan' ? 'tgl ' + (pk + 1) : per.tick(pk)} (${peakVal})` : '-', 'Puncak'],
    [avg.toFixed(1), 'Rata-rata/' + unit],
    [S.all.filter(isLate).length, 'Terlambat']
  ]
  const kpi = `<div class="ckpi">${kpiItems.map(([v, k]) => `<div><b>${v}</b>${k}</div>`).join('')}</div>`

  let body = ''
  if (chartCfg.m === '3') {
    body = `<div class="cgrid m3">${cards.tren}${cards.status}${cards.buku}</div>`
  } else if (chartCfg.m === '1') {
    body = `
      <div class="tabs ctabs">${tab('ct', 'tren', 'Tren', chartCfg.t)}${tab('ct', 'status', 'Status', chartCfg.t)}${tab('ct', 'buku', 'Buku populer', chartCfg.t)}</div>
      <div class="cgrid m1">${cards[chartCfg.t] || cards.tren}</div>`
  }

  return `
    <div class="${quiet ? 'cn' : ''}">
      <div class="chead">
        <b>Statistik peminjaman</b>
        ${chartCfg.m === 'x' ? '' : `<div class="tabs">${tab('cp', 'minggu', 'Minggu ini', chartCfg.p)}${tab('cp', 'bulan', 'Bulan ini', chartCfg.p)}${tab('cp', 'tahun', 'Tahun ini', chartCfg.p)}</div>`}
        <div class="tabs">${tab('cm', '1', '1 grafik', chartCfg.m)}${tab('cm', '3', '3 grafik', chartCfg.m)}${tab('cm', 'x', 'Sembunyikan', chartCfg.m)}</div>
      </div>
      ${chartCfg.m === 'x' ? '' : kpi}
      ${body}
    </div>`
}

function drawCharts() {
  const box = $('#charts')
  if (box) box.innerHTML = chartsHtml()
}

function saveChartCfg() {
  try {
    localStorage.setItem(CH_KEY, JSON.stringify(chartCfg))
  } catch (e) { }
}

// semua klik grafik ditangani di sini (berdiri sendiri, tidak perlu handler lain)
document.addEventListener('click', e => {
  const find = key => e.target.closest(`[data-${key}]`)
  const toList = () => $('#rows')?.scrollIntoView({ behavior: P.potato ? 'auto' : 'smooth', block: 'start' })
  let el

  if (el = find('cp')) {
    chartCfg.p = el.dataset.cp
    saveChartCfg()
    return drawCharts()
  }
  if (el = find('cm')) {
    chartCfg.m = el.dataset.cm
    saveChartCfg()
    return drawCharts()
  }
  if (el = find('ct')) {
    chartCfg.t = el.dataset.ct
    saveChartCfg()
    return drawCharts()
  }

  // legenda: sembunyikan / tampilkan satu garis (minimal satu tetap tampil)
  if (el = find('cleg')) {
    const key = el.dataset.cleg
    chartHide[key] = !chartHide[key]
    if (Object.values(chartHide).every(Boolean)) chartHide[key] = false
    return drawCharts()
  }

  // donat: klik potongan / legenda = saring status di daftar
  if (el = find('cseg')) {
    S.sf = S.sf === el.dataset.cseg ? '' : el.dataset.cseg
    document.querySelectorAll('[data-cseg]').forEach(b => b.classList.toggle('on', b.dataset.cseg === S.sf))
    drawRows()
    return toList()
  }

  // batang: klik = cari judul buku itu di daftar
  if (el = find('cbar')) {
    const title = el.dataset.cbar
    S.f = S.f === title ? '' : title

    const input = $('#f')
    if (input) input.value = S.f

    document.querySelectorAll('[data-cbar]').forEach(b => b.classList.toggle('on', b.dataset.cbar === S.f))
    drawRows()
    return toList()
  }
})

let admLimit = 30   // jumlah baris tampil (bertambah lewat tombol "Tampilkan lebih banyak")
let admSig = ''     // tanda filter/urutan; berubah = batas kembali ke 30

function viewAdmin() {
  const count = status => S.all.filter(l => l.status === status).length
  const asked = S.all.filter(l => l.status === 'dipinjam' && l.return_requested_at).length
  const late = S.all.filter(isLate).length

  // kartu statistik = juga tombol filter cepat (klik lagi untuk melepas)
  const stat = (key, n, label, cls = '') =>
    `<button type="button" class="st ${cls}" data-sf="${key}"><b>${n}</b><span>${label}</span></button>`

  const filterOptions = STATUS_ORDER
    .map(key => `<option value="${key}" ${S.sf === key ? 'selected' : ''}>${STATUS_SHORT[key]}</option>`)
    .join('')

  return `
    <div class="adm">
      <div class="stats2">
        ${stat('booking', count('booking'), 'Menunggu', 'warn')}
        ${stat('approved', count('approved'), 'Siap diambil')}
        ${stat('dipinjam', count('dipinjam'), 'Dipinjam')}
        ${stat('req', asked, 'Minta kembali')}
        ${stat('late', late, 'Terlambat', 'bad')}
      </div>
      <section class="charts" id="charts">${chartsHtml()}</section>
      <div class="bar">
        <input id="f" placeholder="Cari kode, peminjam, atau judul" value="${esc(S.f)}">
        <select id="sortby" aria-label="Urutkan">
          ${SORTS.map(([key, label]) => `<option value="${key}" ${S.sort === key ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <select id="sfilter" aria-label="Filter status">
          <option value="">Semua status</option>
          ${filterOptions}
          <option value="req" ${S.sf === 'req' ? 'selected' : ''}>Minta dikembalikan</option>
          <option value="late" ${S.sf === 'late' ? 'selected' : ''}>Terlambat</option>
        </select>
      </div>
      <p class="hint acount" id="acount"></p>
      <p class="hint ahow">Klik kode untuk menyalin. Untuk mengubah status: klik baris berstatus Selesai, atau tahan baris lainnya.</p>
      <div class="lhead" aria-hidden="true">
        <span>Kode Peminjaman</span>
        <span>Peminjam &amp; Pengajuan</span>
        <span>Judul Buku</span>
        <span>Status &amp; Keterangan</span>
        <span>Tindakan</span>
      </div>
      <div class="alist" id="rows"></div>
    </div>`
}


// salin kode peminjaman ke clipboard
async function copyCode(code) {
  let ok = false

  try {
    await navigator.clipboard.writeText(code)
    ok = true
  } catch (e) {
    // cadangan untuk browser lama / alamat non-HTTPS
    const box = document.createElement('textarea')
    box.value = code
    box.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.append(box)
    box.select()

    try {
      ok = document.execCommand('copy')
    } catch (err) { }
    box.remove()
  }

  if (ok) toast(`Kode ${code} disalin ke clipboard`)
  else toast('Gagal menyalin kode', true)
}

// jendela kecil: pilih status baru (dibuka dengan klik pada baris Selesai, atau tahan pada baris lain)
let chg = null   // { id, to }

function openStatusChanger(id) {
  const l = S.all.find(x => x.id === id)
  if (!l) return

  chg = { id, to: '' }

  modal(`
    <h2>Ubah status peminjaman</h2>
    <p class="hint">Kode <b>${esc(l.code)}</b> · ${esc(l.profiles?.name)} · ${esc(l.books?.title)}</p>
    <p class="hint" style="margin-top:.3rem">Status saat ini: <span class="chip s-${l.status}">${STATUS_SHORT[l.status] || l.status}</span></p>
    <p class="hint" style="margin:.8rem 0 .4rem">Pilih status baru:</p>
    <div class="chgs">
      ${STATUS_ORDER.filter(k => k !== l.status).map(k => `
        <button type="button" class="chg" data-chgto="${k}">
          <span class="chip s-${k}">${STATUS_SHORT[k]}</span>
          <small>${STATUS[k]}</small>
        </button>`).join('')}
    </div>
    <div class="act">
      <button type="button" class="btn danger" data-chgnext disabled>Pilih status dulu</button>
      <button type="button" class="btn ghost" data-close>Batal</button>
    </div>`)
}

// dua kali konfirmasi, lalu simpan
async function applyStatusChange() {
  if (!chg || !chg.to) return

  const l = S.all.find(x => x.id === chg.id)
  if (!l) return toast('Data peminjaman tidak ditemukan', true)

  const from = STATUS_SHORT[l.status] || l.status
  const to = STATUS_SHORT[chg.to] || chg.to

  const first = await ask({
    title: 'Ubah status peminjaman?',
    text: `Status ${l.code} akan diubah dari "${from}" menjadi "${to}".`,
    yes: 'Ya, lanjut',
    no: 'Batal',
    icon: 'help'
  })
  if (!first) return

  const second = await ask({
    title: 'Konfirmasi terakhir',
    text: `Yakin mengubah ${l.code} ke "${to}"? Perubahan langsung berlaku dan terlihat oleh peminjam.`,
    yes: 'Ya, ubah status',
    no: 'Batal',
    danger: true,
    icon: 'warn'
  })
  if (!second) return

  const now = new Date().toISOString()
  const patch = { status: chg.to }

  // kembali ke "dipinjam": lengkapi tanggal bila belum ada
  if (chg.to === 'dipinjam') {
    if (!l.borrowed_at) patch.borrowed_at = now
    if (!l.due_at) patch.due_at = new Date(Date.now() + l.days * 86400000).toISOString()
  }

  // "dikembalikan": waktu kembali diperbarui supaya hitung mundur 24 jam menuju "selesai" mulai dari sekarang
  if (chg.to === 'dikembalikan') patch.returned_at = now

  if (await run(db.from('loans').update(patch).eq('id', l.id), `Status ${l.code} diubah ke ${to}`)) {
    chg = null
    closeModal()
    loadData()
  }
}

// tahan baris (0,7 detik) = buka jendela ubah status. Baris "Selesai" tidak perlu ditahan.
let rowHold = null

function rowHoldCancel() {
  if (!rowHold) return

  clearTimeout(rowHold.timer)
  rowHold.el.classList.remove('holding')
  rowHold = null
}

document.addEventListener('pointerdown', e => {
  const row = e.target.closest('[data-lrow]')
  if (!row || e.button > 0 || e.target.closest('button') || row.dataset.done === '1') return

  rowHoldCancel()
  row.classList.add('holding')

  rowHold = {
    el: row,
    x: e.clientX,
    y: e.clientY,
    timer: setTimeout(() => {
      row.classList.remove('holding')
      rowHold = null

      try {
        if (navigator.vibrate) navigator.vibrate(25)
      } catch (err) { }

      openStatusChanger(+row.dataset.lrow)
    }, 700)
  }
})

document.addEventListener('pointermove', e => {
  if (rowHold && Math.hypot(e.clientX - rowHold.x, e.clientY - rowHold.y) > 12) rowHoldCancel()
})
document.addEventListener('pointerup', rowHoldCancel)
document.addEventListener('pointercancel', rowHoldCancel)

// cegah menu klik-kanan bawaan muncul saat menahan baris di HP
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('[data-lrow]')
  if (row && row.dataset.done !== '1') e.preventDefault()
})

function viewPengaturan() {
  const toggle = (id, title, hint) => `
    <label class="setting">
      <input type="checkbox" id="${id}" ${S.set[id] ? 'checked' : ''}>
      <span>${title}<small>${hint}</small></span>
    </label>`
 
  return `
    <h2 style="margin-bottom:.4rem">Pengaturan admin</h2>
    <p class="hint" style="margin-bottom:1rem">Berlaku untuk semua user. Jika keduanya mati (default), user hanya bisa meminjam satu buku sampai buku itu dikembalikan.</p>
    ${toggle('multi_book', 'Booking banyak buku sekaligus', 'Mati: user hanya boleh punya satu booking aktif.')}
    ${toggle('multi_rent', 'Meminjam banyak buku sekaligus', 'Mati: user hanya boleh meminjam satu buku sampai dikembalikan.')}
    ${toggle('duration_var', 'Variasi durasi meminjam buku', `Hidup: user bisa memilih durasi (3, 5, 7, 14 hari, atau custom). Mati (default): durasi tetap ${DEFAULT_DAYS} hari dan buku bisa dikembalikan kapan saja.`)}
    <h3 style="margin:1.2rem 0 .6rem">Akun</h3>
    ${toggle('email_verif', 'Verifikasi E-mail (BETA)', 'Hidup: user bisa menambah/memverifikasi e-mail, mereset kata sandi, dan mengganti username. Mati (default): semua fitur itu disembunyikan.')}
    <h3 style="margin:1.2rem 0 .6rem">Sistem</h3>
    <label class="setting danger">
      <input type="checkbox" id="maintenance" ${S.set.maintenance === true || S.set.maintenance === 'true' ? 'checked' : ''}>
      <span>${ico('wrench')}Mode Maintenance (tutup website sementara)<small>Hidup: semua pengguna selain admin ditutup dari website dan tidak bisa mengirim aksi apa pun ke server. Perlu 2x konfirmasi. Untuk membukanya kembali, pakai tombol kecil di pojok kiri bawah layar.</small></span>
    </label>`
}

// awalan pratinjau pesan terakhir di daftar chat
function previewPrefix(m, isAdmin) {
  if (isAdmin) {
    if (!m.from_admin) return ''
    return (m.sender_name && m.sender_name !== S.me.name ? m.sender_name : 'Kamu') + ': '
  }
  return m.from_admin ? '' : 'Kamu: '
}

async function endPesan(id) {
  const yes = await ask({
    title: 'Akhiri percakapan?',
    text: 'Setelah diakhiri tidak ada yang bisa mengirim pesan lagi.',
    yes: 'Ya, akhiri',
    no: 'Batal',
    danger: true
  })
  if (!yes) return

  if (await run(db.from('loan_chats').update({ ended: true }).eq('id', id), 'Percakapan diakhiri')) loadPesan()
}

async function hidePesan() {
  const yes = await ask({
    title: 'Hapus chat dari daftarmu?',
    text: 'Pihak lain tetap bisa melihat percakapan ini.',
    yes: 'Ya, hapus',
    no: 'Batal',
    danger: true,
    icon: 'trash'
  })
  if (!yes) return

  if (await run(db.rpc('hide_loan_chat', { cid: S.chatSel }), 'Chat dihapus dari daftarmu')) {
    S.pOpen = false
    loadPesan()
  }
}

/* ==========================================================
   PATCH app.js - Kelola peminjaman (admin), daftar kompak
   Ada 2 langkah di app.js + 1 langkah di style.css.
   Tidak ada perubahan di index.html.
   ========================================================== */

function drawRows() {
  const box = $('#rows')
  if (!box) return

  const sig = S.f + '|' + S.sort + '|' + S.sf
  if (sig !== admSig) {
    admSig = sig
    admLimit = 30
  }

  const keyword = S.f.toLowerCase()
  const asked = l => l.status === 'dipinjam' && !!l.return_requested_at

  const button = (action, id, label, extra = '') =>
    `<button class="btn sm ${extra}" data-act="${action}" data-lid="${id}">${label}</button>`

  const actions = {
    booking: id => button('approved', id, 'Setujui') + button('ditolak', id, 'Tolak', 'danger'),
    approved: id => button('dipinjam', id, 'Buku diambil'),
    dipinjam: id => button('dikembalikan', id, 'Dikembalikan'),
    dikembalikan: id => button('selesai', id, 'Tandai selesai')
  }

  // urutan "status": yang perlu tindakan di atas; terlambat & minta dikembalikan didahulukan
  const rank = l => {
    let r = STATUS_ORDER.indexOf(l.status)
    if (l.status === 'dipinjam') {
      if (isLate(l)) r -= 0.6
      else if (l.return_requested_at) r -= 0.3
    }
    return r
  }

  const newest = (a, b) => new Date(b.created_at) - new Date(a.created_at)

  const byFilter = l => !S.sf
    || (S.sf === 'late' ? isLate(l) : S.sf === 'req' ? asked(l) : l.status === S.sf)

  const list = S.all
    .filter(byFilter)
    .filter(l => (l.code + ' ' + l.profiles?.name + ' ' + l.books?.title).toLowerCase().includes(keyword))
    .sort((a, b) => {
      if (S.sort === 'terbaru') return newest(a, b)
      if (S.sort === 'terlama') return newest(b, a)
      if (S.sort === 'terlambat') return (isLate(b) - isLate(a)) || (rank(a) - rank(b)) || newest(a, b)
      return (rank(a) - rank(b)) || newest(a, b)
    })

  // kartu statistik & pilihan filter ikut menandai filter yang aktif
  document.querySelectorAll('[data-sf]').forEach(b => b.classList.toggle('on', b.dataset.sf === S.sf))
  const select = $('#sfilter')
  if (select) select.value = S.sf

  const info = $('#acount')
  if (info) info.textContent = `${list.length} dari ${S.all.length} peminjaman`

  if (!list.length) {
    box.innerHTML = '<p class="empty">Tidak ada data yang cocok.</p>'
    return
  }

  const shown = list.slice(0, admLimit)

  box.innerHTML = shown.map(l => {
    const notes = [
      l.status === 'dipinjam' && l.due_at ? `Jatuh tempo ${fmtDate(l.due_at)}` : '',
      isLate(l) ? `<b class="late">Terlambat ${daysLate(l)} hari</b>` : '',
      asked(l) ? `${ico('inbox')} Minta kembali, ${fmtShort(l.return_requested_at)}` : '',
      l.status === 'dikembalikan' && l.returned_at ? `Otomatis selesai ${fmtDateTime(+new Date(l.returned_at) + 86400000)}` : '',
      l.cancel_reason ? `Alasan: ${esc(l.cancel_reason)}` : ''
    ].filter(Boolean).map(t => `<small>${t}</small>`).join('')

    const done = l.status === 'selesai'

    return `
    <article class="lrow ${isLate(l) ? 'overdue' : ''} ${done ? 'done' : ''}" data-lrow="${l.id}" ${done ? 'data-done="1"' : ''} title="${done ? 'Klik untuk mengubah status' : 'Tahan untuk mengubah status'}">
      <button type="button" class="lcode" data-copy="${esc(l.code)}" title="Klik untuk menyalin kode">${esc(l.code)}</button>
      <div class="lwho">
        <b>${esc(l.profiles?.name)}</b>
        <small>${fmtDateTime(l.created_at)} · ${l.days} hari</small>
      </div>
      <div class="lbook">${esc(l.books?.title)}</div>
      <div class="lst">
        <span class="chip s-${l.status}">${STATUS_SHORT[l.status] || l.status}</span>
        ${notes}
      </div>
      <div class="lact">${actions[l.status]?.(l.id) || ''}</div>
    </article>`
  }).join('') + (list.length > shown.length
    ? `<button class="btn ghost sm more" data-more>Tampilkan lebih banyak (${list.length - shown.length})</button>`
    : '')
}


/* ---------- 8. CHAT CUSTOMER SERVICE (jendela kecil di pojok kanan bawah) ---------- */
function setChat(open) {
  S.chatOpen = open
  $('#chatw').classList.toggle('open', open)

  if (open) {
    loadChat()
    setTimeout(() => $('#cf').body.focus(), 300)
  }
}

function currentThread() {
  return S.me.role === 'admin' ? S.thread : S.me.id
}

function drawChat() {
  if (!S.me) return

  const box = $('#msgs')
  const select = $('#threadsel')
  const isAdmin = S.me.role === 'admin'

  $('#ctitle').textContent = isAdmin ? 'Chat pengguna' : 'Chat Customer Service'
  select.hidden = !isAdmin

  // admin: pilih percakapan, yang terbaru di atas
  if (isAdmin) {
    const latest = {}
    S.msgs.forEach(m => { latest[m.user_id] = m })

    const ids = Object.keys(latest)
      .sort((a, b) => new Date(latest[b].created_at) - new Date(latest[a].created_at))

    if (!ids.includes(S.thread)) S.thread = ids[0] || null

    select.innerHTML = ids.length
      ? ids.map(id => `<option value="${id}" ${id === S.thread ? 'selected' : ''}>${esc(latest[id].profiles?.name)}</option>`).join('')
      : '<option>Belum ada percakapan</option>'
  }

  const list = S.msgs.filter(m => m.user_id === currentThread())
  const last = list[list.length - 1]
  const ended = !!last?.ended && !(S.reopen && !isAdmin)

  // percakapan yang sedang terbuka dianggap sudah dibaca
  if (last) setSeen('cs:' + currentThread(), last.created_at)

  // admin: lihat siapa admin yang terakhir membalas percakapan ini
  const info = $('#cinfo')
  if (isAdmin && list.length) {
    const reply = [...list].reverse().find(m => m.from_admin && !m.ended)
    info.hidden = false
    info.innerHTML = reply
      ? `Terakhir dibalas oleh <b>${esc(reply.sender_name || 'admin')}</b>, ${fmtTime(reply.created_at)}`
      : 'Belum dibalas admin'
  } else {
    info.hidden = true
  }

  $('#cf').hidden = ended
  $('#cend').hidden = !list.length || ended
  $('#cnew').hidden = !ended
  $('#cnew button').hidden = isAdmin

  refreshBadges()

  if (!list.length) {
    box.innerHTML = `<p class="hint">${isAdmin ? 'Belum ada pesan masuk.' : 'Tanyakan apa saja soal buku atau peminjaman. Admin akan membalas di sini.'}</p>`
    return
  }

  box.innerHTML = list.map(m => m.ended
    ? `<div class="sys">${esc(m.body)}</div>`
    : `<div class="msg ${m.from_admin === isAdmin ? 'me' : ''}">
        ${m.image ? `<a href="${esc(m.image)}" target="_blank" rel="noopener"><img src="${esc(m.image)}" alt="Gambar kiriman"></a>` : ''}
        ${esc(m.body)}
        <small>${senderLabel(m, isAdmin, m.profiles?.name)}, ${fmtTime(m.created_at)}</small>
      </div>`).join('')

  box.scrollTop = box.scrollHeight
  tickCooldown()
}

function cooldownLeft() {
  return Math.ceil((S.lastSend + COOLDOWN_CHAT - Date.now()) / 1000)
}

function tickCooldown() {
  const button = $('#send')
  if (!button) return

  const left = cooldownLeft()
  button.disabled = left > 0
  button.textContent = left > 0 ? `Tunggu ${left} d` : 'Kirim'

  if (left > 0) setTimeout(tickCooldown, 500)
}

async function sendChat(form) {
  const isAdmin = S.me.role === 'admin'
  const threadId = currentThread()
  const body = form.body.value.trim()
  const file = $('#cfile').files[0]

  if (!threadId) return toast('Pilih percakapan dulu', true)
  if (!body && !file) return
  if (!isAdmin && cooldownLeft() > 0) return toast('Tunggu 5 detik antar pesan', true)

  let image = null

  if (file) {
    if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
      return toast('Hanya file gambar, maksimal 2 MB', true)
    }

    const path = `${S.me.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    busy(1)
    const upload = await db.storage.from('chat').upload(path, file)
    busy(-1)
    if (upload.error) return toast(upload.error.message, true)

    image = db.storage.from('chat').getPublicUrl(path).data.publicUrl
  }

  const ok = await run(db.from('messages').insert({
    user_id: threadId,
    sender_id: S.me.id,
    sender_name: S.me.name,
    from_admin: isAdmin,
    body,
    image
  }))

  if (!ok) return

  form.reset()
  if (!isAdmin) S.lastSend = Date.now()
  S.reopen = false
  await loadChat()
}


/* ---------- 9. MODAL ---------- */
function modal(html, cls = '') {
  $('#modal').innerHTML = `<div class="box ${cls}">${html}<button class="x" data-close aria-label="Tutup">✕</button></div>`
  $('#modal').classList.add('open')
}

function closeModal() {
  infoSeq++
  $('#modal').classList.remove('open')
  history.replaceState(null, '', location.pathname)
}

const ZOOMBAR = `
  <div class="zoombar">
    <button data-zoom="out" aria-label="Perkecil">−</button>
    <button data-zoom="reset" aria-label="Ukuran asli">1:1</button>
    <button data-zoom="in" aria-label="Perbesar">+</button>
  </div>`

const zoom = { z: 1, x: 0, y: 0 }
let drag = null

function applyZoom(stage) {
  const images = stage.querySelectorAll('.slide img')
  images.forEach(img => { img.style.transform = '' })

  const img = images[+stage.dataset.i]
  if (img) img.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})`

  stage.classList.toggle('zoomed', zoom.z > 1)
}

function setZoom(stage, z) {
  zoom.z = Math.min(4, Math.max(1, z))

  if (zoom.z === 1) {
    zoom.x = 0
    zoom.y = 0
  }
  applyZoom(stage)
}

async function openBook(id) {
  // lihat buku berdasarkan ID
  busy(1)
  const { data: b, error } = await db.from('books').select('*').eq('id', id).single()
  busy(-1)
  if (error) return toast('Buku tidak ditemukan', true)

  zoom.z = 1
  zoom.x = 0
  zoom.y = 0
  history.replaceState(null, '', '#buku=' + id)

  const ebook = kindOf(b) === 'ebook'
  const slides = b.slides || []
  const images = (ebook ? [b.cover || slides[0]] : [b.cover, ...slides]).filter(Boolean)
  const me = S.me
  const active = l => ['booking', 'approved', 'dipinjam'].includes(l.status)
  const already = S.mine.some(l => l.book_id === b.id && active(l))
  const hasBooking = S.mine.some(l => ['booking', 'approved'].includes(l.status))
  const hasRent = S.mine.some(l => l.status === 'dipinjam')
  const limitBooking = !S.set.multi_book && hasBooking
  const limitRent = !S.set.multi_rent && hasRent
  const canBook = b.stock > 0 && !already && !limitBooking && !limitRent

  // e-book: baca online / unduh PDF
  const mark = ebook ? getMark(b.id) : null
  const canRead = ebook && (b.pdf_url || slides.length)
  const canDl = ebook && b.pdf_url && b.can_download !== false

  const readButtons = ebook
    ? `${canRead
      ? `<button class="btn" data-read="${b.id}">${mark ? `${ico('play', 'fill')}Lanjutkan (hlm ${mark.page})` : `${ico('book')}Baca online`}</button>`
      : '<p class="hint">E-book ini belum punya berkas.</p>'}
       ${canRead && mark ? `<button class="btn ghost" data-read="${b.id}" data-fresh="1">${ico('restart')}Dari awal</button>` : ''}
       ${canDl ? `<button class="btn ghost" data-dl="${b.id}">${ico('download')}Unduh PDF</button>` : ''}`
    : ''

  let note = ''
  if (!ebook) {
    if (already) note = 'Kamu sudah booking atau meminjam buku ini.'
    else if (limitBooking) note = 'Kamu masih punya booking aktif. Selesaikan atau batalkan dulu.'
    else if (limitRent) note = 'Kembalikan buku yang sedang kamu pinjam dulu sebelum booking lagi.'
  }

  let actions = ''

  if (!me) {
    actions = ebook ? readButtons : '<p class="hint">Masuk dulu untuk booking buku ini.</p>'
  } else if (me.role === 'admin') {
    actions = `
      ${readButtons}
      <button class="btn" data-edit="${b.id}">Edit</button>
      <button class="btn danger" data-del="${b.id}">Hapus</button>`
  } else if (ebook) {
    actions = readButtons
  } else {
    // durasi: tetap 5 hari, kecuali admin menyalakan "Variasi durasi"
    const duration = S.set.duration_var
      ? `<select id="days" aria-label="Lama pinjam">
           <option value="3">3 hari</option>
           <option value="5" selected>5 hari</option>
           <option value="7">7 hari</option>
           <option value="14">14 hari</option>
           <option value="custom">Custom</option>
         </select>
         <input id="custom" type="number" min="1" max="28" placeholder="1-28 hari" hidden>`
      : ''

    actions = `
      ${duration}
      <button class="btn" data-book="${b.id}" ${canBook ? '' : 'disabled'}>Booking buku</button>`
  }

  const durationNote = ebook || me?.role === 'admin' ? '' : `
    <p class="hint durnote">${ico('clock')} ${S.set.duration_var ? 'Pilih lama pinjam sesukamu.' : `Durasi pinjam ${DEFAULT_DAYS} hari.`} Buku bisa dikembalikan kapan saja.</p>`

  const stockLine = ebook
    ? `<p class="ok" style="margin-top:.6rem"><b>${ico('tablet')}E-book · bisa dibaca online${canDl ? ' atau diunduh (PDF)' : ''}</b></p>`
    : `<p class="${b.stock ? 'ok' : 'no'}" style="margin-top:.6rem"><b>${b.stock ? 'Stok tersedia: ' + b.stock + (b.limited ? LIMITED_HTML : '') : 'Stok habis'}</b></p>`

  modal(`
    <div class="stage" data-i="0" data-n="${images.length}">
      <div class="track">
        ${images.map(u => `<div class="slide"><img src="${esc(u)}" alt=""></div>`).join('') || `<div class="slide">${ico('book')}</div>`}
      </div>
      ${images.length ? ZOOMBAR : ''}
      ${images.length > 1 ? `
        <button class="snav l" data-slide="-1" aria-label="Sebelumnya">&lt;</button>
        <button class="snav r" data-slide="1" aria-label="Berikutnya">&gt;</button>
        <span class="count">1 / ${images.length}</span>` : ''}
    </div>
    <h2>${esc(b.title)}${ebook ? ' <span class="chip">E-BOOK</span>' : ''}</h2>
    <p class="hint">${esc(b.author)} · ${esc(b.category)} · ID ${b.id}</p>
    ${bookFacts(b)}
    <p style="margin-top:.6rem">${esc(b.description) || 'Belum ada deskripsi.'}</p>
    ${stockLine}
    ${durationNote}
    <div class="act">${actions}</div>
    <p class="hint" style="margin-top:.6rem">${note}</p>`)
}

function readDays() {
  const select = $('#days')
  if (!select) return DEFAULT_DAYS   // variasi durasi mati: selalu tetap

  if (select.value !== 'custom') return +select.value

  const n = parseInt($('#custom').value, 10)
  return n >= 1 && n <= 28 ? n : null
}

async function uploadImage(file) {
  if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
    toast(file.name + ': hanya gambar, maksimal 2 MB', true)
    return null
  }

  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^\w.-]/g, '_')}`

  busy(1)
  const { error } = await db.storage.from('books').upload(path, file)
  busy(-1)

  if (error) {
    toast(error.message, true)
    return null
  }
  return db.storage.from('books').getPublicUrl(path).data.publicUrl
}

// unggah PDF e-book ke bucket "ebooks" (hanya admin)
async function uploadPdf(file) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    toast(file.name + ': hanya berkas PDF', true)
    return null
  }
  if (file.size > EBOOK_MAX_MB * 1024 * 1024) {
    toast(`PDF maksimal ${EBOOK_MAX_MB} MB`, true)
    return null
  }

  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^\w.-]/g, '_')}`

  toast('Mengunggah PDF, mohon tunggu...')
  busy(1)
  const { error } = await db.storage.from('ebooks').upload(path, file, { contentType: 'application/pdf' })
  busy(-1)

  if (error) {
    toast(error.message, true)
    return null
  }
  return db.storage.from('ebooks').getPublicUrl(path).data.publicUrl
}

const pv = { cover: '', slides: [] }   // URL sementara untuk file yang baru dipilih

function drawPreview() {
  const form = $('#bf')
  if (!form || !$('#bprev')) return

  const f = form.elements
  const cover = pv.cover || f.cover.value.trim()
  const slides = f.slides.value.split('\n').map(s => s.trim()).filter(Boolean).concat(pv.slides)
  const stock = +f.stock.value
  const limited = f.limited && f.limited.checked
  const kind = f.kind ? f.kind.value : 'fisik'

  $('#bprev').innerHTML = `
    <p class="hint">Pratinjau (seperti tampilan di katalog)</p>
    <div class="prev-row">
      <article class="card prev-card">
        <div class="cover">${ico('book')}${cover ? `<img src="${esc(cover)}" alt="" onerror="this.remove()">` : ''}${kind === 'ebook' ? '<span class="kbadge">E-BOOK</span>' : ''}</div>
        <div class="ci">
          <h3>${esc(f.title.value) || 'Judul buku'}</h3>
          <p>${esc(f.author.value) || 'Penulis'}</p>
          ${bookMeta({ publish_year: f.year.value, pages: f.pages.value })}
          ${stockLabel({ stock, limited, kind })}
        </div>
      </article>
      <div class="prev-slides">
        ${slides.length
      ? slides.map(u => `<img src="${esc(u)}" alt="" onerror="this.remove()">`).join('')
      : '<p class="hint">Gambar slide akan tampil di sini.</p>'}
      </div>
    </div>`
}

function bookForm(b = {}) {
  ;[pv.cover, ...pv.slides].filter(Boolean).forEach(u => URL.revokeObjectURL(u))
  pv.cover = ''
  pv.slides = []

  const kind = b.id ? kindOf(b) : S.kind

  const field = (name, placeholder, required = '') =>
    `<input name="${name}" placeholder="${placeholder}" value="${esc(b[name])}" ${required}>`

  modal(`
    <h2>${b.id ? 'Edit buku' : 'Tambah buku'}</h2>
    <form id="bf" data-id="${b.id || ''}" data-bkind="${kind}">
      <input type="hidden" name="kind" value="${kind}">
      <div class="tabs">
        <button type="button" class="${kind === 'fisik' ? 'on' : ''}" data-kindsel="fisik">${ico('book')}Buku Fisik</button>
        <button type="button" class="${kind === 'ebook' ? 'on' : ''}" data-kindsel="ebook">${ico('tablet')}E-Book</button>
      </div>
      ${field('title', 'Judul', 'required')}
      ${field('author', 'Penulis')}
      <select name="category" required>${categoryOptions(b.category, false)}</select>
      <input name="stock" class="k-fisik" type="number" min="0" placeholder="Stok" value="${b.stock ?? 1}" required>
      <div class="row2">
        <label class="hint">Tahun terbit
          <input name="year" type="number" min="1000" max="${new Date().getFullYear() + 1}" placeholder="mis. 2019" value="${esc(b.publish_year)}">
        </label>
        <label class="hint">Jumlah halaman
          <input name="pages" type="number" min="1" max="10000" placeholder="mis. 320" value="${esc(b.pages)}">
        </label>
      </div>
      <div class="ebblock k-ebook">
        <input name="pdf_url" placeholder="URL berkas PDF (kosongkan jika unggah file)" value="${esc(b.pdf_url)}">
        <label class="filebtn">${ico('file')}<span id="pdfname">Pilih file PDF (maks. ${EBOOK_MAX_MB} MB)</span>
          <input type="file" name="pdffile" accept="application/pdf" hidden>
        </label>
        <label class="check">
          <input type="checkbox" name="can_download" ${b.can_download === false ? '' : 'checked'}>
          <span>Izinkan unduh PDF</span>
        </label>
        <label class="hint">Arah baca
          <select name="read_dir">
            <option value="ltr" ${b.read_dir === 'rtl' ? '' : 'selected'}>Kiri ke kanan (buku biasa)</option>
            <option value="rtl" ${b.read_dir === 'rtl' ? 'selected' : ''}>Kanan ke kiri</option>
          </select>
        </label>
        <p class="hint">Tanpa PDF, isi "URL gambar slide" di bawah sebagai halaman e-book.</p>
      </div>
      <label class="check k-fisik">
        <input type="checkbox" name="limited" ${b.limited ? 'checked' : ''}>
        <span>LIMITED TIME <small class="hint">(label kuning di samping stok)</small></span>
      </label>
      ${field('cover', 'URL thumbnail (gambar sampul)')}
      <label class="hint">Atau unggah file thumbnail (maks. 2 MB)
        <input type="file" name="coverfile" accept="image/*">
      </label>
      <textarea name="slides" placeholder="URL gambar slide / halaman, satu per baris">${esc((b.slides || []).join('\n'))}</textarea>
      <label class="hint">Atau unggah file gambar slide (boleh banyak)
        <input type="file" name="slidefiles" accept="image/*" multiple>
      </label>
      <textarea name="description" placeholder="Deskripsi">${esc(b.description)}</textarea>
      <div id="bprev"></div>
      <button class="btn">Simpan buku</button>
    </form>`)
  drawPreview()
}

function authForm(isRegister) {
  S.authReg = isRegister
  const tab = S.authTab

  const tabs = [['username', 'Username'], ['email', 'E-mail']]
    .map(([key, label]) => `<button type="button" class="${tab === key ? 'on' : ''}" data-atab="${key}">${label}</button>`)
    .join('')

  const fields = tab === 'username'
    ? '<input name="username" placeholder="Username" maxlength="20" autocomplete="username" required>'
    : `${isRegister ? '<input name="name" placeholder="Nama lengkap" required>' : ''}
       <input name="email" type="email" placeholder="E-mail" autocomplete="email" required>`

  modal(`
    <h2>${isRegister ? 'Daftar akun' : 'Masuk'}</h2>
    <div class="tabs">${tabs}</div>
    <form id="af" data-reg="${isRegister}" data-tab="${tab}">
      ${fields}
      <input name="password" type="password" minlength="6" placeholder="Kata sandi (min. 6 karakter)" autocomplete="${isRegister ? 'new-password' : 'current-password'}" required>
      <button class="btn">${isRegister ? 'Daftar' : 'Masuk'}</button>
    </form>
    ${isRegister && tab === 'username' ? '<p class="hint" style="margin-top:.6rem">Tanpa e-mail. Nanti kamu bisa menambahkan e-mail untuk mereset kata sandi.</p>' : ''}
    ${isRegister || !S.set.email_verif ? '' : '<p class="hint" style="margin-top:.6rem"><a href="#" data-forgot>Lupa kata sandi?</a></p>'}
    <p class="hint" style="margin-top:.4rem">
      ${isRegister ? 'Sudah punya akun?' : 'Belum punya akun?'}
      <a href="#" data-auth="${isRegister ? 0 : 1}">${isRegister ? 'Masuk' : 'Daftar'}</a>
    </p>`)
}

function openAccounts() {
  const saved = loadSaved()

  // belum ada akun tersimpan: langsung ke form masuk
  if (!saved.length) return authForm(0)

  const rows = saved.map(a => `
    <div class="acct ${a.id === S.me?.id ? 'on' : ''}" data-switch="${a.id}">
      <span class="ava">${esc(a.name[0] || '?').toUpperCase()}</span>
      <div>
        <b>${esc(a.name)}</b>
        <small>${a.username ? '@' + esc(a.username) : esc(a.email || 'tanpa e-mail')} · ${a.role === 'admin' ? 'admin' : 'user'}</small>
      </div>
      ${a.id === S.me?.id ? '<span class="chip">aktif</span>' : ''}
      <button class="forget" data-forget="${a.id}" title="Hapus dari perangkat ini">✕</button>
    </div>`).join('')

  modal(`
    ${accountMenu()}
    <h2>Akun di perangkat ini</h2>
    <p class="hint" style="margin-bottom:.8rem">Ketuk akun untuk berpindah tanpa mengisi email dan kata sandi lagi.</p>
    ${rows}
    <div class="act">
      <button class="btn" data-auth="0">Tambah akun lain</button>
      ${S.me ? '<button class="btn ghost" data-out>Keluar</button>' : ''}
    </div>
    <p class="hint" style="margin-top:.8rem">Sesi disimpan di perangkat ini saja. Jangan dipakai di komputer umum.</p>`)
}


const CANCEL_REASONS = [
  'Salah memilih buku',
  'Sudah menemukan buku di tempat lain',
  'Tidak jadi membutuhkan buku ini',
  'Tidak sempat datang ke perpustakaan'
]

function cancelStep1(id) {
  modal(`
    <h2>Batalkan booking</h2>
    <p class="hint">Langkah 1 dari 2: pilih alasan pembatalan.</p>
    <form id="cr" data-id="${id}">
      <select name="reason">
        ${CANCEL_REASONS.map(r => `<option>${r}</option>`).join('')}
        <option value="__lain">Lainnya (tulis sendiri)</option>
      </select>
      <textarea name="custom" placeholder="Tulis alasanmu" maxlength="200" hidden></textarea>
      <button class="btn">Lanjut</button>
    </form>`)
}

function cancelStep2() {
  modal(`
    <h2>Yakin batalkan booking?</h2>
    <p class="hint">Langkah 2 dari 2: konfirmasi.</p>
    <p style="margin-top:.6rem">Alasan: <b>${esc(S.cancel.reason)}</b></p>
    <div class="act">
      <button class="btn danger" data-cancelyes>Ya, batalkan</button>
      <button class="btn ghost" data-close>Kembali</button>
    </div>`)
}

async function endChat() {
  if (!currentThread()) return

  const yes = await ask({
    title: 'Akhiri percakapan?',
    text: 'Setelah diakhiri, pesan baru hanya bisa dikirim dengan memulai percakapan baru.',
    yes: 'Ya, akhiri',
    no: 'Batal',
    danger: true
  })
  if (!yes) return

  const isAdmin = S.me.role === 'admin'

  const ok = await run(db.from('messages').insert({
    user_id: currentThread(),
    sender_id: S.me.id,
    sender_name: S.me.name,
    from_admin: isAdmin,
    ended: true,
    body: 'Percakapan diakhiri oleh ' + (isAdmin ? 'admin' : 'pengguna')
  }))

  if (ok) await loadChat()
}


/* ---------- 9b. AKUN: username, e-mail, verifikasi kode ---------- */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/

function makeAlias(domain) {
  return 'u' + crypto.randomUUID().replace(/-/g, '').slice(0, 16) + '@' + domain
}

// masuk atau daftar lewat tab Username / E-mail
async function authenticate(isRegister, tab, ident, data) {
  if (tab === 'username' && !USERNAME_RE.test(ident)) {
    return { error: { message: 'Username 3-20 karakter: huruf kecil, angka, atau _' } }
  }

  if (!isRegister) {
    const found = await db.rpc('login_email', { kind: tab, ident })
    if (!found.data) return { error: { message: 'Invalid login credentials' } }
    return db.auth.signInWithPassword({ email: found.data, password: data.password })
  }

  // daftar: cek dulu di database apakah username / e-mail sudah ada
  const used = tab === 'username'
    ? !(await db.rpc('username_free', { u: ident })).data
    : (await db.rpc('email_taken', { e: ident })).data

  if (used) {
    return { error: { message: tab === 'username' ? 'Username sudah dipakai' : 'E-mail sudah dipakai akun lain' } }
  }

  const meta = tab === 'username'
    ? { name: ident, username: ident }
    : { name: data.name, contact_email: ident }

  // coba domain alias satu per satu sampai Supabase menerima
  let result
  for (const domain of ALIAS_DOMAINS) {
    result = await db.auth.signUp({ email: makeAlias(domain), password: data.password, options: { data: meta } })

    const rejected = result.error && /email address .* is invalid/i.test(result.error.message)
    if (!rejected) break
  }
  return result
}

async function refreshMe() {
  const { data } = await db.from('profiles').select('*').eq('id', S.me.id).single()
  S.me = data

  const { data: current } = await db.auth.getSession()
  if (current.session && S.me) saveAccount(current.session, S.me)

  render()
}

function accountMenu() {
  const m = S.me
  if (!m) return ''

  const on = S.set.email_verif === true   // sistem verifikasi e-mail dinyalakan admin?
  const verified = m.email_verified

  return `
    <div class="accmenu">
      <div>
        <b>${esc(m.name)}</b>
        <small>${m.username ? '@' + esc(m.username) : 'Belum ada username'}${on ? ` · ${m.email ? esc(m.email) : 'Belum ada e-mail'}${verified ? ' ✔ terverifikasi' : ''}` : ''}</small>
      </div>
      ${on && !verified ? `<button class="btn" data-acc="email">${m.email ? 'Verifikasi E-mail' : 'Tambahkan E-mail'}<i class="warn inline">!</i></button>` : ''}
      ${on || !m.username ? `<button class="btn ghost" data-acc="username">${m.username ? 'Ganti username' : 'Atur username'}</button>` : ''}
      ${on ? `<button class="btn ghost" data-acc="password" ${verified ? '' : 'disabled'}>Ubah kata sandi</button>` : ''}
      ${on && !verified ? '<p class="hint">Verifikasi e-mail agar bisa mereset kata sandi dan mengganti username.</p>' : ''}
    </div>`
}

// layar memasukkan kode (dipakai semua alur)
function codeStep(title, email, withPassword) {
  modal(`
    <h2>${title}</h2>
    <p class="hint">Kode rahasia dikirim ke <b>${esc(email)}</b>. Cek juga folder spam.</p>
    <form id="cs">
      <input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="Kode dari e-mail" maxlength="10" required>
      ${withPassword ? '<input name="password" type="password" minlength="6" placeholder="Kata sandi baru (min. 6 karakter)" autocomplete="new-password" required>' : ''}
      <button class="btn">Konfirmasi</button>
    </form>
    <p class="hint" style="margin-top:.6rem"><a href="#" data-resend>Kirim ulang kode</a></p>`)
}

async function verifyCode(email, code, type) {
  busy(1)
  const { error } = await db.auth.verifyOtp({ email, token: code.trim(), type })
  busy(-1)

  if (error) {
    toast('Kode salah atau sudah kedaluwarsa', true)
    return false
  }
  return true
}

// -- verifikasi / tambah e-mail --
function emailStep1() {
  modal(`
    <h2>${S.me.email ? 'Verifikasi e-mail' : 'Tambahkan e-mail'}</h2>
    <p class="hint">Kami kirim kode rahasia ke e-mail ini untuk membuktikan e-mail itu milikmu.</p>
    <form id="f-email">
      <input name="email" type="email" placeholder="E-mail" value="${esc(S.me.email)}" required>
      <button class="btn">Kirim kode</button>
    </form>`)
}

async function submitEmail(data) {
  const email = data.email.trim().toLowerCase()

  const send = async () => {
    if (email !== S.me.email && !(await run(db.rpc('set_contact_email', { e: email })))) return false
    return run(db.auth.updateUser({ email }), 'Kode dikirim ke ' + email)
  }

  if (!(await send())) return

  S.flow = {
    resend: send,
    done: async form => {
      if (!(await verifyCode(email, form.code, 'email_change'))) return

      const result = await db.rpc('email_verified_now')
      if (result.error || !result.data) return toast('Verifikasi gagal, kirim ulang kode lalu coba lagi', true)

      toast('E-mail terverifikasi!')
      closeModal()
      refreshMe()
    }
  }
  codeStep('Masukkan kode e-mail', email)
}

// -- ubah / reset kata sandi (butuh e-mail terverifikasi) --
function passStep1() {
  modal(`
    <h2>${S.me ? 'Ubah kata sandi' : 'Lupa kata sandi'}</h2>
    <p class="hint">Kode rahasia dikirim ke e-mail yang sudah terverifikasi.</p>
    <form id="f-pass">
      <input name="email" type="email" placeholder="E-mail terverifikasi" value="${esc(S.me?.email)}" ${S.me ? 'readonly' : ''} required>
      <button class="btn">Kirim kode</button>
    </form>`)
}

async function submitPass(data) {
  const email = data.email.trim().toLowerCase()
  const send = () => run(db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }), 'Kode dikirim ke ' + email)

  if (!(await send())) return

  S.flow = {
    resend: send,
    done: async form => {
      if (form.password.length < 6) return toast('Kata sandi minimal 6 karakter', true)
      if (!(await verifyCode(email, form.code, 'email'))) return
      if (await run(db.auth.updateUser({ password: form.password }), 'Kata sandi diperbarui')) closeModal()
    }
  }
  codeStep('Kode dan kata sandi baru', email, true)
}

// -- atur / ganti username (ganti: verified, 1x per 3 hari, konfirmasi kode) --
function usernameWait() {
  const at = S.me.username_changed_at
  if (!at) return 0
  return Math.ceil((new Date(at).getTime() + 3 * 86400000 - Date.now()) / 86400000)
}

function userStep1() {
  const m = S.me

  modal(`
    <h2>${m.username ? 'Ganti username' : 'Atur username'}</h2>
    <p class="hint">${m.username
      ? `Username sekarang: @${esc(m.username)}. Hanya bisa diganti 1x per 3 hari dan perlu kode e-mail.`
      : 'Dengan username kamu bisa masuk tanpa mengetik e-mail.'}</p>
    <form id="f-user">
      <input name="username" placeholder="Username baru (huruf kecil, angka, _)" maxlength="20" required>
      <button class="btn">${m.username ? 'Kirim kode' : 'Simpan username'}</button>
    </form>`)
}

async function submitUser(data) {
  const username = data.username.trim().toLowerCase()

  if (!USERNAME_RE.test(username)) return toast('Username 3-20 karakter: huruf kecil, angka, atau _', true)
  if (!(await db.rpc('username_free', { u: username })).data) return toast('Username sudah dipakai', true)

  // pertama kali: langsung disimpan
  if (!S.me.username) {
    if (await run(db.rpc('set_username', { u: username }), 'Username disimpan')) {
      closeModal()
      refreshMe()
    }
    return
  }

  if (!S.me.email_verified) return toast('Verifikasi e-mail dulu', true)
  if (usernameWait() > 0) return toast(`Username baru bisa diganti ${usernameWait()} hari lagi`, true)

  const email = S.me.email
  const send = () => run(db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }), 'Kode dikirim ke ' + email)

  if (!(await send())) return

  S.flow = {
    resend: send,
    done: async form => {
      if (!(await verifyCode(email, form.code, 'email'))) return

      if (await run(db.rpc('set_username', { u: username }), 'Username diganti')) {
        closeModal()
        refreshMe()
      }
    }
  }
  codeStep('Konfirmasi ganti username', email)
}


/* ---------- 9c. VERSI (dari GitHub) & MENU INFORMASI ---------- */
const V = { label: VERSION_FALLBACK, commits: null, latest: null, log: null, logErr: false }

const GH_ON = () => GITHUB_REPO !== 'OWNER/REPO' && /^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPO)

function infoHasNew() {
  try {
    return localStorage.getItem('log-seen') !== RELEASE_ID
  } catch (e) {
    return false
  }
}

function drawVersion() {
  const ver = $('#ver')
  if (ver) {
    ver.textContent = V.label
    ver.title = V.commits ? V.commits + ' commit di GitHub (klik untuk detail)' : 'Lihat versi lengkap'
  }

  const btn = $('#infobtn')
  if (btn) btn.classList.toggle('hasnew', infoHasNew())

  drawHamb()
  drawDrawerFoot()
}

// versi = v{VERSION_MAJOR}.{jumlah commit}. Jumlah commit dibaca dari header "Link" GitHub API.
async function loadVersion() {
  drawVersion()
  if (!GH_ON()) return

  let cached = null
  try {
    cached = JSON.parse(localStorage.getItem('gh-version'))
  } catch (e) { }

  // GitHub membatasi 60 permintaan/jam tanpa login, jadi hasil disimpan 1 jam
  if (cached && Date.now() - cached.t < 3600000) {
    Object.assign(V, cached.v)
    return drawVersion()
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=1`)
    if (!res.ok) throw new Error('github ' + res.status)

    const body = await res.json()
    const last = (res.headers.get('Link') || '').match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/)
    const commits = last ? +last[1] : body.length

    V.commits = commits
    V.label = `v${VERSION_MAJOR}.${commits}`
    V.latest = body[0]
      ? { sha: body[0].sha.slice(0, 7), msg: body[0].commit.message.split('\n')[0], date: body[0].commit.author.date }
      : null

    try {
      localStorage.setItem('gh-version', JSON.stringify({ t: Date.now(), v: { commits: V.commits, label: V.label, latest: V.latest } }))
    } catch (e) { }
  } catch (e) {
    if (cached) Object.assign(V, cached.v)   // gagal: pakai data lama kalau ada
  }

  drawVersion()
}

async function loadLog() {
  if (V.log || !GH_ON()) return

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=20`)
    if (!res.ok) throw new Error('github ' + res.status)

    const body = await res.json()
    V.log = body.map(c => ({
      sha: c.sha.slice(0, 7),
      msg: c.commit.message.split('\n')[0],
      date: c.commit.author.date
    }))
  } catch (e) {
    V.logErr = true
  }
}

const INFO_TABS = [['about', 'Tentang'], ['log', 'Update Log'], ['lokasi', 'Lokasi'], ['dev', 'Developer'], ['more', 'Versi Lengkap']]

function safeLink(url) {
  return /^https?:\/\//i.test(url || '') ? esc(url) : ''
}

function infoBody(tab) {
  if (tab === 'log') {
    const notes = CHANGELOG.map(c => `
      <div class="commit">
        <b>${esc(c.title)}</b><small>${esc(c.date)}</small>
        <ul>${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      </div>`).join('')

    let git = ''
    if (GH_ON()) {
      git = V.log
        ? '<h3>Riwayat commit GitHub</h3>' + V.log.map(c => `
            <div class="commit"><b>${esc(c.msg)}</b><small>${esc(c.sha)} · ${fmtDateTime(c.date)}</small></div>`).join('')
        : V.logErr
          ? '<p class="hint">Riwayat GitHub tidak bisa dimuat sekarang.</p>'
          : SPINNER
    }

    return `<h3>Pembaruan terbaru</h3>${notes}${git}`
  }

  if (tab === 'lokasi') {
    return `
      <h3>Lokasi perpustakaan</h3>
      <div class="lokasi">
        <span class="pin">${ico('pin')}</span>
        <div><b>${LOKASI}</b><p>${CATATAN}</p></div>
      </div>`
  }

  if (tab === 'dev') {
    const link = safeLink(DEVELOPER.link)

    return `
      <h3>Developer</h3>
      <div class="commit">
        <b>${esc(DEVELOPER.name)}</b><small>${esc(DEVELOPER.role)}</small>
        ${DEVELOPER.contact ? `<p>${esc(DEVELOPER.contact)}</p>` : ''}
        ${link ? `<p><a href="${link}" target="_blank" rel="noopener">${link}</a></p>` : ''}
      </div>`
  }

  if (tab === 'more') {
    const rows = [
      ['Versi', esc(V.label)],
      //      ['Jumlah commit', V.commits ?? '-'],
      //     ['Commit terbaru', V.latest ? `${esc(V.latest.sha)} · ${esc(V.latest.msg)} (${fmtDateTime(V.latest.date)})` : '-'],
      //     ['Repository', GH_ON() ? `<a href="https://github.com/${GITHUB_REPO}" target="_blank" rel="noopener">${GITHUB_REPO}</a>` : 'Belum diatur'],
      ['Rilis', esc(RELEASE_ID)],
      ['Tema', esc(document.documentElement.dataset.theme)],
      ['Jumlah buku', S.books.length],
      ['Koneksi', navigator.onLine ? 'Online' : 'Offline']
    ]

    return `
      <h3>Versi lengkap</h3>
      <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <p class="hint">Punya pertanyaan atau menemukan bug?, Hubungi Customer Service.</p>`
  }

  // tentang
  return `
    <h3>Tentang PustakaKita</h3>
    <p>PustakaKita adalah perpustakaan sekolah online. Lihat katalog, booking buku dari rumah, lalu ambil di perpustakaan setelah disetujui.</p>
    <h5>-----------------------------</h5>
    <h4>- Untuk saat ini pengambilan hanya dapat dilakukan khusus di Sekolah [ SMAN 03 Jonggol ] -</h4>
    <h5>-----------------------------</h5>
    <h3>Fitur & Layanan</h3>
    <ul>
      <li>Katalog buku dengan pencarian, kategori, dan halaman.</li>
      <li>Booking buku ${S.set.duration_var ? 'dengan durasi pilihan' : `dengan durasi ${DEFAULT_DAYS} hari`}, dan bisa dikembalikan kapan saja.</li>
      <li>Pesan langsung dengan admin untuk setiap peminjaman.</li>
      <li>E-book: baca online (horizontal / vertikal, dengan penanda halaman) atau unduh PDF.</li>
      <li>Chat Customer Service untuk pertanyaan umum.</li>
    </ul>`
}

/* ---------- LANGKAH 3: openInfo() ----------
   Di bagian "9c. VERSI & MENU INFORMASI": HAPUS fungsi openInfo() yang lama
   (yang berisi `const showNew = infoHasNew()` ... `modal(...)`), lalu TEMPEL
   seluruh kode di bawah ini di tempat yang sama.
   INFO_TABS dan infoBody() TETAP, jangan dihapus. */
 
let infoSeq = 0   // nomor animasi terakhir; animasi lama dibatalkan jika nomornya sudah berganti
 
// gerak aktif? (mati jika Potato Mode atau perangkat meminta gerak dikurangi)
const infoMotion = () => !P.potato && !matchMedia('(prefers-reduced-motion: reduce)').matches
 
const infoIsOpen = () => $('#modal').classList.contains('open') && !!$('#modal .box.info .ibody')
 
function infoTabsHtml(tab, showNew) {
  return INFO_TABS
    .map(([key, label], i) => `<button type="button" class="${tab === key ? 'on' : ''}" data-itab="${key}" style="--i:${i}">${label}${key === 'log' && showNew ? '<i class="newtag">NEW!</i>' : ''}</button>`)
    .join('')
}
 
// pil penanda tab aktif: geser & lebarkan ke tab yang dipilih
function infoPill(instant) {
  const bar = $('.itabs')
  const pill = bar && bar.querySelector('.islide')
  const on = bar && bar.querySelector('button.on')
  if (!pill || !on) return
 
  if (instant) pill.style.transition = 'none'
  pill.style.width = on.offsetWidth + 'px'
  pill.style.transform = `translateX(${on.offsetLeft}px)`
 
  if (instant) {
    void pill.offsetWidth
    pill.style.transition = ''
  }
 
  // tab aktif tergulir ke tengah (berguna di layar sempit)
  const left = Math.max(0, on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2)
  bar.scrollTo({ left, behavior: instant || !infoMotion() ? 'auto' : 'smooth' })
}
 
// pil mengikuti tab yang lebarnya sedang berubah (mis. tag NEW! menyusut)
function infoPillTrack(ms) {
  if (!infoMotion()) return infoPill(true)
 
  const end = performance.now() + ms
  const tick = () => {
    infoPill(true)
    if (performance.now() < end && $('.itabs')) requestAnimationFrame(tick)
  }
  tick()
}

// Ganti isi tab: isi lama memudar, tinggi jendela bergerak halus, isi baru masuk.
// dir: 1 = dari kanan, -1 = dari kiri, 0 = hanya memudar (mis. Update Log selesai dimuat)
function infoMorph(html, dir = 1) {
  const body = $('.ibody')
  if (!body) return
 
  const token = ++infoSeq
  const old = body.firstElementChild
 
  // tanpa gerak: langsung ganti
  if (!infoMotion() || !old) {
    body.classList.remove('sizing')
    body.style.height = ''
    body.innerHTML = `<div class="ipane">${html}</div>`
    return
  }
 
  // 1) kunci tinggi sekarang, isi lama memudar keluar
  const from = body.offsetHeight
  body.classList.add('sizing')
  body.style.height = from + 'px'
  old.style.setProperty('--dir', dir)
  old.classList.remove('in')
  old.classList.add('out')
 
  setTimeout(() => {
    if (token !== infoSeq || !$('.ibody')) return
 
    // 2) pasang isi baru dan ukur tinggi aslinya
    body.innerHTML = `<div class="ipane in" style="--dir:${dir}">${html}</div>`
    const to = body.firstElementChild.offsetHeight
 
    // 3) animasikan tinggi dari ukuran lama ke ukuran baru
    body.style.height = from + 'px'
    void body.offsetHeight
    body.style.height = to + 'px'
 
    setTimeout(() => {
      if (token !== infoSeq) return
      body.style.height = ''
      body.classList.remove('sizing')
    }, 460)
  }, 150)
}

// tab "Update Log" dibuka: tandai sudah dilihat, muat riwayat GitHub bila perlu
function infoOnLog() {
  try {
    localStorage.setItem('log-seen', RELEASE_ID)
  } catch (e) { }
  drawVersion()
 
  if (GH_ON() && !V.log && !V.logErr) {
    loadLog().then(() => {
      if (S.infoTab === 'log' && $('.ibody')) infoMorph(infoBody('log'), 0)
    })
  }
}

// pindah tab di jendela yang sudah terbuka (tanpa membangun ulang jendela)
function infoSwitch(tab) {
  if (tab === S.infoTab) return
 
  const from = INFO_TABS.findIndex(t => t[0] === S.infoTab)
  const to = INFO_TABS.findIndex(t => t[0] === tab)
  S.infoTab = tab
 
  document.querySelectorAll('.itabs [data-itab]').forEach(b => b.classList.toggle('on', b.dataset.itab === tab))
  infoPill()
 
  const hadNew = tab === 'log' && infoHasNew()
  if (tab === 'log') infoOnLog()
 
  infoMorph(infoBody(tab), to > from ? 1 : -1)
 
  // tag NEW! menyusut, pil menyesuaikan lebar tab
  if (hadNew) {
    const tag = $('.itabs .newtag')
 
    if (tag) {
      tag.classList.add('gone')
      infoPillTrack(360)
      setTimeout(() => {
        tag.remove()
        infoPill(true)
      }, infoMotion() ? 360 : 0)
    }
  }
}

function openInfo(tab) {
  // sudah terbuka: cukup ganti tab
  if (infoIsOpen()) return infoSwitch(tab)
 
  const showNew = infoHasNew()
  S.infoTab = tab
  infoSeq++
 
  if (tab === 'log') infoOnLog()
 
  modal(`
    <h2>Informasi</h2>
    <div class="tabs itabs"><i class="islide"></i>${infoTabsHtml(tab, showNew)}</div>
    <div class="ibody"><div class="ipane in">${infoBody(tab)}</div></div>`, 'info')
 
  infoPill(true)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if ($('.itabs')) infoPill(true) })
}

// layar berubah ukuran: posisi pil dihitung ulang
addEventListener('resize', () => { if ($('.itabs')) infoPill(true) })
 
// Esc menutup jendela Informasi
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || askDone || R.open) return
  if ($('#modal').classList.contains('open') && $('#modal .box.info')) {
    e.preventDefault()
    closeModal()
  }
})


/* ---------- 9d. NOTIFIKASI (riwayat) ---------- */
const NOTIF_ICON = { booking: 'clipboard', loan: 'book', return: 'inbox', chat: 'chat', pesan: 'mail', ebook: 'tablet', info: 'bell' }

const notifUnread = () => S.notifs.filter(n => !n.read).length

// panggilan database tanpa layar "busy" (untuk aksi kecil seperti menandai dibaca)
async function quiet(promise) {
  const { error } = await promise

  if (error) {
    toast(friendlyError(error), true)
    return false
  }
  return true
}

async function loadNotifs() {
  if (maintFrozen()) return
  if (!S.me) {
    S.notifs = []
    S.notifsReady = false
    return
  }

  const { data, error } = await db.from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    S.notifErr = true
    S.notifs = []
  } else {
    S.notifErr = false

    // notifikasi yang BARU masuk (belum pernah ada di daftar) dimunculkan sebagai toast
    const known = new Set(S.notifs.map(n => n.id))
    const fresh = S.notifsReady ? data.filter(n => !n.read && !known.has(n.id)) : []

    // terbaru di atas (pengelompokan per hari bergantung pada urutan ini)
    S.notifs = data.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    S.notifsReady = true

    if (P.notifToast) fresh.slice(0, 3).forEach(n => toast('Notifikasi baru: ' + n.title))
  }

  if (S.view === 'notif') drawNotifs()
  refreshBadges()
}

function dayLabel(d) {
  const start = t => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
  const diff = Math.round((start(new Date()) - start(new Date(d))) / 86400000)

  if (diff <= 0) return 'Hari ini'
  if (diff === 1) return 'Kemarin'
  return fmtDate(d)
}

function viewNotif() {
  return `
    <div class="notifwrap">
      <div class="nhead">
        <h2>Notifikasi</h2>
        <button class="btn sm" data-nreadall>${ico('check')}Tandai semua dibaca</button>
      </div>
      <p class="hint">Ketuk notifikasi untuk menandai dibaca · tahan untuk menghapus.</p>
      <div class="tabs nfilter">
        <button type="button" data-nf="all" class="${S.nf === 'all' ? 'on' : ''}">Semua</button>
        <button type="button" data-nf="unread" class="${S.nf === 'unread' ? 'on' : ''}">Belum dibaca <i id="nf-count" class="nb" hidden></i></button>
      </div>
      <div id="nlist"></div>
    </div>`
}

function drawNotifs(animate) {
  const box = $('#nlist')
  if (!box) return

  const unread = notifUnread()
  const badge = $('#nf-count')

  if (badge) {
    badge.textContent = unread > 99 ? '99+' : unread
    badge.hidden = unread <= 0
  }

  document.querySelectorAll('[data-nf]').forEach(b => b.classList.toggle('on', b.dataset.nf === S.nf))

  if (S.notifErr) {
    box.innerHTML = '<p class="empty">Fitur notifikasi belum aktif di database. Jalankan file SQL pembaruan di Supabase (bagian Notifikasi).</p>'
    return
  }

  const list = S.nf === 'unread' ? S.notifs.filter(n => !n.read) : S.notifs

  if (!list.length) {
    box.innerHTML = `<p class="empty">${S.nf === 'unread' ? 'Tidak ada notifikasi yang belum dibaca.' : 'Belum ada notifikasi.'}</p>`
    return
  }

  let html = ''
  let last = ''
  let i = 0

  list.forEach(n => {
    const group = dayLabel(n.created_at)

    if (group !== last) {
      html += `<div class="ngrp">${esc(group)}</div>`
      last = group
    }

    html += `
      <div class="nitem ${n.read ? '' : 'unread'}" data-nid="${n.id}" style="--i:${Math.min(i++, 12)}" role="button" tabindex="0">
        <span class="nico" aria-hidden="true">${ico(NOTIF_ICON[n.kind] || 'bell')}</span>
        <div class="nbody">
          <b>${esc(n.title)}</b>
          ${n.body ? `<p>${esc(n.body)}</p>` : ''}
          <small>${timeAgo(n.created_at)} · ${fmtDateTime(n.created_at)}</small>
        </div>
        ${n.link ? `<button type="button" class="btn sm ghost nopen" data-nopen="${esc(n.link)}">Lihat</button>` : ''}
        <i class="ndot" aria-hidden="true"></i>
      </div>`
  })

  box.classList.toggle('stag', !!animate)
  box.innerHTML = html
}

async function markNotif(id) {
  const n = S.notifs.find(x => x.id === id)
  if (!n || n.read) return

  n.read = true
  drawNotifs()
  refreshBadges()

  if (!(await quiet(db.from('notifications').update({ read: true }).eq('id', id)))) loadNotifs()
}

async function markAllNotifs() {
  if (!notifUnread()) return toast('Semua notifikasi sudah dibaca')

  S.notifs.forEach(n => { n.read = true })
  drawNotifs()
  refreshBadges()

  const ok = await quiet(db.from('notifications').update({ read: true }).eq('user_id', S.me.id).eq('read', false))
  if (ok) toast('Semua notifikasi ditandai dibaca')
  else loadNotifs()
}

let askDelBusy = false

async function askDeleteNotif(id) {
  if (askDelBusy || askDone) return
  askDelBusy = true

  const yes = await ask({
    title: 'Hapus notifikasi ini?',
    text: 'Notifikasi akan dihapus dari riwayatmu.',
    yes: 'Ya, hapus',
    no: 'Batal',
    danger: true,
    icon: 'trash'
  })
  askDelBusy = false
  if (!yes) return

  const el = document.querySelector(`[data-nid="${id}"]`)
  if (el) el.classList.add('removing')
  await new Promise(resolve => setTimeout(resolve, P.potato ? 0 : 280))

  S.notifs = S.notifs.filter(n => n.id !== id)
  drawNotifs()
  refreshBadges()

  if (!(await quiet(db.from('notifications').delete().eq('id', id)))) loadNotifs()
}

// pindah ke halaman tujuan sebuah notifikasi
function goLink(link) {
  if (link === 'chat') return setChat(true)

  if (link === 'saya' && S.me?.role === 'admin') link = 'admin'
  if (!['saya', 'pesan', 'admin', 'katalog', 'notif', 'setelan'].includes(link)) return

  S.view = link
  S.pOpen = false
  render(true)
  if (link === 'pesan') loadPesan(true)
}


/* ---------- 9e. SETELAN (halaman Setelan) ---------- */
function viewSetelan() {
  const me = S.me
  const theme = document.documentElement.dataset.theme

  const chk = (id, title, hint, on) => `
    <label class="setting">
      <input type="checkbox" id="${id}" ${on ? 'checked' : ''}>
      <span>${title}<small>${hint}</small></span>
    </label>`

  const seg = (pref, cur, options) => `
    <div class="tabs">
      ${options.map(([val, label]) => `<button type="button" class="${cur === val ? 'on' : ''}" data-pref="${pref}" data-val="${val}">${label}</button>`).join('')}
    </div>`

  const sec = (i, title, body) => `<section class="sec" style="--i:${i}"><h3>${title}</h3>${body}</section>`

  const bio = me
    ? `
      <div class="bio">
        <span class="ava">${esc(me.name[0] || '?').toUpperCase()}</span>
        <div>
          <b>${esc(me.name)}</b>
          <div class="hint">${me.username ? '@' + esc(me.username) : 'Belum ada username'} · ${me.role === 'admin' ? 'Admin' : 'Pengguna'}</div>
        </div>
      </div>
      <form id="f-bio">
        <label class="hint">Nama tampilan
          <input name="name" value="${esc(me.name)}" minlength="2" maxlength="40" required>
        </label>
        <label class="hint">Kelas (opsional)
          <input name="kelas" value="${esc(me.kelas)}" maxlength="20" placeholder="mis. X.5">
        </label>
        <button class="btn">Simpan biodata</button>
      </form>
      <dl class="kv" style="margin-top:.9rem">
        <dt>Username</dt><dd>${me.username ? '@' + esc(me.username) : '-'}</dd>
        <dt>E-mail</dt><dd>${me.email ? esc(me.email) : 'Belum ada'}${S.set.email_verif && me.email_verified ? ' ✔' : ''}</dd>
        <dt>Peran</dt><dd>${me.role === 'admin' ? 'Admin' : 'Pengguna'}</dd>
        <dt>Bergabung</dt><dd>${me.created_at ? fmtDate(me.created_at) : '-'}</dd>
      </dl>`
    : `
      <p class="hint">Masuk untuk melihat dan mengubah biodatamu.</p>
      <div class="rowbtns"><button class="btn" data-accounts>Masuk / Daftar</button></div>`

  return `
    <div class="setwrap">
      <h2>Setelan</h2>
      ${sec(0, ico('user') + ' Biodata', bio)}
      ${sec(1, ico('palette') + ' Tampilan', `
        <p class="hint" style="margin-bottom:.4rem">Tema warna (juga bisa diganti dari tombol di header)</p>
        <div class="tabs">
          ${THEMES.map(t => `<button type="button" class="${theme === t.name ? 'on' : ''}" data-settheme="${t.name}">${ico(t.icon)}${t.name[0].toUpperCase() + t.name.slice(1)}</button>`).join('')}
        </div>
        ${chk('p-potato', ico('bolt') + ' Potato Mode', 'Matikan semua animasi dan efek berat supaya website lebih ringan di perangkat lama.', P.potato)}`)}
      ${sec(2, ico('book') + ' E-Book', `
        <p class="hint" style="margin-bottom:.4rem">Mode baca</p>
        ${seg('readMode', P.readMode, [['auto', 'Otomatis'], ['h', 'Horizontal'], ['v', 'Vertikal']])}
        <p class="hint" style="margin:-.2rem 0 .9rem">Otomatis: Horizontal (geser halaman) saat layar landscape, Vertikal (gulir) saat portrait.</p>
        <p class="hint" style="margin-bottom:.4rem">Ukuran halaman (mode horizontal)</p>
        ${seg('fit', P.fit, [['screen', 'Muat layar'], ['width', 'Isi lebar layar']])}
        <p class="hint" style="margin:-.2rem 0 .9rem">Isi lebar: halaman memenuhi lebar layar, gulir ke bawah untuk sisanya. Arah baca (kiri-kanan) diatur per e-book lewat tombol panah di pembaca.</p>
        ${chk('p-resume', 'Lanjutkan dari penanda', 'Buka e-book langsung di halaman penanda terakhir.', P.resume)}
        ${chk('p-wake', 'Layar tetap menyala', 'Cegah layar mati saat membaca (jika didukung perangkat).', P.wake)}`)}
      ${sec(3, ico('bell') + ' Notifikasi', chk('p-ntoast', 'Pop-up notifikasi baru', 'Tampilkan pemberitahuan singkat saat ada notifikasi baru masuk.', P.notifToast))}
      ${sec(4, ico('settings') + ' Akun & informasi', `
        ${me ? accountMenu() : ''}
        <div class="rowbtns">
          <button class="btn ghost" data-info="about">${ico('info')}Tentang &amp; update log</button>
          <button class="btn ghost" data-accounts>${me ? 'Ganti akun / keluar' : 'Masuk / Daftar'}</button>
        </div>`)}
      ${sec(5, ico('trash') + ' Data di perangkat ini', `
        <p class="hint">Penanda e-book dan setelan disimpan di perangkat ini.</p>
        <div class="rowbtns">
          <button class="btn ghost" data-clearmarks>${ico('bookmark')}Hapus penanda e-book</button>
          <button class="btn ghost" data-resetprefs>${ico('restart')}Atur ulang setelan</button>
        </div>`)}
    </div>`
}

function pickTheme(name, button) {
  if (name === document.documentElement.dataset.theme) return

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduce || P.potato) return setTheme(name)

  const box = button.getBoundingClientRect()
  document.documentElement.style.setProperty('--tx', box.left + box.width / 2 + 'px')
  document.documentElement.style.setProperty('--ty', box.top + box.height / 2 + 'px')
  document.startViewTransition(() => setTheme(name))
}

async function clearMarks() {
  const yes = await ask({
    title: 'Hapus semua penanda e-book?',
    text: 'Penanda otomatis dan manual di perangkat ini akan dihapus.',
    yes: 'Ya, hapus',
    no: 'Batal',
    danger: true,
    icon: 'bookmark'
  })
  if (!yes) return

  try {
    localStorage.removeItem(markKey())
  } catch (e) { }
  toast('Penanda e-book dihapus')
}

async function resetPrefs() {
  const yes = await ask({
    title: 'Atur ulang setelan?',
    text: 'Potato Mode, mode baca, dan pilihan lain kembali ke bawaan. Tema tidak berubah.',
    yes: 'Ya, atur ulang',
    no: 'Batal',
    icon: 'restart'
  })
  if (!yes) return

  P = { ...PREF_DEFAULT }
  try {
    localStorage.removeItem(DIR_KEY)
  } catch (e) { }
  savePrefs()
  applyPrefs()
  render()
  toast('Setelan dikembalikan ke bawaan')
}


/* ---------- 9f. KATALOG PER JENIS (Buku Fisik / E-Book) ---------- */
function sortOptions() {
  const hide = S.kind === 'ebook' ? ['stok_rendah', 'stok_tinggi', 'limited'] : []

  return BSORTS
    .filter(([key]) => !hide.includes(key))
    .map(([key, label]) => `<option value="${key}" ${S.bsort === key ? 'selected' : ''}>${label}</option>`)
    .join('')
}

function kindsBar() {
  const count = k => S.books.filter(b => kindOf(b) === k).length
  const tab = (k, label) => `<button type="button" role="tab" class="${S.kind === k ? 'on' : ''}" data-kind="${k}">${label} <i>${count(k)}</i></button>`

  return `
    <div class="kinds" data-on="${S.kind}" role="tablist" aria-label="Jenis buku">
      <i class="kslide"></i>
      ${tab('fisik', ico('book') + 'Buku Fisik')}
      ${tab('ebook', ico('tablet') + 'E-Book')}
    </div>`
}

function setKind(kind) {
  if (kind === S.kind) return

  S.kind = kind
  S.page = 1

  if (kind === 'ebook' && ['stok_rendah', 'stok_tinggi', 'limited'].includes(S.bsort)) S.bsort = 'terbaru'

  try {
    localStorage.setItem('katalog-jenis', kind)
  } catch (e) { }

  const bar = $('.kinds')
  if (bar) {
    bar.dataset.on = kind
    bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.kind === kind))
  }

  const select = $('#bsort')
  if (select) select.innerHTML = sortOptions()

  drawGrid(true)
}

function pdfDownloadUrl(b) {
  const url = b.pdf_url
  const name = (b.title || 'ebook').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.pdf'

  // Supabase Storage: parameter ?download= memaksa browser mengunduh (bukan membuka) berkasnya
  if (url.startsWith(new URL(SUPABASE_URL).origin)) return url + (url.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(name)
  return url
}

function downloadPdf(b) {
  if (!b || !b.pdf_url) return toast('Berkas PDF belum tersedia', true)

  const a = document.createElement('a')
  a.href = pdfDownloadUrl(b)
  a.target = '_blank'
  a.rel = 'noopener'
  a.download = ''
  document.body.append(a)
  a.click()
  a.remove()
  toast('Mengunduh PDF...')
}


/* ---------- 9g. PEMBACA E-BOOK (gaya manga) ---------- */
// Horizontal: satu halaman per layar (geser / ketuk tepi), bisa kanan-ke-kiri.
// Vertikal: strip gulir tanpa jeda antarhalaman. Keduanya berganti otomatis mengikuti rotasi layar.
// PDF digambar dengan pdf.js (dimuat hanya saat e-book dibuka); e-book tanpa PDF memakai gambar slide.
const R = { open: false, ui: true, closeTk: 0 }
const ZOOMS = [1, 1.25, 1.5, 2, 3]

// -- penanda halaman (disimpan per akun di perangkat ini) --
const markKey = () => 'mark-' + (S.me?.id || 'guest')

function loadMarks() {
  try {
    return JSON.parse(localStorage.getItem(markKey())) || {}
  } catch (e) {
    return {}
  }
}

const getMark = id => loadMarks()[id] || null

function putMark(id, mark) {
  const all = loadMarks()

  if (mark) all[id] = mark
  else delete all[id]

  try {
    localStorage.setItem(markKey(), JSON.stringify(all))
  } catch (e) { }
}

// penanda otomatis = halaman terakhir dibuka. Jika ada penanda manual, penanda otomatis dibatalkan.
function autoMark() {
  if (!R.book || !R.total) return

  const mark = getMark(R.book.id)
  if (mark && mark.manual) return
  if (!mark && R.page === 1) return

  putMark(R.book.id, { page: R.page, manual: false, t: Date.now() })
}

function toggleMark() {
  if (!R.total) return

  const id = R.book.id
  const mark = getMark(id)
  const here = mark && mark.manual && mark.page === R.page

  if (here) {
    putMark(id, { page: R.page, manual: false, t: Date.now() })
    toast('Penanda dihapus')
  } else {
    putMark(id, { page: R.page, manual: true, t: Date.now() })
    toast(mark && mark.manual ? `Penanda dipindah ke halaman ${R.page}` : `Penanda disimpan di halaman ${R.page}`)
  }

  const btn = $('#rd-mark')
  if (btn) {
    btn.classList.remove('pop')
    void btn.offsetWidth
    btn.classList.add('pop')
  }
  drawMarkBtn()
}

// Hanya penanda MANUAL yang terlihat saat membaca. Penanda otomatis tidak ditampilkan
// (baru terlihat lagi ketika e-book dibuka kembali, sampai pembaca pindah halaman).
function drawMarkBtn() {
  const btn = $('#rd-mark')
  if (!btn || !R.book) return

  const mark = getMark(R.book.id)
  const here = !!(mark && mark.manual && mark.page === R.page)

  btn.classList.toggle('on', here)
  btn.classList.toggle('other', !!(mark && mark.manual && !here))
  btn.title = here ? 'Hapus penanda' : mark && mark.manual ? `Pindahkan penanda (sekarang hlm ${mark.page})` : 'Tandai halaman ini'

  const tick = $('#rd-tick')
  if (tick) {
    const visible = !!mark && R.total > 1 && (mark.manual || R.showAuto)

    tick.hidden = !visible
    if (visible) tick.style.setProperty('--r', (mark.page - 1) / Math.max(1, R.total - 1))
    tick.classList.toggle('auto', !!(mark && !mark.manual))
  }
}

// -- arah baca per buku (kiri-ke-kanan / kanan-ke-kiri ala manga) --
const DIR_KEY = 'baca-arah'

function loadDirs() {
  try {
    return JSON.parse(localStorage.getItem(DIR_KEY)) || {}
  } catch (e) {
    return {}
  }
}

const bookDir = b => loadDirs()[b.id] || (b.read_dir === 'rtl' ? 'rtl' : 'ltr')

function saveDir(id, dir) {
  const all = loadDirs()
  all[id] = dir

  try {
    localStorage.setItem(DIR_KEY, JSON.stringify(all))
  } catch (e) { }
}

// -- pdf.js (versi legacy supaya jalan di browser lama) --
const PDFJS_VER = '3.11.174'
let pdfPromise = null

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (pdfPromise) return pdfPromise

  pdfPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const base = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/legacy/build/`

    script.src = base + 'pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'
      resolve(window.pdfjsLib)
    }
    script.onerror = () => {
      pdfPromise = null
      reject(new Error('pdf.js gagal dimuat'))
    }
    document.head.append(script)
  })

  return pdfPromise
}

const imgRatio = url => new Promise(resolve => {
  const img = new Image()
  img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 0.75)
  img.onerror = () => resolve(0.75)
  img.src = url
})

function rdMode() {
  if (P.readMode === 'h' || P.readMode === 'v') return P.readMode
  return matchMedia('(orientation: landscape)').matches ? 'h' : 'v'
}

const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement)

function readerShell(b) {
  const canDl = b.pdf_url && b.can_download !== false
  const canFs = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled)

  return `
    <div class="rd-stage" id="rd-stage">
      <div class="rd-load"><div class="spinner"></div><p id="rd-ltxt">Menyiapkan e-book...</p></div>
    </div>
    <div class="rd-top">
      <button class="rd-btn" data-rd="close" aria-label="Tutup" title="Tutup">${ico('left')}</button>
      <div class="rd-title"><b>${esc(b.title)}</b><small>${esc(b.author || 'E-book')}</small></div>
      <button class="rd-btn" id="rd-mark" data-rd="mark" aria-label="Penanda halaman">${ico('bookmark')}</button>
      ${canDl ? `<button class="rd-btn" data-rd="dl" aria-label="Unduh PDF" title="Unduh PDF">${ico('download')}</button>` : ''}
      ${canFs ? '<button class="rd-btn" id="rd-fs" data-rd="fs" aria-label="Layar penuh"></button>' : ''}
    </div>
    <div class="rd-bot">
      <div class="rd-line">
        <span class="rd-count" id="rd-count">-</span>
        <div class="rd-rw">
          <input type="range" class="rd-range" id="rd-range" min="1" max="1" value="1" aria-label="Halaman">
          <i class="rd-tick" id="rd-tick" hidden></i>
        </div>
      </div>
      <div class="rd-ctl">
        <button class="rd-btn" data-rd="left" aria-label="Kiri" title="Kiri">${ico('left')}</button>
        <button class="rd-btn" id="rd-mode" data-rd="mode"></button>
        <button class="rd-btn h-only" id="rd-dir" data-rd="dir"></button>
        <button class="rd-btn h-only" id="rd-fit" data-rd="fit"></button>
        <button class="rd-btn" data-rd="zout" aria-label="Perkecil" title="Perkecil">${ico('minus')}</button>
        <span class="rd-z" id="rd-zoom">100%</span>
        <button class="rd-btn" data-rd="zin" aria-label="Perbesar" title="Perbesar">${ico('plus')}</button>
        <button class="rd-btn" data-rd="right" aria-label="Kanan" title="Kanan">${ico('right')}</button>
      </div>
    </div>
    <div class="rd-prog"><i id="rd-progbar"></i></div>
    <div class="rd-pill" id="rd-pill"></div>
    <div class="rd-banner" id="rd-banner"></div>`
}

async function openReader(id, opts = {}) {
  let b = S.books.find(x => String(x.id) === String(id))

  if (!b) {
    const r = await db.from('books').select('*').eq('id', id).single()
    b = r.data
  }
  if (!b) return toast('Buku tidak ditemukan', true)

  const imgs = (b.slides || []).filter(Boolean)
  if (!b.pdf_url && !imgs.length) return toast('E-book ini belum punya berkas untuk dibaca', true)

  closeReader(true)

  const token = Date.now()
  Object.assign(R, {
    open: true, book: b, kind: b.pdf_url ? 'pdf' : 'img', imgs, doc: null,
    page: 1, total: 0, zoom: 1, ratio: 0.75, ui: true, busyAnim: false,
    dir: bookDir(b), showAuto: false, openPage: 1,
    token, curMode: null, pgs: [], track: null, obs: null
  })
  R.closeTk++

  const el = $('#reader')
  el.innerHTML = readerShell(b)
  el.classList.remove('ui-hide', 'rd-rtl')
  el.hidden = false
  void el.offsetWidth
  el.classList.add('open')
  document.body.classList.add('reading')
  drawReaderBtns()

  // tombol "kembali" di HP menutup pembaca (bukan keluar dari website)
  try {
    history.pushState({ reader: 1 }, '')
  } catch (e) { }

  rdBind()
  rdSchedule()
  wakeOn()

  const say = text => {
    const t = $('#rd-ltxt')
    if (t && R.token === token) t.textContent = text
  }

  try {
    if (R.kind === 'pdf') {
      say('Memuat pembaca PDF...')
      const lib = await loadPdfJs()
      if (R.token !== token) return

      say('Memuat e-book...')
      const task = lib.getDocument({ url: b.pdf_url })
      task.onProgress = p => { if (p.total) say(`Memuat e-book ${Math.round(p.loaded / p.total * 100)}%`) }

      const doc = await task.promise
      if (R.token !== token) {
        doc.destroy()
        return
      }

      R.doc = doc
      R.total = doc.numPages

      const first = await doc.getPage(1)
      const view = first.getViewport({ scale: 1 })
      R.ratio = view.width / view.height
    } else {
      R.total = imgs.length
      R.ratio = await imgRatio(imgs[0])
    }
  } catch (err) {
    if (R.token === token) rdError(err)
    return
  }
  if (R.token !== token) return

  const mark = getMark(b.id)
  let start = 1
  if (mark && P.resume && !opts.fresh) start = Math.min(R.total, Math.max(1, mark.page))
  R.page = start
  R.openPage = start

  // penanda otomatis hanya terlihat sejak e-book dibuka sampai pembaca pindah halaman
  R.showAuto = !!(mark && !mark.manual)

  const range = $('#rd-range')
  range.max = R.total
  range.value = start

  rdLayout()
  setPage(start)

  if (mark) {
    const kind = mark.manual ? 'penanda manual' : 'penanda otomatis'
    if (start === mark.page) rdBanner(`Dilanjutkan dari hlm ${mark.page} (${kind})`, 'Dari awal', 'fresh')
    else rdBanner(`Ada ${kind} di hlm ${mark.page}`, 'Lanjutkan', 'resume')
  }
}

function rdError(err) {
  const stage = $('#rd-stage')
  if (!stage) return

  console.warn('Pembaca e-book:', err)

  stage.innerHTML = `
    <div class="rd-err">
      <div class="cicon" aria-hidden="true">${ico('warn')}</div>
      <b>E-book tidak bisa dimuat</b>
      <p>${R.kind === 'pdf'
      ? 'Periksa koneksi internet atau tautan PDF-nya. Server PDF harus mengizinkan akses dari website ini.'
      : 'Gambar halaman tidak dapat dimuat.'}</p>
      <div class="rowbtns">
        <button class="btn" data-rd="retry">Coba lagi</button>
        ${R.book.pdf_url ? '<button class="btn ghost" data-rd="newtab">Buka di tab baru</button>' : ''}
      </div>
    </div>`
  rdShowUi()
}

function closeReader(instant, fromPop) {
  if (!R.open) return

  clearTimeout(R.mt)
  autoMark()

  R.open = false
  R.token = 0
  if (R.obs) R.obs.disconnect()
  R.obs = null

  try {
    if (R.doc) R.doc.destroy()
  } catch (e) { }
  R.doc = null

  try {
    if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document)
  } catch (e) { }

  wakeOff()
  document.body.classList.remove('reading')

  const el = $('#reader')
  const tk = ++R.closeTk
  const finish = () => {
    if (R.closeTk !== tk) return
    el.hidden = true
    el.innerHTML = ''
  }

  el.classList.remove('open')
  if (instant || P.potato) finish()
  else setTimeout(finish, 330)

  if (!fromPop && history.state && history.state.reader) history.back()
  if (S.view === 'katalog' && $('#grid')) drawGrid()
}

// -- layar tetap menyala --
async function wakeOn() {
  if (!P.wake || !navigator.wakeLock) return

  try {
    R.wl = await navigator.wakeLock.request('screen')
  } catch (e) { }
}

function wakeOff() {
  try {
    if (R.wl) R.wl.release()
  } catch (e) { }
  R.wl = null
}

// -- bar atas/bawah: tampil sebentar, lalu otomatis sembunyi --
function rdShowUi() {
  R.ui = true
  const el = $('#reader')
  if (el) el.classList.remove('ui-hide')
  rdSchedule()
}

function rdHideUi() {
  R.ui = false
  clearTimeout(R.ut)

  const el = $('#reader')
  if (el) el.classList.add('ui-hide')
}

function rdSchedule() {
  clearTimeout(R.ut)
  R.ut = setTimeout(() => { if (R.open) rdHideUi() }, 4200)
}

function rdBanner(text, label, action) {
  const box = $('#rd-banner')
  if (!box) return

  box.innerHTML = `<span>${esc(text)}</span><button type="button" data-rd="${action}">${esc(label)}</button>`
  box.classList.add('show')

  clearTimeout(R.bt)
  R.bt = setTimeout(hideBanner, 6500)
}

function hideBanner() {
  const box = $('#rd-banner')
  if (box) box.classList.remove('show')
}

// -- ikon & keadaan tombol (mode, arah, ukuran, layar penuh) --
function drawReaderBtns() {
  const el = $('#reader')
  if (!el) return

  const horizontal = R.curMode === 'h'
  el.dataset.mode = R.curMode || ''
  el.classList.toggle('rd-rtl', horizontal && R.dir === 'rtl')

  const set = (selector, icon, title) => {
    const btn = $(selector)
    if (!btn) return

    btn.innerHTML = ico(icon)
    btn.title = title
    btn.setAttribute('aria-label', title)
  }

  set('#rd-mode',
    P.readMode === 'auto' ? 'auto' : P.readMode === 'h' ? 'horiz' : 'vert',
    P.readMode === 'auto' ? `Mode baca: otomatis (${horizontal ? 'horizontal' : 'vertikal'})` : P.readMode === 'h' ? 'Mode baca: horizontal' : 'Mode baca: vertikal')

  set('#rd-dir',
    R.dir === 'rtl' ? 'dirrtl' : 'dirltr',
    R.dir === 'rtl' ? 'Arah baca: kanan ke kiri' : 'Arah baca: kiri ke kanan')

  set('#rd-fit',
    P.fit === 'width' ? 'fitwidth' : 'fitscreen',
    P.fit === 'width' ? 'Ukuran halaman: isi lebar layar' : 'Ukuran halaman: muat seluruh halaman')

  set('#rd-fs', isFs() ? 'minimize' : 'maximize', isFs() ? 'Keluar dari layar penuh' : 'Layar penuh')
}

// -- halaman aktif --
function flashPill() {
  const pill = $('#rd-pill')
  if (!pill) return

  pill.textContent = `${R.page} / ${R.total}`
  if (R.ui) return

  pill.classList.add('show')
  clearTimeout(R.pillT)
  R.pillT = setTimeout(() => pill.classList.remove('show'), 1400)
}

function setPage(n) {
  R.page = n

  // pindah halaman: penanda otomatis tidak lagi ditampilkan
  if (R.showAuto && n !== R.openPage) R.showAuto = false

  const count = $('#rd-count')
  if (count) count.textContent = `${n} / ${R.total}`

  const range = $('#rd-range')
  if (range) {
    if (+range.value !== n) range.value = n
    range.style.setProperty('--p', ((n - 1) / Math.max(1, R.total - 1)) * 100 + '%')
  }

  const bar = $('#rd-progbar')
  if (bar) bar.style.width = (n / Math.max(1, R.total)) * 100 + '%'

  flashPill()
  drawMarkBtn()

  clearTimeout(R.mt)
  R.mt = setTimeout(autoMark, 350)
}

function previewRange(input) {
  const n = +input.value

  $('#rd-count').textContent = `${n} / ${R.total}`
  input.style.setProperty('--p', ((n - 1) / Math.max(1, R.total - 1)) * 100 + '%')
  rdSchedule()
}

function rdGoto(n) {
  n = Math.max(1, Math.min(R.total, Math.round(n)))
  if (!R.total) return

  if (R.curMode === 'h') {
    hGo(n)
  } else {
    scrollToPage(n, true)
    setPage(n)
  }
}

function rdStep(d) {
  if (!R.total) return
  if (R.curMode === 'h') hGo(R.page + d)
  else scrollToPage(Math.max(1, Math.min(R.total, R.page + d)), true)
}

// tombol/ketukan di sisi kiri atau kanan layar (kanan-ke-kiri: kiri = halaman berikutnya)
function rdSide(side) {
  const rtl = R.curMode === 'h' && R.dir === 'rtl'
  rdStep(side === 'left' ? (rtl ? 1 : -1) : (rtl ? -1 : 1))
}

// -- menggambar satu halaman ke dalam sebuah kotak (slide atau pembungkus halaman) --
async function renderPage(p, box) {
  if (!R.open) return

  const token = R.token
  const n = (box._n = (box._n || 0) + 1)

  try {
    if (box._task) box._task.cancel()
  } catch (e) { }

  const put = node => {
    box.textContent = ''
    box.appendChild(node)
    requestAnimationFrame(() => node.classList.add('in'))
  }

  // e-book gambar
  if (R.kind === 'img') {
    const img = new Image()
    img.alt = 'Halaman ' + p
    img.decoding = 'async'
    img.draggable = false
    img.onload = () => { if (box._n === n && R.token === token) put(img) }
    img.onerror = () => { if (box._n === n) box.innerHTML = '<span class="rd-miss">Gambar tidak dapat dimuat</span>' }
    img.src = R.imgs[p - 1]
    return
  }

  // e-book PDF
  try {
    const page = await R.doc.getPage(p)
    if (R.token !== token || box._n !== n) return

    const base = page.getViewport({ scale: 1 })
    let cssW

    if (R.curMode === 'h') {
      const cs = getComputedStyle(box)
      const aw = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const ah = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)

      // "isi lebar": halaman memenuhi lebar layar (gulir ke bawah untuk sisanya); "muat": seluruh halaman terlihat
      const fit = P.fit === 'width' ? aw / base.width : Math.min(aw / base.width, ah / base.height)
      cssW = fit * base.width * R.zoom
    } else {
      cssW = box.clientWidth
    }

    const dpr = Math.min(window.devicePixelRatio || 1, P.potato ? 1 : 2)
    const vp = page.getViewport({ scale: (cssW / base.width) * dpr })
    const canvas = document.createElement('canvas')

    canvas.width = Math.floor(vp.width)
    canvas.height = Math.floor(vp.height)
    canvas.style.width = Math.floor(cssW) + 'px'
    canvas.style.height = Math.floor((cssW * base.height) / base.width) + 'px'

    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
    box._task = task
    await task.promise

    if (R.token !== token || box._n !== n) return

    // mode vertikal: sesuaikan tinggi kotak jika rasio halaman ini berbeda dari halaman pertama
    if (R.curMode === 'v') box.style.height = Math.floor((cssW * base.height) / base.width) + 'px'

    put(canvas)
    page.cleanup()
  } catch (e) {
    if (e && e.name === 'RenderingCancelledException') return
    if (box._n === n) box.innerHTML = '<span class="rd-miss">Halaman gagal dimuat</span>'
  }
}

function clearPage(box) {
  box._n = (box._n || 0) + 1

  try {
    if (box._task) box._task.cancel()
  } catch (e) { }

  box.querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0 })
  box.textContent = ''
}

// -- susunan tampilan (dibangun ulang saat mode / ukuran / zoom berubah; halaman aktif dipertahankan) --
function rdLayout() {
  const stage = $('#rd-stage')
  if (!stage || !R.total) return

  if (R.obs) R.obs.disconnect()
  R.obs = null
  R.pgs = []
  R.track = null

  R.curMode = rdMode()
  stage.dataset.mode = R.curMode
  stage.textContent = ''

  if (R.curMode === 'h') hBuild(stage)
  else vBuild(stage)

  R.sz = stage.clientWidth + 'x' + stage.clientHeight
  drawReaderBtns()

  const zoomText = $('#rd-zoom')
  if (zoomText) zoomText.textContent = Math.round(R.zoom * 100) + '%'
}

// ---- mode VERTIKAL: strip halaman tanpa jeda, digambar saat mendekati layar ----
function vBuild(stage) {
  const scroller = document.createElement('div')
  scroller.className = 'rd-scroll'
  scroller.id = 'rd-scroll'

  const pw = Math.min(stage.clientWidth, 1100) * R.zoom
  scroller.style.setProperty('--pw', pw + 'px')
  scroller.style.setProperty('--ph', pw / R.ratio + 'px')

  const frag = document.createDocumentFragment()
  for (let p = 1; p <= R.total; p++) {
    const box = document.createElement('div')
    box.className = 'rd-pg'
    box.dataset.p = p
    R.pgs.push(box)
    frag.appendChild(box)
  }

  scroller.appendChild(frag)
  stage.appendChild(scroller)

  R.lastTop = null
  scroller.scrollTop = Math.max(0, R.pgs[R.page - 1].offsetTop)

  R.obs = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) renderPage(+en.target.dataset.p, en.target)
    else clearPage(en.target)
  }), { root: scroller, rootMargin: '150% 0px' })

  R.pgs.forEach(box => R.obs.observe(box))
  scroller.addEventListener('scroll', onVScroll, { passive: true })
}

function vCurrent(scroller) {
  const y = scroller.scrollTop + scroller.clientHeight * 0.35
  let lo = 0
  let hi = R.pgs.length - 1

  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (R.pgs[mid].offsetTop <= y) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function onVScroll() {
  if (R.vraf) return

  R.vraf = requestAnimationFrame(() => {
    R.vraf = 0

    const scroller = $('#rd-scroll')
    if (!scroller) return

    // gulir turun = sembunyikan bar, gulir naik = tampilkan
    const top = scroller.scrollTop
    const dy = R.lastTop == null ? 0 : top - R.lastTop
    R.lastTop = top
    if (dy > 14) rdHideUi()
    else if (dy < -14) rdShowUi()

    const p = vCurrent(scroller)
    if (p !== R.page) setPage(p)
  })
}

function scrollToPage(p, smooth) {
  const scroller = $('#rd-scroll')
  const box = R.pgs[p - 1]
  if (!scroller || !box) return

  scroller.scrollTo({ top: Math.max(0, box.offsetTop), behavior: smooth && !P.potato ? 'smooth' : 'auto' })
}

// ---- mode HORIZONTAL: satu halaman per layar. Kanan-ke-kiri membalik susunan slide ----
const dirSign = () => (R.dir === 'rtl' ? -1 : 1)
const trackBase = () => `translateX(${-100 * dirSign()}%)`

function hBuild(stage) {
  stage.innerHTML = `<div class="rd-track" id="rd-track" data-dir="${R.dir}"><div class="rd-sl"></div><div class="rd-sl"></div><div class="rd-sl"></div></div>`
  R.track = stage.firstChild
  R.track.style.transform = trackBase()
  hFill()
}

function hSlide(slide, p) {
  slide._n = (slide._n || 0) + 1

  try {
    if (slide._task) slide._task.cancel()
  } catch (e) { }

  slide.textContent = ''
  slide.scrollTop = 0
  slide.scrollLeft = 0
  slide.dataset.p = p
  slide.style.setProperty('--z', R.zoom)
  slide.classList.toggle('zoomed', R.zoom > 1)
  slide.classList.toggle('fitw', P.fit === 'width' && R.zoom === 1)

  if (p < 1 || p > R.total) return

  if (p === R.page) {
    renderPage(p, slide)
  } else if (!P.potato) {
    // halaman tetangga digambar sedikit terlambat supaya halaman aktif tampil duluan
    setTimeout(() => { if (R.open && slide.dataset.p === String(p)) renderPage(p, slide) }, 260)
  }
}

function hFill() {
  Array.prototype.forEach.call(R.track.children, (slide, k) => hSlide(slide, R.page + k - 1))
}

function hGo(n) {
  n = Math.max(1, Math.min(R.total, n))
  if (n === R.page || R.busyAnim || !R.track) return

  const d = n > R.page ? 1 : -1
  const track = R.track

  // pindah jauh (mis. lewat slider): langsung ganti
  if (Math.abs(n - R.page) !== 1) {
    setPage(n)
    track.style.transition = 'none'
    track.style.transform = trackBase()
    hFill()
    return
  }

  R.busyAnim = true
  setPage(n)

  const finish = () => {
    track.style.transition = 'none'

    if (d === 1) track.appendChild(track.firstElementChild)
    else track.insertBefore(track.lastElementChild, track.firstElementChild)

    track.style.transform = trackBase()

    const moved = d === 1 ? track.lastElementChild : track.firstElementChild
    hSlide(moved, n + d)

    void track.offsetWidth
    R.busyAnim = false
  }

  if (P.potato) return finish()

  track.style.transition = 'transform .38s cubic-bezier(.3,.9,.3,1)'
  track.style.transform = `translateX(${dirSign() * (-100 - d * 100)}%)`

  let done = false
  const once = () => {
    if (done) return
    done = true
    track.removeEventListener('transitionend', once)
    finish()
  }
  track.addEventListener('transitionend', once)
  setTimeout(once, 520)
}

// ---- sentuhan & klik pada layar baca ----
function rdBind() {
  const stage = $('#rd-stage')

  stage.addEventListener('pointerdown', e => {
    if (e.button > 0) return
    R.pt = { x: e.clientX, y: e.clientY, t: Date.now(), dx: 0, drag: false, moved: false, id: e.pointerId }
  })

  stage.addEventListener('pointermove', e => {
    const pt = R.pt
    if (!pt || pt.id !== e.pointerId) return

    pt.dx = e.clientX - pt.x
    const dy = e.clientY - pt.y
    if (Math.abs(pt.dx) > 10 || Math.abs(dy) > 10) pt.moved = true

    if (R.curMode !== 'h' || R.zoom > 1 || R.busyAnim || !R.track) return

    if (!pt.drag && Math.abs(pt.dx) > 10 && Math.abs(pt.dx) > Math.abs(dy)) {
      pt.drag = true
      try {
        stage.setPointerCapture(e.pointerId)
      } catch (err) { }
    }

    if (pt.drag) {
      // arah halaman yang dituju: geser ke kiri = berikutnya (kiri-ke-kanan), kebalikannya untuk manga
      const want = (pt.dx < 0 ? 1 : -1) * dirSign()
      let dx = pt.dx
      if ((want === -1 && R.page === 1) || (want === 1 && R.page === R.total)) dx *= 0.3

      R.track.style.transition = 'none'
      R.track.style.transform = `translateX(calc(${-100 * dirSign()}% + ${dx}px))`
    }
  })

  const end = e => {
    const pt = R.pt
    if (!pt || pt.id !== e.pointerId) return
    R.pt = null

    const dt = Date.now() - pt.t

    if (pt.drag) {
      const w = stage.clientWidth
      const speed = Math.abs(pt.dx) / Math.max(dt, 1)
      const go = Math.abs(pt.dx) > w * 0.18 || (speed > 0.5 && Math.abs(pt.dx) > 30)
      const target = R.page + (pt.dx < 0 ? 1 : -1) * dirSign()

      if (e.type === 'pointerup' && go && target >= 1 && target <= R.total) {
        hGo(target)
      } else {
        R.track.style.transition = 'transform .25s ease'
        R.track.style.transform = trackBase()
      }
      return
    }

    if (e.type === 'pointerup' && !pt.moved && dt < 400 && !e.target.closest('button')) {
      rdTap(e.clientX - stage.getBoundingClientRect().left, stage.clientWidth)
    }
  }

  stage.addEventListener('pointerup', end)
  stage.addEventListener('pointercancel', end)
}

// ketuk tepi kiri/kanan = pindah halaman (mode horizontal); ketuk tengah = tampil/sembunyi bar
function rdTap(x, width) {
  if (R.curMode === 'h' && R.zoom === 1 && R.total) {
    if (x < width * 0.28) return rdSide('left')
    if (x > width * 0.72) return rdSide('right')
  }

  if (R.ui) rdHideUi()
  else rdShowUi()
}

function cycleMode() {
  const order = ['auto', 'h', 'v']
  P.readMode = order[(order.indexOf(P.readMode) + 1) % order.length]
  savePrefs()

  toast(P.readMode === 'auto'
    ? 'Mode baca: Otomatis (ikuti rotasi layar)'
    : P.readMode === 'h' ? 'Mode baca: Horizontal (geser halaman)' : 'Mode baca: Vertikal (gulir ke bawah)')

  if (R.total) rdLayout()
}

function toggleDir() {
  if (!R.total) return

  R.dir = R.dir === 'rtl' ? 'ltr' : 'rtl'
  saveDir(R.book.id, R.dir)
  toast(R.dir === 'rtl' ? 'Arah baca: kanan ke kiri' : 'Arah baca: kiri ke kanan')

  rdLayout()
}

function toggleFit() {
  if (!R.total) return

  P.fit = P.fit === 'width' ? 'screen' : 'width'
  savePrefs()
  toast(P.fit === 'width' ? 'Ukuran halaman: isi lebar layar' : 'Ukuran halaman: muat seluruh halaman')

  rdLayout()
}

function toggleFullscreen() {
  const el = $('#reader')
  if (!el) return

  const fail = () => toast('Layar penuh tidak didukung di perangkat ini', true)

  try {
    const request = isFs()
      ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      : (el.requestFullscreen || el.webkitRequestFullscreen).call(el)

    if (request && request.catch) request.catch(fail)
  } catch (e) {
    fail()
  }
}

function rdZoom(dir) {
  if (!R.total) return

  let i = ZOOMS.findIndex(z => z >= R.zoom - 0.01)
  if (i < 0) i = 0
  i = Math.max(0, Math.min(ZOOMS.length - 1, i + dir))

  if (ZOOMS[i] === R.zoom) return toast(dir > 0 ? 'Zoom maksimum' : 'Ukuran asli')

  R.zoom = ZOOMS[i]
  rdLayout()
}

function rdAction(action) {
  rdSchedule()

  switch (action) {
    case 'close': return closeReader()
    case 'left': return rdSide('left')
    case 'right': return rdSide('right')
    case 'mark': return toggleMark()
    case 'mode': return cycleMode()
    case 'dir': return toggleDir()
    case 'fit': return toggleFit()
    case 'fs': return toggleFullscreen()
    case 'zin': return rdZoom(1)
    case 'zout': return rdZoom(-1)
    case 'dl': return downloadPdf(R.book)
    case 'fresh':
      hideBanner()
      return rdGoto(1)
    case 'resume': {
      const mark = getMark(R.book.id)
      hideBanner()
      if (mark) rdGoto(mark.page)
      return
    }
    case 'retry': return openReader(R.book.id)
    case 'newtab': return window.open(R.book.pdf_url, '_blank', 'noopener')
  }
}

// ubah ukuran / putar layar / masuk-keluar layar penuh: susun ulang bila perlu
function rdRelayoutSoon() {
  clearTimeout(R.rt)

  R.rt = setTimeout(() => {
    if (!R.open || !R.total) return

    const stage = $('#rd-stage')
    if (!stage) return

    drawReaderBtns()

    const [w, h] = (R.sz || '0x0').split('x').map(Number)
    const modeChanged = rdMode() !== R.curMode
    const widthChanged = w !== stage.clientWidth
    const heightBig = R.curMode === 'h' && Math.abs(h - stage.clientHeight) > 80

    if (modeChanged || widthChanged || heightBig) rdLayout()
  }, 220)
}

addEventListener('resize', rdRelayoutSoon)
matchMedia('(orientation: landscape)').addEventListener?.('change', rdRelayoutSoon)
document.addEventListener('fullscreenchange', rdRelayoutSoon)
document.addEventListener('webkitfullscreenchange', rdRelayoutSoon)
addEventListener('popstate', () => { if (R.open) closeReader(false, true) })

addEventListener('pagehide', () => {
  if (!R.open) return
  clearTimeout(R.mt)
  autoMark()
})

document.addEventListener('visibilitychange', () => {
  if (!R.open) return

  if (document.visibilityState === 'hidden') {
    clearTimeout(R.mt)
    autoMark()
  } else {
    wakeOn()
  }
})

document.addEventListener('keydown', e => {
  if (!R.open || askDone) return

  if (e.key === 'Escape') {
    e.preventDefault()
    return closeReader()
  }

  if (R.curMode === 'h' && R.total) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      rdSide('right')
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      rdSide('left')
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      hGo(R.page + 1)
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      hGo(R.page - 1)
    }
  }
})


/* ---------- 9h. EFEK: riak tombol, bayangan header, tahan notifikasi ---------- */
// riak (ripple) saat tombol disentuh. Dimatikan oleh Potato Mode.
document.addEventListener('pointerdown', e => {
  if (P.potato || e.button > 0) return

  const target = e.target.closest('.btn, nav button, .dbtn, .pager button, .kinds button, .tabs button, .rd-btn, .drawer-x, .pitem, .back')
  if (!target || target.disabled) return

  const box = target.getBoundingClientRect()
  const size = Math.max(box.width, box.height) * 2
  const ripple = document.createElement('span')

  ripple.className = 'rip'
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - box.left - size / 2}px;top:${e.clientY - box.top - size / 2}px`
  target.appendChild(ripple)
  setTimeout(() => ripple.remove(), 650)
}, { passive: true })

// header diberi bayangan saat halaman digulir
addEventListener('scroll', () => {
  const top = $('.top')
  if (top) top.classList.toggle('scrolled', scrollY > 8)
}, { passive: true })

// tekan & tahan notifikasi (atau klik kanan) = tanya "hapus notifikasi ini?"
let lp = null
let lpFired = false

function lpCancel() {
  if (!lp) return

  clearTimeout(lp.timer)
  lp.item.classList.remove('holding')
  lp = null
}

document.addEventListener('pointerdown', e => {
  const item = e.target.closest('[data-nid]')
  if (!item || e.target.closest('[data-nopen]') || e.button > 0) return

  lpFired = false
  lpCancel()
  item.classList.add('holding')

  lp = {
    item,
    x: e.clientX,
    y: e.clientY,
    timer: setTimeout(() => {
      lpFired = true
      item.classList.remove('holding')

      try {
        if (navigator.vibrate) navigator.vibrate(25)
      } catch (err) { }

      askDeleteNotif(+item.dataset.nid)
    }, 550)
  }
})

document.addEventListener('pointermove', e => {
  if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 12) lpCancel()
})
document.addEventListener('pointerup', lpCancel)
document.addEventListener('pointercancel', lpCancel)

document.addEventListener('contextmenu', e => {
  const item = e.target.closest('[data-nid]')
  if (!item) return

  e.preventDefault()

  if (!lpFired) {
    lpFired = true
    lpCancel()
    askDeleteNotif(+item.dataset.nid)
  }
})

// Enter pada notifikasi yang sedang difokus = tandai dibaca
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-nid]')) markNotif(+e.target.dataset.nid)
})


/* ---------- 10. EVENT ---------- */
document.addEventListener('click', async e => {
  const find = key => e.target.closest(`[data-${key}]`)
  let el

      // MAINTENANCE: cek status, buka form admin, buka kembali website (khusus admin)
  if (find('mcheck')) return maintCheck(true)
  if (find('madminlogin')) return maintLoginToggle()
  if (find('mopen')) return maintToggle(false)

  // tutup modal
  if (e.target.id === 'modal' || find('close')) return closeModal()

  // menu slide (HP): tombol hamburger, tombol tutup, dan area gelap
  if (el = find('menu')) return setMenu(el.dataset.menu === 'open')

  // pembaca e-book, katalog per jenis
  if (el = find('rd')) return rdAction(el.dataset.rd)

  if (el = find('read')) {
    closeModal()
    return openReader(el.dataset.read, { fresh: !!el.dataset.fresh })
  }

  if (el = find('dl')) return downloadPdf(S.books.find(x => String(x.id) === el.dataset.dl))
  if (el = find('kind')) return setKind(el.dataset.kind)

  // form buku: pilih jenis (fisik / e-book)
  if (el = find('kindsel')) {
    const form = el.closest('form')
    form.elements.kind.value = el.dataset.kindsel
    form.dataset.bkind = el.dataset.kindsel
    form.querySelectorAll('[data-kindsel]').forEach(b => b.classList.toggle('on', b === el))
    drawPreview()
    return
  }

  // notifikasi
  if (el = find('nopen')) {
    markNotif(+el.closest('[data-nid]').dataset.nid)
    return goLink(el.dataset.nopen)
  }

  if (el = find('nid')) {
    if (lpFired) {
      lpFired = false
      return
    }
    return markNotif(+el.dataset.nid)
  }

  if (find('nreadall')) return markAllNotifs()

  if (el = find('nf')) {
    S.nf = el.dataset.nf
    return drawNotifs()
  }

  // halaman Setelan
  if (el = find('pref')) {
    P[el.dataset.pref] = el.dataset.val
    savePrefs()
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el))
    return
  }

  if (el = find('settheme')) return pickTheme(el.dataset.settheme, el)
  if (find('clearmarks')) return clearMarks()
  if (find('resetprefs')) return resetPrefs()

  // admin: salin kode, jendela ubah status
  if (el = find('copy')) return copyCode(el.dataset.copy)

  if (el = find('chgto')) {
    chg.to = el.dataset.chgto
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el))

    const next = $('[data-chgnext]')
    next.disabled = false
    next.textContent = 'Ubah ke ' + STATUS_SHORT[chg.to]
    return
  }
  if (find('chgnext')) return applyStatusChange()

  // klik biasa pada baris: hanya baris "Selesai" yang membuka jendela ubah status
  if ((el = find('lrow')) && !e.target.closest('button')) {
    if (el.dataset.done === '1') openStatusChanger(+el.dataset.lrow)
    return
  }

  // admin: kartu statistik = filter cepat, dan tombol "tampilkan lebih banyak"
  if (el = find('sf')) {
    S.sf = S.sf === el.dataset.sf ? '' : el.dataset.sf
    return drawRows()
  }
  if (find('more')) {
    admLimit += 30
    return drawRows()
  }

  // pindah halaman
  if (el = find('v')) {
    setMenu(false)
    S.view = el.dataset.v
    S.pOpen = false
    render(true)
    if (S.view === 'pesan') loadPesan(true)
    return
  }

  // buka detail buku
  if (el = find('card')) return openBook(el.dataset.card)

  // ganti halaman katalog
  if (el = find('page')) {
    const n = +el.dataset.page
    if (n >= 1) {
      S.page = n
      drawGrid(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    return
  }

  // menu Informasi (!) dan tab-tabnya
  if (el = find('info')) {
    setMenu(false)
    return openInfo(el.dataset.info || 'about')
  }
  if (el = find('itab')) return openInfo(el.dataset.itab)

  // login / daftar / keluar
  if (el = find('auth')) {
    e.preventDefault()
    return authForm(+el.dataset.auth)
  }
  if (find('out')) return forgetAccount(S.me?.id)

  // chat, tema, akun
  if (find('chat')) return setChat(!S.chatOpen)
  if (el = find('themebtn')) return cycleTheme(el)
  if (find('accounts')) {
    setMenu(false)
    return openAccounts()
  }
  if (el = find('forget')) return forgetAccount(el.dataset.forget)
  if (el = find('switch')) return switchAccount(el.dataset.switch)

  // admin: kelola buku
  if (find('add')) return bookForm()

  if (el = find('edit')) {
    const { data } = await db.from('books').select('*').eq('id', el.dataset.edit).single()
    return bookForm(data)
  }

  if (el = find('del')) {
    const yes = await ask({
      title: 'Hapus buku ini?',
      text: 'Buku beserta riwayat peminjamannya akan dihapus dan tidak bisa dikembalikan.',
      yes: 'Ya, hapus',
      no: 'Batal',
      danger: true,
      icon: 'trash'
    })
    if (!yes) return

    if (await run(db.from('books').delete().eq('id', el.dataset.del), 'Buku dihapus')) {
      closeModal()
      loadData()
    }
    return
  }

  // user: booking & batalkan
  if (el = find('book')) {
    const days = readDays()
    if (!days) return toast('Isi durasi custom antara 1 sampai 28 hari', true)

    const ok = await run(
      db.from('loans').insert({ book_id: +el.dataset.book, days }),
      'Booking terkirim, tunggu persetujuan admin'
    )
    if (ok) {
      closeModal()
      S.view = 'saya'
      loadData()
    }
    return
  }

  if (el = find('cancel')) return cancelStep1(el.dataset.cancel)

  if (find('cancelyes')) {
    const ok = await run(
      db.from('loans').update({ status: 'dibatalkan', cancel_reason: S.cancel.reason }).eq('id', S.cancel.id),
      'Booking dibatalkan'
    )
    if (ok) {
      closeModal()
      loadData()
    }
    return
  }

  // user: ajukan pengembalian buku (boleh kapan saja selama status "dipinjam")
  if (el = find('reqret')) {
    const yes = await ask({
      title: 'Ajukan pengembalian?',
      text: 'Kamu tetap perlu menyerahkan bukunya ke perpustakaan.',
      yes: 'Ya, ajukan',
      no: 'Batal',
      icon: 'book'
    })
    if (!yes) return

    if (await run(db.rpc('request_return', { lid: +el.dataset.reqret }), 'Pengembalian diajukan, antar bukunya ke perpustakaan')) loadData()
    return
  }

  // akun: tab, lupa kata sandi, menu, kirim ulang kode
  if (el = find('atab')) {
    S.authTab = el.dataset.atab
    return authForm(S.authReg)
  }
  if (find('forgot')) {
    e.preventDefault()
    return passStep1()
  }
  if (el = find('acc')) {
    const kind = el.dataset.acc
    return kind === 'email' ? emailStep1() : kind === 'username' ? userStep1() : passStep1()
  }
  if (find('resend')) {
    e.preventDefault()
    return S.flow?.resend()
  }

  // zoom gambar slide
  if (el = find('zoom')) {
    const action = el.dataset.zoom
    const next = action === 'in' ? zoom.z + 0.5 : action === 'out' ? zoom.z - 0.5 : 1
    return setZoom(el.closest('.stage'), next)
  }

  // halaman Pesan
  if (el = find('pchat')) {
    S.chatSel = +el.dataset.pchat
    S.draft = ''
    S.pOpen = true         // mode HP: buka chat layar penuh
    pAnim.slide = true     // mode HP: animasi geser masuk
    return drawPesan()
  }

  if (find('pback')) return closePesan()
  if (find('pdown')) return pesanToBottom()

  if (el = find('pend')) return endPesan(+el.dataset.pend)
  if (find('pdel')) return hidePesan()

  // slider gambar buku
  if (el = find('slide')) {
    const stage = el.closest('.stage')
    const total = +stage.dataset.n
    const index = (+stage.dataset.i + +el.dataset.slide + total) % total

    stage.dataset.i = index
    stage.querySelector('.track').style.transform = `translateX(-${index * 100}%)`
    stage.querySelector('.count').textContent = `${index + 1} / ${total}`
    setZoom(stage, 1)
    return
  }

  // chat: akhiri / mulai baru
  if (find('endchat')) return endChat()
  if (find('newchat')) {
    S.reopen = true
    return drawChat()
  }

  // admin: ubah status peminjaman
  if (el = find('act')) {
    const id = +el.dataset.lid
    const status = el.dataset.act
    const patch = { status }

    if (status === 'dipinjam') {
      const loan = S.all.find(l => l.id === id)
      patch.borrowed_at = new Date().toISOString()
      patch.due_at = new Date(Date.now() + loan.days * 86400000).toISOString()
    }

    // status "dikembalikan": waktu kembali dicatat otomatis oleh database (returned_at)
    if (await run(db.from('loans').update(patch).eq('id', id), 'Status diperbarui')) loadData()
    return
  }
})

document.addEventListener('input', e => {
  if (e.target.id === 'q') {
    S.q = e.target.value
    S.page = 1
    drawGrid()
  } else if (e.target.id === 'cat') {
    S.cat = e.target.value
    S.page = 1
    drawGrid(true)
  } else if (e.target.id === 'bsort') {
    S.bsort = e.target.value
    S.page = 1
    drawGrid(true)
  } else if (e.target.id === 'pbody') {
    S.draft = e.target.value
  } else if (e.target.id === 'f') {
    S.f = e.target.value
    drawRows()
  } else if (e.target.id === 'sortby') {
    S.sort = e.target.value
    drawRows()
  } else if (e.target.id === 'sfilter') {
    S.sf = e.target.value
    drawRows()
  } else if (e.target.id === 'rd-range') {
    previewRange(e.target)
  }

  if (e.target.closest('#bf')) drawPreview()
})

document.addEventListener('change', e => {
  // halaman Setelan: kotak centang
  const prefIds = { 'p-potato': 'potato', 'p-resume': 'resume', 'p-wake': 'wake', 'p-ntoast': 'notifToast' }

// MAINTENANCE: kotak centang di Pengaturan admin (2x verifikasi, bukan simpan langsung)
  if (e.target.id === 'maintenance') {
    const now = S.set.maintenance === true || S.set.maintenance === 'true'
    e.target.checked = now           // kembalikan dulu; berubah hanya setelah 2x verifikasi
   return maintToggle(!now)
  }

  if (prefIds[e.target.id]) {
    P[prefIds[e.target.id]] = e.target.checked
    savePrefs()
    applyPrefs()

    if (e.target.id === 'p-potato') toast(P.potato ? 'Potato Mode aktif: animasi dimatikan' : 'Potato Mode mati: animasi aktif lagi')
  }

  if (e.target.name === 'pdffile') {
    const label = $('#pdfname')
    if (label) label.textContent = e.target.files[0] ? e.target.files[0].name : `Pilih file PDF (maks. ${EBOOK_MAX_MB} MB)`
  }

  if (e.target.id === 'rd-range') rdGoto(+e.target.value)

  if (['multi_book', 'multi_rent', 'email_verif', 'duration_var'].includes(e.target.id)) {
    const box = e.target
    run(db.from('settings').upsert({ key: box.id, value: box.checked }), 'Pengaturan disimpan')
      .then(ok => { if (ok) S.set[box.id] = box.checked; else box.checked = !box.checked })
  }

  if (e.target.name === 'coverfile') {
    pv.cover = e.target.files[0] ? URL.createObjectURL(e.target.files[0]) : ''
    drawPreview()
  }

  if (e.target.name === 'slidefiles') {
    pv.slides = [...e.target.files].map(file => URL.createObjectURL(file))
    drawPreview()
  }

  if (e.target.name === 'reason') e.target.form.custom.hidden = e.target.value !== '__lain'

  if (e.target.id === 'threadsel') {
    S.thread = e.target.value
    drawChat()
  }

  if (e.target.id === 'days') $('#custom').hidden = e.target.value !== 'custom'

  if (e.target.id === 'cfile' && e.target.files[0]) {
    toast('Gambar dipilih: ' + e.target.files[0].name)
  }
})

document.addEventListener('submit', async e => {
  e.preventDefault()

  const form = e.target
  const data = Object.fromEntries(new FormData(form))

   // MAINTENANCE: login admin dari layar maintenance
  if (form.id === 'maintlogin') return maintAdminLogin(form)

  // biodata (halaman Setelan)
  if (form.id === 'f-bio') {
    const name = data.name.trim()
    if (name.length < 2) return toast('Nama minimal 2 karakter', true)

    if (await run(db.rpc('update_my_profile', { n: name, k: data.kelas.trim() }), 'Biodata disimpan')) refreshMe()
    return
  }

  // pembatalan booking, langkah 1 -> 2
  if (form.id === 'cr') {
    const reason = data.reason === '__lain' ? data.custom.trim() : data.reason
    if (!reason) return toast('Tulis alasan pembatalanmu', true)

    S.cancel = { id: form.dataset.id, reason }
    return cancelStep2()
  }

  // masuk / daftar (tab Username atau E-mail)
  if (form.id === 'af') {
    const isRegister = form.dataset.reg === '1'
    const tab = form.dataset.tab
    const ident = (tab === 'username' ? data.username : data.email).trim().toLowerCase()

    busy(1)
    const result = await authenticate(isRegister, tab, ident, data)
    busy(-1)

    if (result.error) return toast(friendlyError(result.error), true)

    closeModal()
    toast('Selamat datang!')
    return
  }

  // alur akun: e-mail, kata sandi, username, kode
  if (form.id === 'f-email') return submitEmail(data)
  if (form.id === 'f-pass') return submitPass(data)
  if (form.id === 'f-user') return submitUser(data)
  if (form.id === 'cs') return S.flow?.done(data)

  // simpan buku
  if (form.id === 'bf') {
    let cover = data.cover || null
    const slides = data.slides.split('\n').map(s => s.trim()).filter(Boolean)

    // file yang dipilih diunggah dulu, lalu URL-nya disimpan
    const coverFile = form.coverfile.files[0]
    if (coverFile) {
      cover = await uploadImage(coverFile)
      if (!cover) return
    }

    for (const file of form.slidefiles.files) {
      const url = await uploadImage(file)
      if (!url) return
      slides.push(url)
    }

    // jenis buku: e-book butuh PDF (unggah / URL) atau gambar halaman (slide)
    const kind = data.kind === 'ebook' ? 'ebook' : 'fisik'
    let pdfUrl = (data.pdf_url || '').trim() || null

    if (kind === 'ebook') {
      const pdfFile = form.pdffile.files[0]

      if (pdfFile) {
        pdfUrl = await uploadPdf(pdfFile)
        if (!pdfUrl) return
      }

      if (!pdfUrl && !slides.length) return toast('E-book perlu berkas PDF atau gambar halaman (slide)', true)
    }

    const row = {
      title: data.title,
      author: data.author,
      category: data.category,
      kind,
      stock: kind === 'ebook' ? 0 : +data.stock,
      publish_year: data.year ? +data.year : null,
      pages: data.pages ? +data.pages : null,
      limited: kind === 'fisik' && !!data.limited,
      pdf_url: kind === 'ebook' ? pdfUrl : null,
      can_download: !!data.can_download,
      read_dir: kind === 'ebook' && data.read_dir === 'rtl' ? 'rtl' : 'ltr',
      cover,
      description: data.description,
      slides
    }
    const id = form.dataset.id

    const request = id
      ? db.from('books').update(row).eq('id', id)
      : db.from('books').insert(row)

    if (await run(request, 'Buku disimpan')) {
      closeModal()
      loadData()
    }
    return
  }

  // kirim chat
  if (form.id === 'cf') sendChat(form)

  // kirim pesan peminjaman
  if (form.id === 'pf') sendPesan(form)
})


/* ---------- 11. MULAI ---------- */

     // MAINTENANCE: cek status saat halaman dibuka, lalu cek ulang pelan-pelan di latar
     M.ready = maintCheck()
     setInterval(() => {
       if (!M.shown && document.visibilityState === 'visible' && navigator.onLine) maintCheck()
     }, 60000)
 

loadVersion()

db.auth.onAuthStateChange((event, session) => {
  // setTimeout: supabase-js melarang query langsung di dalam callback ini
  setTimeout(async () => {
    // akun yang sama (token diperbarui): cukup simpan token terbaru
    if (session && S.me && session.user.id === S.me.id) {
      saveAccount(session, S.me)
      return
    }

    // ganti akun / login / logout: tutup dialog konfirmasi yang masih terbuka, lalu kosongkan data akun sebelumnya
    closeAsk(false)
    setMenu(false)

    S.me = null
    S.mine = []
    S.all = []
    S.msgs = []
    S.thread = null
    S.chats = []
    S.cmsgs = []
    S.chatSel = null
    S.seen = {}
    S.pOpen = false
    S.notifs = []
    S.notifsReady = false
    closeReader(true)

    if (session) {
      const { data } = await db.from('profiles').select('*').eq('id', session.user.id).single()
      S.me = data

        // login lewat form admin di layar maintenance: akun non-admin langsung dikeluarkan lagi
      if (M.adminAttempt) {
         M.adminAttempt = false
 
        if (M.on && S.me?.role !== 'admin') {
           S.me = null
            await db.auth.signOut({ scope: 'local' })
            toast('Hanya akun admin yang dapat masuk saat maintenance', true)
            return
         }
      }
 

      // e-mail sudah berganti lewat tautan di e-mail? kalau ya, tandai terverifikasi
      if (S.me?.email && !S.me.email_verified) {
        const check = await db.rpc('email_verified_now')
        if (check.data) S.me.email_verified = true
      }

      if (S.me) {
        saveAccount(session, S.me)
        loadSeen()
      }
    }

    if (!S.me && !['katalog', 'setelan'].includes(S.view)) S.view = 'katalog'
    if (['admin', 'pengaturan'].includes(S.view) && S.me?.role !== 'admin') S.view = 'katalog'
    if (S.view === 'saya' && S.me?.role === 'admin') S.view = 'katalog'

    setChat(false)
    $('#main').innerHTML = SPINNER
    await loadData(true)
    await loadChat()
    await loadPesan()
    await loadNotifs()
    initSeen()

    if (location.hash.startsWith('#buku=') && !$('#modal').classList.contains('open')) {
      openBook(location.hash.slice(6))
    }
  }, 0)
})

// realtime: perubahan di database langsung tampil tanpa refresh
function refresh(table) {
  if (table === 'notifications') return loadNotifs()
  if (table === 'messages') return loadChat()
  if (table === 'loan_chats' || table === 'loan_msgs') return loadPesan()
  return loadData()
}

const timers = {}

db.channel('live')
  .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
    clearTimeout(timers[payload.table])
    timers[payload.table] = setTimeout(
      () => refresh(payload.table),
      300
    )
  })
  .subscribe()


// ---------- deteksi offline ----------
let wasOffline = false

function updateOnline() {
  const offline = !navigator.onLine
  $('#offline').classList.toggle('show', offline)

  if (!offline && wasOffline) {
    toast('Kembali online')
    loadData()
  }
  wasOffline = offline
}

addEventListener('online', updateOnline)
addEventListener('offline', updateOnline)
updateOnline()


// ---------- zoom gambar: roda mouse dan geser (pan) ----------
document.addEventListener('wheel', e => {
  const stage = e.target.closest('.stage')
  if (!stage) return

  e.preventDefault()
  setZoom(stage, zoom.z + (e.deltaY < 0 ? 0.25 : -0.25))
}, { passive: false })

document.addEventListener('pointerdown', e => {
  const stage = e.target.closest('.stage')
  if (!stage || zoom.z <= 1 || e.target.closest('button')) return

  drag = { stage, x: e.clientX - zoom.x, y: e.clientY - zoom.y }
  stage.classList.add('drag')
})

document.addEventListener('pointermove', e => {
  if (!drag) return

  zoom.x = e.clientX - drag.x
  zoom.y = e.clientY - drag.y
  applyZoom(drag.stage)
})

document.addEventListener('pointerup', () => {
  if (drag) drag.stage.classList.remove('drag')
  drag = null
})