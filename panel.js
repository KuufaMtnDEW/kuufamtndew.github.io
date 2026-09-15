(() => {

/* =========================================================
   KUUFA Panel — логика (Supabase: Auth + Postgres + Storage)
   + оконный менеджер в стиле Windows 7 (перетаскивание окон,
   таскбар, меню "Пуск", сворачивание/разворачивание)
   -----------------------------------------------------------
   ЧТО ЗАПОЛНИТЬ ПЕРЕД ЗАПУСКОМ (см. инструкцию в чате):
   1) SUPABASE_URL       — из настроек проекта (Project Settings → API)
   2) SUPABASE_ANON_KEY   — оттуда же, "anon public" ключ
   3) ALLOWED_EMAIL       — твоя почта, единственная с доступом
   ========================================================= */

const SUPABASE_URL = "https://agmwcsymvvvaqrtqhbhk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QXzmOiorH-MmL5l4Kyu5nQ_brDwZj0j";

const ALLOWED_EMAIL = "baditv200@gmail.com"; // поменяй, если нужна другая почта
const FILES_BUCKET = "files";               // имя бакета в Storage

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- DOM refs ----------
const loginScreen   = document.getElementById('login-screen');
const deniedScreen  = document.getElementById('denied-screen');
const appEl         = document.getElementById('app');
const loginBtn      = document.getElementById('google-signin-btn');
const loginError    = document.getElementById('login-error');
const deniedSignout = document.getElementById('denied-signout-btn');
const signoutBtn    = document.getElementById('signout-btn');
const startSignoutBtn = document.getElementById('start-signout-btn');

let currentUser = null;
let realtimeChannels = [];

function showScreen(which){
  loginScreen.hidden  = which !== 'login';
  deniedScreen.hidden = which !== 'denied';
  appEl.hidden        = which !== 'app';
}

// ---------- auth ----------
loginBtn.addEventListener('click', async () => {
  loginError.hidden = true;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://kuufamtndew.github.io/panel.html' }
  });
  if (error) {
    console.error(error);
    loginError.textContent = 'Не получилось войти: ' + error.message;
    loginError.hidden = false;
  }
});

deniedSignout.addEventListener('click', () => supabase.auth.signOut());
signoutBtn.addEventListener('click', () => supabase.auth.signOut());
startSignoutBtn.addEventListener('click', () => supabase.auth.signOut());

async function handleSession(session){
  realtimeChannels.forEach(ch => supabase.removeChannel(ch));
  realtimeChannels = [];

  const user = session?.user || null;

  if (!user) {
    currentUser = null;
    showScreen('login');
    return;
  }

  if (user.email !== ALLOWED_EMAIL) {
    currentUser = null;
    showScreen('denied');
    return;
  }

  currentUser = user;
  const meta = user.user_metadata || {};
  document.getElementById('user-avatar').src = meta.avatar_url || '';
  document.getElementById('user-name').textContent = meta.full_name || meta.name || 'Без имени';
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('settings-email').textContent = user.email;

  showScreen('app');
  initTasks();
  initNotes();
  initFiles();
  initWindowManager();
}

supabase.auth.getSession().then(({ data }) => handleSession(data.session));
supabase.auth.onAuthStateChange((_event, session) => handleSession(session));

// ---------- helpers ----------
function fmtDate(iso){
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' });
}

async function refetchAndRender(table, orderCol, render){
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', currentUser.id)
    .order(orderCol, { ascending: false });
  if (error) { console.error(table, error); return; }
  render(data || []);
}

function subscribeTable(table, onChange){
  const channel = supabase
    .channel(`${table}-${currentUser.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${currentUser.id}` }, onChange)
    .subscribe();
  realtimeChannels.push(channel);
}

// ---------- Задачи ----------
function initTasks(){
  const form = document.getElementById('task-form');
  const input = document.getElementById('task-input');
  const list = document.getElementById('task-list');

  function render(rows){
    list.innerHTML = '';
    if (rows.length === 0){
      list.innerHTML = '<li class="item-list__empty">Задач пока нет</li>';
    }
    let openCount = 0, doneCount = 0;
    rows.forEach(t => {
      if (t.done) doneCount++; else openCount++;
      const li = document.createElement('li');
      li.className = 'item-list__item' + (t.done ? ' is-done' : '');
      li.innerHTML = `
        <input type="checkbox" ${t.done ? 'checked' : ''}>
        <span class="item-list__text"></span>
        <button class="item-list__del" title="Удалить">✕</button>
      `;
      li.querySelector('.item-list__text').textContent = t.text;
      li.querySelector('input').addEventListener('change', async (e) => {
        await supabase.from('tasks').update({ done: e.target.checked }).eq('id', t.id);
        refetchAndRender('tasks', 'created_at', render);
      });
      li.querySelector('.item-list__del').addEventListener('click', async () => {
        await supabase.from('tasks').delete().eq('id', t.id);
        refetchAndRender('tasks', 'created_at', render);
      });
      list.appendChild(li);
    });
    document.getElementById('stat-tasks-open').textContent = openCount;
    document.getElementById('stat-tasks-done').textContent = doneCount;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await supabase.from('tasks').insert({ text, done: false, user_id: currentUser.id });
    refetchAndRender('tasks', 'created_at', render);
  };

  subscribeTable('tasks', () => refetchAndRender('tasks', 'created_at', render));
  refetchAndRender('tasks', 'created_at', render);
}

