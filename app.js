/* ==========================================================
   PustakaKita - app.js
   1. Konfigurasi   2. Data tetap   3. State   4. Helper   5. Tema
   6. Ambil data    7. Tampilan     8. Chat    9. Modal    10. Event   11. Mulai
   ========================================================== */


/* ---------- 1. KONFIGURASI ---------- */
const SUPABASE_URL = 'https://ciwkmgjqycnhhfmksgzp.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpd2ttZ2pxeWNuaGhmbWtzZ3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MjExMzcsImV4cCI6MjEwODE5NzEzN30.1oWNVu3JI7pxI3EuLADkh-6vpiUZwzieyIbcp4VwOOU'

const db = supabase.createClient(new URL(SUPABASE_URL).origin, SUPABASE_KEY)


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
const LIMITED_HTML = ' - <span class="ltd">LIMITED TIME!</span>'

// versi website = jumlah commit di GitHub (contoh: 25 commit -> "v1.25")
const GITHUB_REPO = 'OWNER/REPO'    // <-- GANTI, contoh: 'username/pustakakita' (repo harus public)
const VERSION_MAJOR = 1
const VERSION_FALLBACK = 'v1.0'     // dipakai jika GitHub tidak bisa dihubungi / repo belum diisi
const RELEASE_ID = '2026-10-24b'    // ganti setiap rilis baru supaya tanda NEW! muncul lagi

// data tab Developer (ubah sesukamu)
const DEVELOPER = {
  name: 'Tim Ekskul Coding',
  role: 'Main Leader: Wildan',
  contact: '',   // contoh: 'email@contoh.com'
  link: ''       // contoh: 'https://github.com/username'
}

