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
  'Fiksi', 'Non-Fiksi', 'Pelajaran', 'Sains', 'Sejarah',
  'Komik', 'Biografi', 'Bahasa', 'Agama', 'Lainnya'
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

const COOLDOWN_CHAT = 5000

// informasi pengambilan buku (ubah di sini jika lokasi berpindah)
const LOKASI = 'Perpustakaan SMAN 03 JONGGOL, di samping Kelas 10.5'
const CATATAN = 'Temui penjaga perpustakaan untuk mengambil dan mengembalikan buku.'


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
  set: { multi_book: false, multi_rent: false },  // pengaturan admin
  chats: [],       // percakapan peminjaman (halaman Pesan)
  cmsgs: [],
  chatSel: null,
  draft: '',
  pLoad: false,    // true saat chat Pesan sedang dimuat ulang
  cancel: null,    // data pembatalan yang sedang diproses
  reopen: false    // user memulai chat baru setelah diakhiri
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

function isLate(loan) {
  return loan.status === 'dipinjam' && new Date(loan.due_at) < new Date()
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
  if (error.code === '23505') return 'Kamu sudah booking atau meminjam buku ini'
  if (/not confirmed/i.test(error.message)) return 'Email belum diverifikasi. Cek kotak masuk emailmu.'
  return error.message
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
    email: session.user.email,
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


/* ---------- 6. AMBIL DATA ---------- */
async function loadData(animate) {
  const books = await db.from('books').select('*').order('created_at', { ascending: false })
  S.books = books.data || []

  const settings = await db.from('settings').select('*')
  S.set = { multi_book: false, multi_rent: false }
    ; (settings.data || []).forEach(row => { S.set[row.key] = row.value })

  S.mine = []
  S.all = []

  if (S.me) {
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
}


/* ---------- 7. TAMPILAN ---------- */
function render(animate) {
  const me = S.me
  const isAdmin = me?.role === 'admin'

  const menu = [['katalog', 'Katalog']]
  if (me && !isAdmin) menu.push(['saya', 'Pinjaman saya'])
  if (me) menu.push(['pesan', 'Pesan'])
  if (isAdmin) menu.push(['admin', 'Kelola peminjaman'], ['pengaturan', 'Pengaturan admin'])

  $('#nav').innerHTML = menu
    .map(([key, label]) => `<button class="${S.view === key ? 'on' : ''}" data-v="${key}">${label}</button>`)
    .join('')

  $('#auth').innerHTML = me
    ? `<button class="who" data-accounts title="Akun di perangkat ini">
         <span class="ava">${esc(me.name[0] || '?').toUpperCase()}</span>
         ${esc(me.name)}${isAdmin ? ' <b class="chip">admin</b>' : ''}
       </button>`
    : `<button class="btn" data-accounts>Masuk / Daftar</button>`

  const views = { katalog: viewKatalog, saya: viewSaya, admin: viewAdmin, pengaturan: viewPengaturan, pesan: viewPesan }
  $('#main').className = 'view' + (animate ? ' anim' : '')
  $('#main').innerHTML = (views[S.view] || viewKatalog)()

  if (S.view === 'katalog') drawGrid()
  if (S.view === 'admin') drawRows()
  if (S.view === 'pesan') drawPesan()

  // gelembung chat hanya untuk yang sudah login
  $('#bubble').hidden = !me
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
      ${addButton}
    </div>
    <div class="grid" id="grid"></div>`
}

function drawGrid() {
  const keyword = S.q.toLowerCase()

  const list = S.books.filter(b => {
    const matchCategory = !S.cat || b.category === S.cat
    const matchText = (b.title + ' ' + (b.author || '')).toLowerCase().includes(keyword)
    return matchCategory && matchText
  })

  if (!list.length) {
    $('#grid').innerHTML = '<p class="empty">Belum ada buku yang cocok.</p>'
    return
  }

  $('#grid').innerHTML = list.map(b => `
    <article class="card" data-card="${b.id}">
      <div class="cover">📖${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>
      <div class="ci">
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.author)}</p>
        <em class="${b.stock ? 'ok' : 'no'}">${b.stock ? 'Stok ' + b.stock : 'Stok habis'}</em>
      </div>
    </article>`).join('')
}

function viewSaya() {
  if (!S.mine.length) {
    return '<p class="empty">Kamu belum meminjam buku. Buka katalog dan booking buku pertamamu.</p>'
  }

  return S.mine.map(l => {
    const showCode = ['approved', 'dipinjam'].includes(l.status)
    const dueText = l.due_at ? `, jatuh tempo ${fmtDate(l.due_at)}${isLate(l) ? ' (terlambat)' : ''}` : ''

    return `
      <div class="loan">
        <div>
          <h3>${esc(l.books?.title)}</h3>
          <span class="chip s-${l.status}">${STATUS[l.status]}</span>
          <p class="${isLate(l) ? 'late' : ''}">Durasi ${l.days} hari${dueText}</p>
        </div>
        ${showCode ? `<div class="code"><small>Tunjukkan kode ke petugas</small><b>${l.code}</b></div>` : ''}
        ${l.status === 'booking' ? `<button class="btn ghost sm" data-cancel="${l.id}">Batalkan</button>` : ''}
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

  return `
    <div class="stats">
      <div><b>${count('booking')}</b>Menunggu</div>
      <div><b>${count('approved')}</b>Siap diambil</div>
      <div><b>${count('dipinjam')}</b>Dipinjam</div>
      <div><b>${S.all.filter(isLate).length}</b>Terlambat</div>
    </div>
    <div class="bar">
      <input id="f" placeholder="Cari kode, nama peminjam, atau judul" value="${esc(S.f)}">
    </div>
    <div class="tw">
      <table>
        <thead>
          <tr><th>Kode</th><th>Peminjam</th><th>Buku</th><th>Durasi</th><th>Status</th><th>Aksi</th></tr>
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
    ${toggle('multi_rent', 'Meminjam banyak buku sekaligus', 'Mati: user hanya boleh meminjam satu buku sampai dikembalikan.')}`
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

function drawPesan() {
  if (!$('#plist')) return

  const isAdmin = S.me.role === 'admin'
  const chats = S.chats.filter(c => isAdmin ? !c.hidden_admin : !c.hidden_user)

  if (!chats.some(c => c.id === S.chatSel)) S.chatSel = chats[0]?.id || null
  const cur = chats.find(c => c.id === S.chatSel)

  $('#plist').innerHTML = chats.length
    ? chats.map(c => `
        <button class="${c.id === S.chatSel ? 'on' : ''}" data-pchat="${c.id}">
          <b>${esc(c.loans?.books?.title)}</b>
          <small>${isAdmin ? esc(c.profiles?.name) : 'Admin perpustakaan'}${c.ended ? ' · berakhir' : ''}</small>
        </button>`).join('')
    : '<p class="hint">Belum ada pesan. Chat dibuat otomatis saat admin menyetujui bookingmu.</p>'

  $('#phead').innerHTML = cur
    ? `<div><b>${esc(cur.loans?.books?.title)}</b> <small class="hint">Kode ${esc(cur.loans?.code)}</small></div>
       ${isAdmin && !cur.ended ? `<button class="btn danger sm" data-pend="${cur.id}">Akhiri percakapan</button>` : ''}`
    : ''

  $('#pf').hidden = !cur || cur.ended
  $('#pend').hidden = !(cur && cur.ended)
  $('#pbody').value = S.draft

  const list = S.cmsgs.filter(m => m.chat_id === S.chatSel)

  $('#pmsgs').innerHTML = S.pLoad ? SPINNER : cur
    ? list.map(m => m.sys
      ? `<div class="sys">${esc(m.body)}</div>`
      : `<div class="msg ${m.from_admin === isAdmin ? 'me' : ''}">
            ${esc(m.body)}
            <small>${m.from_admin ? 'Admin' : esc(cur.profiles?.name)}, ${fmtTime(m.created_at)}</small>
          </div>`).join('')
    : '<p class="hint">Pilih percakapan di samping.</p>'

  $('#pmsgs').scrollTop = $('#pmsgs').scrollHeight
}

async function sendPesan(form) {
  const body = form.body.value.trim()
  if (!body || !S.chatSel) return

  const ok = await run(db.from('loan_msgs').insert({
    chat_id: S.chatSel,
    from_admin: S.me.role === 'admin',
    body
  }))

  if (ok) {
    form.reset()
    S.draft = ''
    await loadPesan()
  }
}

async function endPesan(id) {
  if (!confirm('Akhiri percakapan ini? Setelah diakhiri tidak ada yang bisa mengirim pesan lagi.')) return
  if (await run(db.from('loan_chats').update({ ended: true }).eq('id', id), 'Percakapan diakhiri')) loadPesan()
}

async function hidePesan() {
  if (!confirm('Hapus chat ini dari daftarmu? Pihak lain tetap bisa melihatnya.')) return
  if (await run(db.rpc('hide_loan_chat', { cid: S.chatSel }), 'Chat dihapus dari daftarmu')) loadPesan()
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

  const list = S.all.filter(l =>
    (l.code + ' ' + l.profiles?.name + ' ' + l.books?.title).toLowerCase().includes(keyword)
  )

  if (!list.length) {
    $('#rows').innerHTML = '<tr><td colspan="6">Belum ada data.</td></tr>'
    return
  }

  $('#rows').innerHTML = list.map(l => `
    <tr>
      <td><b>${l.code}</b></td>
      <td>${esc(l.profiles?.name)}</td>
      <td>${esc(l.books?.title)}</td>
      <td>${l.days} hari</td>
      <td>
        <span class="chip s-${l.status}">${l.status}</span>
        ${l.cancel_reason ? `<br><small class="hint">Alasan: ${esc(l.cancel_reason)}</small>` : ''}
        ${isLate(l) ? '<b class="late">terlambat</b>' : ''}
      </td>
      <td>${actions[l.status]?.(l.id) || '-'}</td>
    </tr>`).join('')
}


/* ---------- 8. CHAT CS (jendela kecil di pojok kanan bawah) ---------- */
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

  $('#cf').hidden = ended
  $('#cend').hidden = !list.length || ended
  $('#cnew').hidden = !ended
  $('#cnew button').hidden = isAdmin

  if (!list.length) {
    box.innerHTML = `<p class="hint">${isAdmin ? 'Belum ada pesan masuk.' : 'Tanyakan apa saja soal buku atau peminjaman. Admin akan membalas di sini.'}</p>`
    return
  }

  box.innerHTML = list.map(m => m.ended
    ? `<div class="sys">${esc(m.body)}</div>`
    : `<div class="msg ${m.from_admin === isAdmin ? 'me' : ''}">
        ${m.image ? `<a href="${esc(m.image)}" target="_blank" rel="noopener"><img src="${esc(m.image)}" alt="Gambar kiriman"></a>` : ''}
        ${esc(m.body)}
        <small>${m.from_admin ? 'Admin' : esc(m.profiles?.name)}, ${fmtTime(m.created_at)}</small>
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
    actions = `
      <select id="days" aria-label="Lama pinjam">
        <option value="3">3 hari</option>
        <option value="7" selected>7 hari</option>
        <option value="14">14 hari</option>
        <option value="custom">Custom</option>
      </select>
      <input id="custom" type="number" min="1" max="28" placeholder="1-28 hari" hidden>
      <button class="btn" data-book="${b.id}" ${canBook ? '' : 'disabled'}>Booking buku</button>`
  }

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
    <p style="margin-top:.6rem">${esc(b.description) || 'Belum ada deskripsi.'}</p>
    <p class="${b.stock ? 'ok' : 'no'}" style="margin-top:.6rem"><b>${b.stock ? 'Stok tersedia: ' + b.stock : 'Stok habis'}</b></p>
    <div class="act">${actions}</div>
    <p class="hint" style="margin-top:.6rem">${note}</p>`)
}

function readDays() {
  const value = $('#days').value
  if (value !== 'custom') return +value

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

  $('#bprev').innerHTML = `
    <p class="hint">Pratinjau (seperti tampilan di katalog)</p>
    <div class="prev-row">
      <article class="card prev-card">
        <div class="cover">📖${cover ? `<img src="${esc(cover)}" alt="" onerror="this.remove()">` : ''}</div>
        <div class="ci">
          <h3>${esc(f.title.value) || 'Judul buku'}</h3>
          <p>${esc(f.author.value) || 'Penulis'}</p>
          <em class="${stock > 0 ? 'ok' : 'no'}">${stock > 0 ? 'Stok ' + stock : 'Stok habis'}</em>
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
  modal(`
    <h2>${isRegister ? 'Daftar akun' : 'Masuk'}</h2>
    <form id="af" data-reg="${isRegister}">
      ${isRegister ? `<input name="name" placeholder="Nama lengkap" required>
      <input name="phone" type="tel" placeholder="Nomor HP (08xxxxxxxxxx)" required pattern="([+]62|62|0)8[0-9]{8,12}" title="Contoh: 081234567890">` : ''}
      <input name="email" type="email" placeholder="Email" required>
      <input name="password" type="password" minlength="6" placeholder="Kata sandi (min. 6 karakter)" required>
      <button class="btn">${isRegister ? 'Daftar' : 'Masuk'}</button>
    </form>
    <p class="hint">
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
        <small>${esc(a.email)} · ${a.role === 'admin' ? 'admin' : 'user'}</small>
      </div>
      ${a.id === S.me?.id ? '<span class="chip">aktif</span>' : ''}
      <button class="forget" data-forget="${a.id}" title="Hapus dari perangkat ini">✕</button>
    </div>`).join('')

  modal(`
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
  if (!currentThread() || !confirm('Akhiri percakapan ini?')) return

  const isAdmin = S.me.role === 'admin'

  const ok = await run(db.from('messages').insert({
    user_id: currentThread(),
    sender_id: S.me.id,
    from_admin: isAdmin,
    ended: true,
    body: 'Percakapan diakhiri oleh ' + (isAdmin ? 'admin' : 'pengguna')
  }))

  if (ok) await loadChat()
}


/* ---------- 10. EVENT ---------- */
document.addEventListener('click', async e => {
  const find = key => e.target.closest(`[data-${key}]`)
  let el

  // tutup modal
  if (e.target.id === 'modal' || find('close')) return closeModal()

  // pindah halaman
  if (el = find('v')) {
    S.view = el.dataset.v
    render(true)
    if (S.view === 'pesan') loadPesan(true)
    return
  }

  // buka detail buku
  if (el = find('card')) return openBook(el.dataset.card)

  // login / daftar / keluar
  if (el = find('auth')) {
    e.preventDefault()
    return authForm(+el.dataset.auth)
  }
  if (find('out')) return forgetAccount(S.me?.id)

  // chat, tema, akun
  if (find('chat')) return setChat(!S.chatOpen)
  if (el = find('themebtn')) return cycleTheme(el)
  if (find('accounts')) return openAccounts()
  if (el = find('forget')) return forgetAccount(el.dataset.forget)
  if (el = find('switch')) return switchAccount(el.dataset.switch)

  // admin: kelola buku
  if (find('add')) return bookForm()

  if (el = find('edit')) {
    const { data } = await db.from('books').select('*').eq('id', el.dataset.edit).single()
    return bookForm(data)
  }

  if (el = find('del')) {
    if (!confirm('Hapus buku ini beserta riwayat peminjamannya?')) return
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

    if (await run(db.from('loans').update(patch).eq('id', id), 'Status diperbarui')) loadData()
    return
  }
})

document.addEventListener('input', e => {
  if (e.target.id === 'q') {
    S.q = e.target.value
    drawGrid()
  } else if (e.target.id === 'cat') {
    S.cat = e.target.value
    drawGrid()
  } else if (e.target.id === 'pbody') {
    S.draft = e.target.value
  } else if (e.target.id === 'f') {
    S.f = e.target.value
    drawRows()
  }

  if (e.target.closest('#bf')) drawPreview()
})

document.addEventListener('change', e => {
  if (['multi_book', 'multi_rent'].includes(e.target.id)) {
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

  // login / daftar
  if (form.id === 'af') {
    const isRegister = form.dataset.reg === '1'

    const result = isRegister
      ? await db.auth.signUp({ email: data.email, password: data.password, options: { data: { name: data.name, phone: data.phone } } })
      : await db.auth.signInWithPassword({ email: data.email, password: data.password })

    if (result.error) return toast(friendlyError(result.error), true)

    closeModal()
    toast(isRegister && !result.data.session ? 'Cek emailmu untuk verifikasi akun, lalu masuk' : 'Selamat datang!')
    return
  }

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
db.auth.onAuthStateChange((event, session) => {
  // setTimeout: supabase-js melarang query langsung di dalam callback ini
  setTimeout(async () => {
    // akun yang sama (token diperbarui): cukup simpan token terbaru
    if (session && S.me && session.user.id === S.me.id) {
      saveAccount(session, S.me)
      return
    }

    // ganti akun / login / logout: kosongkan data akun sebelumnya
    S.me = null
    S.mine = []
    S.all = []
    S.msgs = []
    S.thread = null
    S.chats = []
    S.cmsgs = []
    S.chatSel = null

    if (session) {
      const { data } = await db.from('profiles').select('*').eq('id', session.user.id).single()
      S.me = data
      if (S.me) saveAccount(session, S.me)
    }

    if (!S.me && S.view !== 'katalog') S.view = 'katalog'
    if (['admin', 'pengaturan'].includes(S.view) && S.me?.role !== 'admin') S.view = 'katalog'
    if (S.view === 'saya' && S.me?.role === 'admin') S.view = 'katalog'

    setChat(false)
    $('#main').innerHTML = SPINNER
    await loadData(true)
    await loadChat()
    await loadPesan()

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