// ---------- Заметки ----------
function initNotes(){
  const form = document.getElementById('note-form');
  const input = document.getElementById('note-input');
  const grid = document.getElementById('note-list');

  function render(rows){
    grid.innerHTML = '';
    if (rows.length === 0){
      grid.innerHTML = '<p class="item-list__empty">Заметок пока нет</p>';
    }
    rows.forEach(n => {
      const card = document.createElement('div');
      card.className = 'note-card';
      card.innerHTML = `
        <span class="note-card__date"></span>
        <span class="note-card__text"></span>
        <button class="note-card__del" title="Удалить">Удалить</button>
      `;
      card.querySelector('.note-card__date').textContent = fmtDate(n.created_at);
      card.querySelector('.note-card__text').textContent = n.text;
      card.querySelector('.note-card__del').addEventListener('click', async () => {
        await supabase.from('notes').delete().eq('id', n.id);
        refetchAndRender('notes', 'created_at', render);
      });
      grid.appendChild(card);
    });
    document.getElementById('stat-notes').textContent = rows.length;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await supabase.from('notes').insert({ text, user_id: currentUser.id });
    refetchAndRender('notes', 'created_at', render);
  };

  subscribeTable('notes', () => refetchAndRender('notes', 'created_at', render));
  refetchAndRender('notes', 'created_at', render);
}

// ---------- Файлы (Supabase Storage) ----------
function initFiles(){
  const form = document.getElementById('file-form');
  const input = document.getElementById('file-input');
  const status = document.getElementById('file-upload-status');
  const list = document.getElementById('file-list');
  const folder = currentUser.id;

  function fmtSize(bytes){
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
  }

  async function render(){
    const { data, error } = await supabase.storage.from(FILES_BUCKET).list(folder, {
      sortBy: { column: 'created_at', order: 'desc' }
    });
    if (error) { console.error('files list', error); return; }

    list.innerHTML = '';
    if (!data || data.length === 0){
      list.innerHTML = '<li class="item-list__empty">Файлов пока нет</li>';
      document.getElementById('stat-files').textContent = 0;
      return;
    }

    data.forEach(f => {
      const li = document.createElement('li');
      li.className = 'item-list__item';
      li.innerHTML = `
        <span class="item-list__text"></span>
        <span style="color:var(--muted); font-size:12px;"></span>
        <button class="item-list__del" data-action="download" title="Скачать">↓</button>
        <button class="item-list__del" data-action="delete" title="Удалить">✕</button>
      `;
      const spans = li.querySelectorAll('span');
      spans[0].textContent = f.name;
      spans[1].textContent = fmtSize(f.metadata?.size);

      li.querySelector('[data-action="download"]').addEventListener('click', async () => {
        const { data: signed, error: signErr } = await supabase.storage
          .from(FILES_BUCKET)
          .createSignedUrl(`${folder}/${f.name}`, 60);
        if (signErr) { console.error(signErr); return; }
        window.open(signed.signedUrl, '_blank');
      });
      li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        await supabase.storage.from(FILES_BUCKET).remove([`${folder}/${f.name}`]);
        render();
      });
      list.appendChild(li);
    });
    document.getElementById('stat-files').textContent = data.length;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const file = input.files[0];
    if (!file) return;
    status.hidden = false;
    status.textContent = 'Загрузка…';
    const { error } = await supabase.storage
      .from(FILES_BUCKET)
      .upload(`${folder}/${file.name}`, file, { upsert: true });
    input.value = '';
    if (error) {
      status.textContent = 'Ошибка загрузки: ' + error.message;
    } else {
      status.hidden = true;
      render();
    }
  };

  render();
}

// =========================================================
// Оконный менеджер (в стиле Windows 7)
// =========================================================
let windowManagerReady = false;

const WINDOW_TITLES = {
  dashboard: 'Дашборд',
  tasks: 'Задачи',
  notes: 'Заметки',
  files: 'Файлы',
  settings: 'Настройки'
};