// catatan update manual (tampil di tab Update Log, di atas riwayat commit GitHub)
// Urutan: yang terbaru di atas. Tiap rilis baru = tambah satu entri baru di paling atas,
// entri lama jangan dihapus/diubah supaya riwayatnya tetap ada. Jangan lupa ganti RELEASE_ID.
const CHANGELOG = [
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

  if (year > 0) items.push(['📅', year, 'Tahun terbit'])
  if (pages > 0) items.push(['📄', pages.toLocaleString('id-ID'), 'Halaman'])

  return items.length
    ? `<div class="facts">${items.map(([icon, value, label]) =>
      `<div><span aria-hidden="true">${icon}</span><b>${value}</b><small>${label}</small></div>`).join('')}</div>`
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

function ask(options) {
  const o = typeof options === 'string' ? { text: options } : options

  // jika masih ada dialog terbuka, tutup dulu sebagai "batal"
  if (askDone) closeAsk(false)

  const noButton = o.no === false
    ? ''
    : `<button type="button" class="btn ghost" data-cfm="no">${esc(o.no || 'Batal')}</button>`

  $('#confirm').innerHTML = `
    <div class="cbox ${o.danger ? 'danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="cfm-title" aria-describedby="cfm-text">
      <div class="cicon" aria-hidden="true">${o.icon || (o.danger ? '⚠️' : '❓')}</div>
      <h3 id="cfm-title">${esc(o.title || 'Konfirmasi')}</h3>
      <p id="cfm-text">${esc(o.text)}</p>
      <div class="cact">
        ${noButton}
        <button type="button" class="btn ${o.danger ? 'danger' : ''}" data-cfm="yes">${esc(o.yes || 'Ya')}</button>
      </div>
    </div>`

  return new Promise(resolve => {
    askDone = resolve
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
  if (e.target.id === 'confirm') return closeAsk(false)

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


/* ---------- 5. TEMA (satu tombol ikon) ---------- */
const THEMES = [
  { name: 'ungu', icon: '🔮' },
  { name: 'gelap', icon: '🌙' },
  { name: 'terang', icon: '☀️' }
]

function setTheme(name) {
  const theme = THEMES.find(t => t.name === name) || THEMES[0]

  document.documentElement.dataset.theme = theme.name
  $('#theme').textContent = theme.icon
  $('#theme').title = 'Tema ' + theme.name + ' (klik untuk ganti)'
  drawDrawerFoot()

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
  if (!document.startViewTransition || reduce) return setTheme(next)

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
  if (me) menu.push(['pesan', 'Pesan', pesanUnread()])
  if (isAdmin) menu.push(['admin', 'Kelola peminjaman', adminCount()], ['pengaturan', 'Pengaturan admin', 0])

  $('#nav').innerHTML = menu
    .map(([key, label, n]) => `<button class="${S.view === key ? 'on' : ''}" data-v="${key}">${label}${nb(n)}</button>`)
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
    : '<button class="dbtn acc" data-accounts>👤 Masuk / Daftar</button>'

  box.innerHTML = `
    ${account}
    <button class="dbtn" data-info="about"><span>ℹ️ Informasi</span>${infoHasNew() ? '<i class="newtag">NEW!</i>' : ''}</button>
    <button class="dbtn" data-themebtn><span>${theme.icon} Tema ${esc(theme.name)}</span><small>ketuk untuk ganti</small></button>`
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
matchMedia('(min-width: 901px)').addEventListener?.('change', e => {
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
         <span>⚠️ Kamu terlambat mengembalikan ${late.length > 1 ? late.length + ' buku' : 'buku'}:
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
}


/* ---------- 6. AMBIL DATA ---------- */
async function loadData(animate) {
  const books = await db.from('books').select('*').order('created_at', { ascending: false })
  S.books = books.data || []

  const settings = await db.from('settings').select('*')
  S.set = { multi_book: false, multi_rent: false, email_verif: false, duration_var: false }
    ; (settings.data || []).forEach(row => { S.set[row.key] = row.value })

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
  if (!S.me) return

  const { data } = await db.from('messages')
    .select('*,profiles(name)')
    .order('created_at')
  S.msgs = data || []

  if (S.chatOpen) drawChat()
  refreshBadges()
}


async function loadPesan(showSpinner) {
  if (!S.me) return

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

  const views = { katalog: viewKatalog, saya: viewSaya, admin: viewAdmin, pengaturan: viewPengaturan, pesan: viewPesan }
  $('#main').className = 'view' + (animate ? ' anim' : '')
  $('#main').innerHTML = (views[S.view] || viewKatalog)()

  if (S.view === 'katalog') drawGrid()
  if (S.view === 'admin') drawRows()
  if (S.view === 'pesan') drawPesan()

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
    <div class="bar">
      <input id="q" placeholder="Cari judul atau penulis" value="${esc(S.q)}">
      <select id="cat">${categoryOptions(S.cat, true)}</select>
      <select id="bsort" aria-label="Urutkan buku">
        ${BSORTS.map(([key, label]) => `<option value="${key}" ${S.bsort === key ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
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

function drawGrid() {
  const keyword = S.q.toLowerCase()

  const list = S.books.filter(b => {
    const matchCategory = !S.cat || b.category === S.cat
    const matchText = (b.title + ' ' + (b.author || '')).toLowerCase().includes(keyword)
    return matchCategory && matchText
  })

  sortBooks(list)

  if (!list.length) {
    $('#grid').innerHTML = '<p class="empty">Belum ada buku yang cocok.</p>'
    drawPager(0, 0)
    return
  }

  // halaman katalog
  const pages = Math.ceil(list.length / PER_PAGE)
  S.page = Math.min(Math.max(S.page, 1), pages)
  const start = (S.page - 1) * PER_PAGE

  $('#grid').innerHTML = list.slice(start, start + PER_PAGE).map(b => `
    <article class="card" data-card="${b.id}">
      <div class="cover">📖${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>
      <div class="ci">
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.author)}</p>
        ${bookMeta(b)}
        ${stockLabel(b)}
      </div>
    </article>`).join('')

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
            <span class="pin">📍</span>
            <div>
              <b>Lokasi: ${LOKASI}</b>
              <p>${CATATAN}</p>
            </div>
          </div>` : ''}
      </div>`
  }).join('')
}

function viewAdmin() {
  const count = status => S.all.filter(l => l.status === status).length
  const asked = S.all.filter(l => l.status === 'dipinjam' && l.return_requested_at).length

  return `
    <div class="stats">
      <div><b>${count('booking')}</b>Menunggu</div>
      <div><b>${count('approved')}</b>Siap diambil</div>
      <div><b>${count('dipinjam')}</b>Dipinjam</div>
      <div><b>${asked}</b>Minta dikembalikan</div>
      <div><b>${S.all.filter(isLate).length}</b>Terlambat</div>
    </div>
    <div class="bar">
      <input id="f" placeholder="Cari kode, nama peminjam, atau judul" value="${esc(S.f)}">
      <select id="sortby" aria-label="Urutkan">
        ${SORTS.map(([key, label]) => `<option value="${key}" ${S.sort === key ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <select id="sfilter" aria-label="Filter status">
        <option value="">Semua status</option>
        ${STATUS_ORDER.map(key => `<option value="${key}" ${S.sf === key ? 'selected' : ''}>${STATUS_SHORT[key]}</option>`).join('')}
      </select>
    </div>
    <div class="tw">
      <table>
        <thead>
          <tr><th>Kode</th><th>Peminjam</th><th>Buku</th><th>Diajukan</th><th>Durasi</th><th>Status</th><th>Aksi</th></tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>`
}

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
    ${toggle('email_verif', 'Verifikasi E-mail', 'Hidup: user bisa menambah/memverifikasi e-mail, mereset kata sandi, dan mengganti username. Mati (default): semua fitur itu disembunyikan.')}`
}

function viewPesan() {
  return `
    <div class="pesan">
      <aside id="plist"></aside>
      <section class="ppanel">
        <div class="phead" id="phead"></div>
        <div id="pmsgs"></div>
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

function drawPesan() {
  if (!$('#plist')) return

  const isAdmin = S.me.role === 'admin'
  const mobile = isMobile()
  const chats = S.chats.filter(c => isAdmin ? !c.hidden_admin : !c.hidden_user)

  if (!chats.some(c => c.id === S.chatSel)) S.chatSel = chats[0]?.id || null
  const cur = chats.find(c => c.id === S.chatSel)
  if (!cur) S.pOpen = false

  const msgsOf = id => S.cmsgs.filter(m => m.chat_id === id)

  // daftar percakapan (gaya WhatsApp): judul, pratinjau, jam, jumlah belum dibaca
  $('#plist').innerHTML = chats.length
    ? chats.map(c => {
      const last = [...msgsOf(c.id)].reverse().find(m => !m.sys)
      const who = isAdmin ? (c.profiles?.name || '?') : 'Admin perpustakaan'

      return `
        <button class="pitem ${c.id === S.chatSel ? 'on' : ''}" data-pchat="${c.id}">
          <span class="ava">${esc(who[0] || '?').toUpperCase()}</span>
          <div class="pi">
            <div class="pr"><b>${esc(c.loans?.books?.title)}</b><small>${last ? fmtShort(last.created_at) : ''}</small></div>
            <div class="pr">
              <span class="pp">${esc(who)}${c.ended ? ' · berakhir' : ''}${last ? ' · ' + esc(previewPrefix(last, isAdmin) + last.body) : ''}</span>
              ${nb(unreadIn(c.id))}
            </div>
          </div>
        </button>`
    }).join('')
    : '<p class="hint">Belum ada pesan. Chat dibuat otomatis saat admin menyetujui bookingmu.</p>'

  const list = cur ? msgsOf(cur.id) : []

  // admin: lihat siapa admin yang terakhir membalas
  let replyInfo = ''
  if (cur && isAdmin) {
    const reply = [...list].reverse().find(m => m.from_admin && !m.sys)
    replyInfo = reply
      ? ` · dibalas terakhir oleh <b>${esc(reply.sender_name || 'admin')}</b>`
      : ' · belum dibalas'
  }

  $('#phead').innerHTML = cur
    ? `<button class="back" data-pback aria-label="Kembali ke daftar pesan">←</button>
       <div class="ptitle">
         <b>${esc(cur.loans?.books?.title)}</b>
         <small class="hint">${isAdmin ? esc(cur.profiles?.name) + ' · ' : ''}Kode ${esc(cur.loans?.code)}${replyInfo}</small>
       </div>
       ${isAdmin && !cur.ended ? `<button class="btn danger sm" data-pend="${cur.id}">Akhiri percakapan</button>` : ''}`
    : ''

  // mode HP: chat dibuka layar penuh setelah salah satu percakapan diklik
  $('.pesan').classList.toggle('open', mobile && S.pOpen && !!cur)

  // chat yang sedang terlihat dianggap sudah dibaca
  if (cur && (!mobile || S.pOpen)) {
    const latest = lastTime(list)
    if (latest) setSeen('pc:' + cur.id, latest)
  }

  $('#pf').hidden = !cur || cur.ended
  $('#pend').hidden = !(cur && cur.ended)
  $('#pbody').value = S.draft

  $('#pmsgs').innerHTML = S.pLoad ? SPINNER : cur
    ? list.map(m => m.sys
      ? `<div class="sys">${esc(m.body)}</div>`
      : `<div class="msg ${m.from_admin === isAdmin ? 'me' : ''}">
            ${esc(m.body)}
            <small>${senderLabel(m, isAdmin, cur.profiles?.name)}, ${fmtTime(m.created_at)}</small>
          </div>`).join('')
    : '<p class="hint">Pilih percakapan di samping.</p>'

  $('#pmsgs').scrollTop = $('#pmsgs').scrollHeight
  refreshBadges()
}

async function sendPesan(form) {
  const body = form.body.value.trim()
  if (!body || !S.chatSel) return

  const ok = await run(db.from('loan_msgs').insert({
    chat_id: S.chatSel,
    from_admin: S.me.role === 'admin',
    sender_name: S.me.name,
    body
  }))

  if (ok) {
    form.reset()
    S.draft = ''
    await loadPesan()
  }
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
    icon: '🗑️'
  })
  if (!yes) return

  if (await run(db.rpc('hide_loan_chat', { cid: S.chatSel }), 'Chat dihapus dari daftarmu')) {
    S.pOpen = false
    loadPesan()
  }
}

function drawRows() {
  const keyword = S.f.toLowerCase()

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

  const list = S.all
    .filter(l => !S.sf || l.status === S.sf)
    .filter(l => (l.code + ' ' + l.profiles?.name + ' ' + l.books?.title).toLowerCase().includes(keyword))
    .sort((a, b) => {
      if (S.sort === 'terbaru') return newest(a, b)
      if (S.sort === 'terlama') return newest(b, a)
      if (S.sort === 'terlambat') return (isLate(b) - isLate(a)) || (rank(a) - rank(b)) || newest(a, b)
      return (rank(a) - rank(b)) || newest(a, b)
    })

  if (!list.length) {
    $('#rows').innerHTML = '<tr><td colspan="7">Belum ada data.</td></tr>'
    return
  }

  $('#rows').innerHTML = list.map(l => `
    <tr>
      <td><b>${l.code}</b></td>
      <td>${esc(l.profiles?.name)}</td>
      <td>${esc(l.books?.title)}</td>
      <td>${fmtDateTime(l.created_at)}</td>
      <td>${l.days} hari</td>
      <td>
        <span class="chip s-${l.status}">${STATUS_SHORT[l.status] || l.status}</span>
        ${l.status === 'dipinjam' && l.return_requested_at ? `<br><small class="hint">📥 Minta dikembalikan, ${fmtDateTime(l.return_requested_at)}</small>` : ''}
        ${l.status === 'dikembalikan' && l.returned_at ? `<br><small class="hint">Otomatis selesai ${fmtDateTime(+new Date(l.returned_at) + 86400000)}</small>` : ''}
        ${l.cancel_reason ? `<br><small class="hint">Alasan: ${esc(l.cancel_reason)}</small>` : ''}
        ${isLate(l) ? '<b class="late">terlambat</b>' : ''}
      </td>
      <td>${actions[l.status]?.(l.id) || '-'}</td>
    </tr>`).join('')
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
function modal(html) {
  $('#modal').innerHTML = `<div class="box">${html}<button class="x" data-close aria-label="Tutup">✕</button></div>`
  $('#modal').classList.add('open')
}

function closeModal() {
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

  const images = [b.cover, ...(b.slides || [])].filter(Boolean)
  const me = S.me
  const active = l => ['booking', 'approved', 'dipinjam'].includes(l.status)
  const already = S.mine.some(l => l.book_id === b.id && active(l))
  const hasBooking = S.mine.some(l => ['booking', 'approved'].includes(l.status))
  const hasRent = S.mine.some(l => l.status === 'dipinjam')
  const limitBooking = !S.set.multi_book && hasBooking
  const limitRent = !S.set.multi_rent && hasRent
  const canBook = b.stock > 0 && !already && !limitBooking && !limitRent

  let note = ''
  if (already) note = 'Kamu sudah booking atau meminjam buku ini.'
  else if (limitBooking) note = 'Kamu masih punya booking aktif. Selesaikan atau batalkan dulu.'
  else if (limitRent) note = 'Kembalikan buku yang sedang kamu pinjam dulu sebelum booking lagi.'

  let actions = ''

  if (!me) {
    actions = '<p class="hint">Masuk dulu untuk booking buku ini.</p>'
  } else if (me.role === 'admin') {
    actions = `
      <button class="btn" data-edit="${b.id}">Edit</button>
      <button class="btn danger" data-del="${b.id}">Hapus</button>`
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

  const durationNote = me?.role === 'admin' ? '' : `
    <p class="hint durnote">⏱️ ${S.set.duration_var ? 'Pilih lama pinjam sesukamu.' : `Durasi pinjam ${DEFAULT_DAYS} hari.`} Buku bisa dikembalikan kapan saja.</p>`

  modal(`
    <div class="stage" data-i="0" data-n="${images.length}">
      <div class="track">
        ${images.map(u => `<div class="slide"><img src="${esc(u)}" alt=""></div>`).join('') || '<div class="slide">📖</div>'}
      </div>
      ${images.length ? ZOOMBAR : ''}
      ${images.length > 1 ? `
        <button class="snav l" data-slide="-1" aria-label="Sebelumnya">&lt;</button>
        <button class="snav r" data-slide="1" aria-label="Berikutnya">&gt;</button>
        <span class="count">1 / ${images.length}</span>` : ''}
    </div>
    <h2>${esc(b.title)}</h2>
    <p class="hint">${esc(b.author)} · ${esc(b.category)} · ID ${b.id}</p>
    ${bookFacts(b)}
    <p style="margin-top:.6rem">${esc(b.description) || 'Belum ada deskripsi.'}</p>
    <p class="${b.stock ? 'ok' : 'no'}" style="margin-top:.6rem"><b>${b.stock ? 'Stok tersedia: ' + b.stock + (b.limited ? LIMITED_HTML : '') : 'Stok habis'}</b></p>
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

const pv = { cover: '', slides: [] }   // URL sementara untuk file yang baru dipilih

function drawPreview() {
  const form = $('#bf')
  if (!form || !$('#bprev')) return

  const f = form.elements
  const cover = pv.cover || f.cover.value.trim()
  const slides = f.slides.value.split('\n').map(s => s.trim()).filter(Boolean).concat(pv.slides)
  const stock = +f.stock.value
  const limited = f.limited && f.limited.checked

  $('#bprev').innerHTML = `
    <p class="hint">Pratinjau (seperti tampilan di katalog)</p>
    <div class="prev-row">
      <article class="card prev-card">
        <div class="cover">📖${cover ? `<img src="${esc(cover)}" alt="" onerror="this.remove()">` : ''}</div>
        <div class="ci">
          <h3>${esc(f.title.value) || 'Judul buku'}</h3>
          <p>${esc(f.author.value) || 'Penulis'}</p>
          ${bookMeta({ publish_year: f.year.value, pages: f.pages.value })}
          ${stockLabel({ stock, limited })}
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

  const field = (name, placeholder, required = '') =>
    `<input name="${name}" placeholder="${placeholder}" value="${esc(b[name])}" ${required}>`

  modal(`
    <h2>${b.id ? 'Edit buku' : 'Tambah buku'}</h2>
    <form id="bf" data-id="${b.id || ''}">
      ${field('title', 'Judul', 'required')}
      ${field('author', 'Penulis')}
      <select name="category" required>${categoryOptions(b.category, false)}</select>
      <input name="stock" type="number" min="0" placeholder="Stok" value="${b.stock ?? 1}" required>
      <div class="row2">
        <label class="hint">Tahun terbit
          <input name="year" type="number" min="1000" max="${new Date().getFullYear() + 1}" placeholder="mis. 2019" value="${esc(b.publish_year)}">
        </label>
        <label class="hint">Jumlah halaman
          <input name="pages" type="number" min="1" max="10000" placeholder="mis. 320" value="${esc(b.pages)}">
        </label>
      </div>
      <label class="check">
        <input type="checkbox" name="limited" ${b.limited ? 'checked' : ''}>
        <span>LIMITED TIME <small class="hint">(label kuning di samping stok)</small></span>
      </label>
      ${field('cover', 'URL thumbnail (gambar sampul)')}
      <label class="hint">Atau unggah file thumbnail (maks. 2 MB)
        <input type="file" name="coverfile" accept="image/*">
      </label>
      <textarea name="slides" placeholder="URL gambar slide, satu per baris">${esc((b.slides || []).join('\n'))}</textarea>
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
        <span class="pin">📍</span>
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
    <p>PustakaKita adalah perpustakaan sekolah online. Lihat katalog, booking buku dari rumah, lalu ambil di perpustakaan setelah disetujui admin.</p>
    <ul>
      <li>Katalog buku dengan pencarian, kategori, dan halaman.</li>
      <li>Booking buku ${S.set.duration_var ? 'dengan durasi pilihan' : `dengan durasi ${DEFAULT_DAYS} hari`}, dan bisa dikembalikan kapan saja.</li>
      <li>Pesan langsung dengan admin untuk setiap peminjaman.</li>
      <li>Chat Customer Service untuk pertanyaan umum.</li>
    </ul>`
}

function openInfo(tab) {
  const showNew = infoHasNew()
  S.infoTab = tab

  if (tab === 'log') {
    try {
      localStorage.setItem('log-seen', RELEASE_ID)
    } catch (e) { }
    drawVersion()

    if (GH_ON() && !V.log && !V.logErr) {
      loadLog().then(() => {
        if (S.infoTab === 'log' && $('.ibody')) $('.ibody').innerHTML = infoBody('log')
      })
    }
  }

  const tabs = INFO_TABS
    .map(([key, label]) => `<button type="button" class="${tab === key ? 'on' : ''}" data-itab="${key}">${label}${key === 'log' && showNew ? '<i class="newtag">NEW!</i>' : ''}</button>`)
    .join('')

  modal(`
    <h2>Informasi</h2>
    <div class="tabs itabs">${tabs}</div>
    <div class="ibody">${infoBody(tab)}</div>`)
}


/* ---------- 10. EVENT ---------- */
document.addEventListener('click', async e => {
  const find = key => e.target.closest(`[data-${key}]`)
  let el

  // tutup modal
  if (e.target.id === 'modal' || find('close')) return closeModal()

  // menu slide (HP): tombol hamburger, tombol tutup, dan area gelap
  if (el = find('menu')) return setMenu(el.dataset.menu === 'open')

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
      drawGrid()
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
      icon: '🗑️'
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
      icon: '📚'
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
    S.pOpen = true   // mode HP: buka chat layar penuh
    return drawPesan()
  }
  if (find('pback')) {
    S.pOpen = false
    return drawPesan()
  }
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
    drawGrid()
  } else if (e.target.id === 'bsort') {
    S.bsort = e.target.value
    S.page = 1
    drawGrid()
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
  }

  if (e.target.closest('#bf')) drawPreview()
})

document.addEventListener('change', e => {
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

    const row = {
      title: data.title,
      author: data.author,
      category: data.category,
      stock: +data.stock,
      publish_year: data.year ? +data.year : null,
      pages: data.pages ? +data.pages : null,
      limited: !!data.limited,
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

    if (session) {
      const { data } = await db.from('profiles').select('*').eq('id', session.user.id).single()
      S.me = data

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

    if (!S.me && S.view !== 'katalog') S.view = 'katalog'
    if (['admin', 'pengaturan'].includes(S.view) && S.me?.role !== 'admin') S.view = 'katalog'
    if (S.view === 'saya' && S.me?.role === 'admin') S.view = 'katalog'

    setChat(false)
    $('#main').innerHTML = SPINNER
    await loadData(true)
    await loadChat()
    await loadPesan()
    initSeen()

    if (location.hash.startsWith('#buku=') && !$('#modal').classList.contains('open')) {
      openBook(location.hash.slice(6))
    }
  }, 0)
})

// realtime: perubahan di database langsung tampil tanpa refresh
function refresh(table) {
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