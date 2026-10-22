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
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan'
}

const COOLDOWN_CHAT = 5000


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
  chatOpen: false
}


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

async function run(promise, successMessage) {
  const { error } = await promise
  if (error) {
    toast(error.message, true)
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
async function loadData() {
  const books = await db.from('books').select('*').order('created_at', { ascending: false })
  S.books = books.data || []

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

  render()
}

async function loadChat() {
  if (!S.me) return

  const { data } = await db.from('messages')
    .select('*,profiles(name)')
    .order('created_at')
  S.msgs = data || []

  if (S.chatOpen) drawChat()
}


/* ---------- 7. TAMPILAN ---------- */
function render() {
  const me = S.me
  const isAdmin = me?.role === 'admin'

  const menu = [['katalog', 'Katalog']]
  if (me) menu.push(['saya', 'Pinjaman saya'])
  if (isAdmin) menu.push(['admin', 'Kelola peminjaman'])

  $('#nav').innerHTML = menu
    .map(([key, label]) => `<button class="${S.view === key ? 'on' : ''}" data-v="${key}">${label}</button>`)
    .join('')

  $('#auth').innerHTML = me
    ? `<button class="who" data-accounts title="Akun di perangkat ini">
         <span class="ava">${esc(me.name[0] || '?').toUpperCase()}</span>
         ${esc(me.name)}${isAdmin ? ' <b class="chip">admin</b>' : ''}
       </button>`
    : `<button class="btn" data-accounts>Masuk / Daftar</button>`

  const views = { katalog: viewKatalog, saya: viewSaya, admin: viewAdmin }
  $('#main').innerHTML = (views[S.view] || viewKatalog)()

  if (S.view === 'katalog') drawGrid()
  if (S.view === 'admin') drawRows()

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

function drawRows() {
  const keyword = S.f.toLowerCase()

  const button = (action, id, label, extra = '') =>
    `<button class="btn sm ${extra}" data-act="${action}" data-lid="${id}">${label}</button>`

  const actions = {
    booking: id => button('approved', id, 'Setujui') + button('ditolak', id, 'Tolak', 'danger'),
    approved: id => button('dipinjam', id, 'Buku diambil'),
    dipinjam: id => button('dikembalikan', id, 'Dikembalikan')
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

  $('#ctitle').textContent = isAdmin ? 'Customer Message(s)' : 'Customer Service'
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

  if (!list.length) {
    box.innerHTML = `<p class="hint">${isAdmin ? 'Belum ada pesan masuk.' : 'Tanyakan apa saja soal buku atau peminjaman. Admin akan membalas di sini.'}</p>`
    return
  }

  box.innerHTML = list.map(m => `
    <div class="msg ${m.from_admin === isAdmin ? 'me' : ''}">
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
    const upload = await db.storage.from('chat').upload(path, file)
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

async function openBook(id) {
  // lihat buku berdasarkan ID
  const { data: b, error } = await db.from('books').select('*').eq('id', id).single()
  if (error) return toast('Buku tidak ditemukan', true)

  history.replaceState(null, '', '#buku=' + id)

  const images = [b.cover, ...(b.slides || [])].filter(Boolean)
  const me = S.me
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
      <button class="btn" data-book="${b.id}" ${b.stock ? '' : 'disabled'}>Booking buku</button>`
  }

  modal(`
    <div class="slider">
      ${images.map(u => `<img src="${esc(u)}" alt="">`).join('') || '<div class="noimg">📖</div>'}
    </div>
    ${images.length > 1 ? '<p class="hint">Geser gambar untuk melihat lainnya</p>' : ''}
    <h2>${esc(b.title)}</h2>
    <p class="hint">${esc(b.author)} · ${esc(b.category)} · ID ${b.id}</p>
    <p style="margin-top:.6rem">${esc(b.description) || 'Belum ada deskripsi.'}</p>
    <p class="${b.stock ? 'ok' : 'no'}" style="margin-top:.6rem"><b>${b.stock ? 'Stok tersedia: ' + b.stock : 'Stok habis'}</b></p>
    <div class="act">${actions}</div>`)
}

function readDays() {
  const value = $('#days').value
  if (value !== 'custom') return +value

  const n = parseInt($('#custom').value, 10)
  return n >= 1 && n <= 28 ? n : null
}

function bookForm(b = {}) {
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
      <textarea name="slides" placeholder="URL gambar slide, satu per baris">${esc((b.slides || []).join('\n'))}</textarea>
      <textarea name="description" placeholder="Deskripsi">${esc(b.description)}</textarea>
      <button class="btn">Simpan buku</button>
    </form>`)
}

function authForm(isRegister) {
  modal(`
    <h2>${isRegister ? 'Daftar akun' : 'Masuk'}</h2>
    <form id="af" data-reg="${isRegister}">
      ${isRegister ? '<input name="name" placeholder="Nama lengkap" required>' : ''}
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


/* ---------- 10. EVENT ---------- */
document.addEventListener('click', async e => {
  const find = key => e.target.closest(`[data-${key}]`)
  let el

  // tutup modal
  if (e.target.id === 'modal' || find('close')) return closeModal()

  // pindah halaman
  if (el = find('v')) {
    S.view = el.dataset.v
    render()
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

  if (el = find('cancel')) {
    const ok = await run(
      db.from('loans').update({ status: 'dibatalkan' }).eq('id', el.dataset.cancel),
      'Booking dibatalkan'
    )
    if (ok) loadData()
    return
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
  } else if (e.target.id === 'f') {
    S.f = e.target.value
    drawRows()
  }
})

document.addEventListener('change', e => {
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

  // login / daftar
  if (form.id === 'af') {
    const isRegister = form.dataset.reg === '1'

    const result = isRegister
      ? await db.auth.signUp({ email: data.email, password: data.password, options: { data: { name: data.name } } })
      : await db.auth.signInWithPassword({ email: data.email, password: data.password })

    if (result.error) return toast(result.error.message, true)

    closeModal()
    toast(isRegister && !result.data.session ? 'Cek email untuk konfirmasi akun' : 'Selamat datang!')
    return
  }

  // simpan buku
  if (form.id === 'bf') {
    const row = {
      title: data.title,
      author: data.author,
      category: data.category,
      stock: +data.stock,
      cover: data.cover || null,
      description: data.description,
      slides: data.slides.split('\n').map(s => s.trim()).filter(Boolean)
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

    if (session) {
      const { data } = await db.from('profiles').select('*').eq('id', session.user.id).single()
      S.me = data
      if (S.me) saveAccount(session, S.me)
    }

    if (!S.me && S.view !== 'katalog') S.view = 'katalog'
    if (S.view === 'admin' && S.me?.role !== 'admin') S.view = 'katalog'

    setChat(false)
    await loadData()
    await loadChat()

    if (location.hash.startsWith('#buku=') && !$('#modal').classList.contains('open')) {
      openBook(location.hash.slice(6))
    }
  }, 0)
})

// realtime: perubahan di database langsung tampil tanpa refresh
const timers = {}

db.channel('live')
  .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
    clearTimeout(timers[payload.table])
    timers[payload.table] = setTimeout(
      () => (payload.table === 'messages' ? loadChat() : loadData()),
      300
    )
  })
  .subscribe()