function initWindowManager(){
  if (windowManagerReady) { openWindow('dashboard'); return; }
  windowManagerReady = true;

  const desktop = document.getElementById('desktop');
  const windows = Array.from(document.querySelectorAll('.window'));
  const taskbarTasks = document.getElementById('taskbar-tasks');
  const startBtn = document.getElementById('start-btn');
  const startMenu = document.getElementById('start-menu');
  const clockEl = document.getElementById('taskbar-clock');

  let zTop = 10;
  const state = {}; // name -> { open, minimized, maximized, taskbarBtn, prevRect }

  windows.forEach(win => {
    const name = win.dataset.window;
    state[name] = { open: !win.hidden, minimized: false, maximized: false, taskbarBtn: null, prevRect: null };

    // focus on any interaction with the window
    win.addEventListener('mousedown', () => focusWindow(name));

    // title bar dragging
    const handle = win.querySelector('[data-drag-handle]');
    handle.addEventListener('mousedown', (e) => startDrag(e, win, name));
    handle.addEventListener('touchstart', (e) => startDrag(e.touches[0], win, name, e), { passive: false });

    // controls
    win.querySelector('[data-action="min"]').addEventListener('click', (e) => { e.stopPropagation(); minimizeWindow(name); });
    win.querySelector('[data-action="max"]').addEventListener('click', (e) => { e.stopPropagation(); toggleMaximize(name); });
    win.querySelector('[data-action="close"]').addEventListener('click', (e) => { e.stopPropagation(); closeWindow(name); });
    handle.addEventListener('dblclick', () => toggleMaximize(name));

    if (!win.hidden) {
      createTaskbarButton(name);
      focusWindow(name);
    }
  });

  function getWindow(name){ return windows.find(w => w.dataset.window === name); }

  function createTaskbarButton(name){
    if (state[name].taskbarBtn) return;
    const btn = document.createElement('button');
    btn.className = 'taskbar__task';
    btn.innerHTML = `<span class="taskbar__task-label">${WINDOW_TITLES[name] || name}</span>`;
    btn.addEventListener('click', () => {
      const s = state[name];
      const win = getWindow(name);
      const isFront = win.style.zIndex == zTop && !s.minimized;
      if (s.minimized) {
        s.minimized = false;
        win.hidden = false;
        focusWindow(name);
      } else if (isFront) {
        minimizeWindow(name);
      } else {
        focusWindow(name);
      }
    });
    taskbarTasks.appendChild(btn);
    state[name].taskbarBtn = btn;
  }

  window.openWindow = function openWindow(name){
    const win = getWindow(name);
    if (!win) return;
    const s = state[name];
    s.open = true;
    s.minimized = false;
    win.hidden = false;
    createTaskbarButton(name);
    focusWindow(name);
  };

  function closeWindow(name){
    const win = getWindow(name);
    const s = state[name];
    win.hidden = true;
    s.open = false;
    s.minimized = false;
    if (s.taskbarBtn) { s.taskbarBtn.remove(); s.taskbarBtn = null; }
  }

  function minimizeWindow(name){
    const win = getWindow(name);
    const s = state[name];
    s.minimized = true;
    win.hidden = true;
    if (s.taskbarBtn) s.taskbarBtn.classList.remove('is-active');
  }

  function toggleMaximize(name){
    const win = getWindow(name);
    const s = state[name];
    if (s.maximized) {
      win.classList.remove('is-maximized');
      if (s.prevRect) {
        win.style.top = s.prevRect.top;
        win.style.left = s.prevRect.left;
        win.style.width = s.prevRect.width;
        win.style.height = s.prevRect.height;
      }
      s.maximized = false;
    } else {
      s.prevRect = {
        top: win.style.top, left: win.style.left,
        width: win.style.width, height: win.style.height
      };
      win.classList.add('is-maximized');
      s.maximized = true;
    }
    focusWindow(name);
  }

  function focusWindow(name){
    const win = getWindow(name);
    if (!win || win.hidden) return;
    zTop += 1;
    win.style.zIndex = zTop;
    windows.forEach(w => w.classList.remove('is-active'));
    win.classList.add('is-active');
    Object.entries(state).forEach(([n, s]) => {
      if (s.taskbarBtn) s.taskbarBtn.classList.toggle('is-active', n === name && !s.minimized);
    });
  }

  function startDrag(startEvent, win, name, originalEvent){
    if (win.classList.contains('is-maximized')) return;
    if (originalEvent) originalEvent.preventDefault();
    focusWindow(name);

    const desktopRect = desktop.getBoundingClientRect();
    const winRect = win.getBoundingClientRect();
    const offsetX = startEvent.clientX - winRect.left;
    const offsetY = startEvent.clientY - winRect.top;

    function onMove(e){
      const point = e.touches ? e.touches[0] : e;
      let newLeft = point.clientX - desktopRect.left - offsetX;
      let newTop = point.clientY - desktopRect.top - offsetY;
      newLeft = Math.max(-winRect.width + 80, Math.min(newLeft, desktopRect.width - 40));
      newTop = Math.max(0, Math.min(newTop, desktopRect.height - 32));
      win.style.left = newLeft + 'px';
      win.style.top = newTop + 'px';
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  // ---------- desktop icons + start menu apps open windows ----------
  document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.openWindow(btn.dataset.open);
      closeStartMenu();
    });
  });

  // ---------- start menu toggle ----------
  function openStartMenu(){ startMenu.hidden = false; startBtn.setAttribute('aria-expanded', 'true'); }
  function closeStartMenu(){ startMenu.hidden = true; startBtn.setAttribute('aria-expanded', 'false'); }
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startMenu.hidden ? openStartMenu() : closeStartMenu();
  });
  document.addEventListener('click', (e) => {
    if (!startMenu.hidden && !startMenu.contains(e.target) && e.target !== startBtn) closeStartMenu();
  });

  // ---------- clock ----------
  function tickClock(){
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  tickClock();
  setInterval(tickClock, 15000);

  // open dashboard by default
  openWindow('dashboard');
}

})();