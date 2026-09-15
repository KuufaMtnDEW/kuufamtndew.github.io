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

// ---------- Файлы: проводник (Supabase Storage) ----------
let filesInited = false;

function initFiles(){
  if (filesInited) { FM.reload(); return; }
  filesInited = true;
  FM.mount();
}

const FM = (() => {
  const PLACEHOLDER = '.keep';
  const IMAGE_EXT = ['jpg','jpeg','png','gif','webp','avif','svg','bmp','ico'];
  const TEXT_EXT  = ['txt','md','csv','json','log','js','ts','css','html','xml','yml','yaml','sql','py','sh','ini','env','srt'];
  const VIDEO_EXT = ['mp4','webm','mov','m4v'];
  const AUDIO_EXT = ['mp3','wav','ogg','m4a','flac'];

  let path = [];          // текущий путь внутри личной папки
  let entries = [];       // содержимое текущей папки
  let viewMode = localStorage.getItem('kuufa-fm-view') || 'grid';
  let sortMode = 'new';
  let query = '';
  let previewList = [];   // файлы, которые можно листать стрелками
  let previewIndex = -1;

  const el = {};

  function root(){ return currentUser.id; }
  function fullPath(){ return [root(), ...path].join('/'); }
  function ext(name){
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(i + 1).toLowerCase() : '';
  }
  function kind(name){
    const e = ext(name);
    if (IMAGE_EXT.includes(e)) return 'image';
    if (TEXT_EXT.includes(e))  return 'text';
    if (VIDEO_EXT.includes(e)) return 'video';
    if (AUDIO_EXT.includes(e)) return 'audio';
    if (e === 'pdf') return 'pdf';
    return 'other';
  }
  function fmtSize(bytes){
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' ГБ';
  }
  function safeName(name){ return name.replace(/[\\/]/g, '-').trim(); }

  function status(text, isError){
    if (!text) { el.status.hidden = true; return; }
    el.status.hidden = false;
    el.status.textContent = text;
    el.status.classList.toggle('is-error', !!isError);
  }

  // ---------- Storage ----------
  async function listDir(dir){
    const { data, error } = await supabase.storage.from(FILES_BUCKET).list(dir, {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'desc' }
    });
    if (error) throw error;
    return (data || []).filter(x => x.name !== PLACEHOLDER && x.name !== '.emptyFolderPlaceholder');
  }

  // рекурсивный обход — нужен для удаления и переименования папок
  async function collectFiles(dir){
    const { data, error } = await supabase.storage.from(FILES_BUCKET).list(dir, { limit: 1000 });
    if (error) throw error;
    let out = [];
    for (const item of (data || [])){
      const p = `${dir}/${item.name}`;
      if (item.id === null) out = out.concat(await collectFiles(p));
      else out.push(p);
    }
    return out;
  }

  async function signed(name, seconds = 3600){
    const { data, error } = await supabase.storage
      .from(FILES_BUCKET)
      .createSignedUrl(`${fullPath()}/${name}`, seconds);
    if (error) throw error;
    return data.signedUrl;
  }

  // ---------- рендер ----------
  function renderCrumbs(){
    el.crumbs.innerHTML = '';
    const parts = [{ label: 'Мои файлы', index: -1 }, ...path.map((p, i) => ({ label: p, index: i }))];
    parts.forEach((p, i) => {
      if (i > 0){
        const sep = document.createElement('span');
        sep.className = 'fm__crumb-sep';
        sep.textContent = '/';
        el.crumbs.appendChild(sep);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fm__crumb' + (i === parts.length - 1 ? ' is-current' : '');
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        path = p.index < 0 ? [] : path.slice(0, p.index + 1);
        resetSearch();
        load();
      });
      el.crumbs.appendChild(btn);
    });
    el.up.disabled = path.length === 0;
    el.up.style.opacity = path.length === 0 ? '.4' : '1';
  }

  function resetSearch(){ query = ''; el.search.value = ''; }

  function sortEntries(list){
    const folders = list.filter(x => x.id === null);
    const files = list.filter(x => x.id !== null);
    const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
    const time = x => new Date(x.created_at || x.updated_at || 0).getTime();

    folders.sort(byName);
    if (sortMode === 'name') files.sort(byName);
    else if (sortMode === 'old') files.sort((a, b) => time(a) - time(b));
    else if (sortMode === 'size') files.sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0));
    else files.sort((a, b) => time(b) - time(a));

    return [...folders, ...files];
  }

  function makeIconBtn(label, title, cls, onClick){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fm__icon-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function renderBody(){
    const list = sortEntries(entries.filter(x => !query || x.name.toLowerCase().includes(query)));
    previewList = list.filter(x => x.id !== null);
    el.body.innerHTML = '';

    if (list.length === 0){
      const empty = document.createElement('div');
      empty.className = 'fm__empty';
      empty.innerHTML = query
        ? '<b>Ничего не нашлось</b>Попробуй другое слово или очисти поиск.'
        : '<b>Папка пустая</b>Перетащи сюда фото или текстовый файл — или нажми «Загрузить».';
      el.body.appendChild(empty);
      updateStat();
      return;
    }

    if (viewMode === 'grid') renderGrid(list); else renderList(list);
    loadThumbs(list);
    updateStat();
  }

  function renderGrid(list){
    const grid = document.createElement('div');
    grid.className = 'fm__grid';

    list.forEach(item => {
      const isFolder = item.id === null;
      const tile = document.createElement('div');
      tile.className = 'fm__tile' + (isFolder ? ' fm__tile--folder' : '');
      tile.tabIndex = 0;
      tile.title = item.name;

      const thumb = document.createElement('div');
      thumb.className = 'fm__thumb';
      thumb.dataset.name = item.name;
      if (isFolder){
        const mark = document.createElement('div');
        mark.className = 'fm__folder-mark';
        thumb.appendChild(mark);
      } else {
        const tag = document.createElement('span');
        tag.className = 'fm__ext';
        tag.textContent = ext(item.name).toUpperCase() || 'ФАЙЛ';
        thumb.appendChild(tag);
      }

      const name = document.createElement('div');
      name.className = 'fm__name';
      name.textContent = item.name;

      const meta = document.createElement('div');
      meta.className = 'fm__meta';
      meta.textContent = isFolder
        ? 'папка'
        : [fmtSize(item.metadata?.size), fmtDate(item.created_at)].filter(Boolean).join(' · ');

      const actions = document.createElement('div');
      actions.className = 'fm__tile-actions';
      if (!isFolder) actions.appendChild(makeIconBtn('↓', 'Скачать', '', () => download(item.name)));
      actions.appendChild(makeIconBtn('✎', 'Переименовать', '', () => rename(item)));
      actions.appendChild(makeIconBtn('✕', 'Удалить', 'fm__icon-btn--danger', () => remove(item)));

      tile.append(thumb, name, meta, actions);
      tile.addEventListener('click', () => open(item));
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(item); }
      });
      grid.appendChild(tile);
    });

    el.body.appendChild(grid);
  }

  function renderList(list){
    const wrap = document.createElement('div');
    wrap.className = 'fm__rows';

    list.forEach(item => {
      const isFolder = item.id === null;
      const row = document.createElement('div');
      row.className = 'fm__row';
      row.tabIndex = 0;

      const ico = document.createElement('div');
      ico.className = 'fm__row-ico';
      ico.dataset.name = item.name;
      ico.textContent = isFolder ? '▣' : (ext(item.name).toUpperCase().slice(0, 3) || '•');

      const nm = document.createElement('div');
      nm.className = 'fm__row-name';
      nm.textContent = item.name;

      const size = document.createElement('div');
      size.className = 'fm__row-meta';
      size.textContent = isFolder ? 'папка' : fmtSize(item.metadata?.size);

      const date = document.createElement('div');
      date.className = 'fm__row-meta';
      date.textContent = isFolder ? '' : fmtDate(item.created_at);

      const acts = document.createElement('div');
      acts.className = 'fm__tile-actions';
      acts.style.position = 'static';
      acts.style.opacity = '1';
      if (!isFolder) acts.appendChild(makeIconBtn('↓', 'Скачать', '', () => download(item.name)));
      acts.appendChild(makeIconBtn('✎', 'Переименовать', '', () => rename(item)));
      acts.appendChild(makeIconBtn('✕', 'Удалить', 'fm__icon-btn--danger', () => remove(item)));

      row.append(ico, nm, size, date, acts);
      row.addEventListener('click', () => open(item));
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(item); });
      wrap.appendChild(row);
    });

    el.body.appendChild(wrap);
  }

  // миниатюры картинок
  async function loadThumbs(list){
    const images = list.filter(x => x.id !== null && kind(x.name) === 'image');
    if (images.length === 0) return;
    const paths = images.map(x => `${fullPath()}/${x.name}`);
    const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrls(paths, 3600);
    if (error) { console.error('thumbs', error); return; }
    data.forEach((row, i) => {
      if (!row.signedUrl) return;
      const name = images[i].name;
      el.body.querySelectorAll(`[data-name="${CSS.escape(name)}"]`).forEach(box => {
        box.innerHTML = '';
        const img = document.createElement('img');
        img.src = row.signedUrl;
        img.alt = name;
        img.loading = 'lazy';
        box.appendChild(img);
      });
    });
  }

  function updateStat(){
    const files = entries.filter(x => x.id !== null);
    const folders = entries.length - files.length;
    const stat = document.getElementById('stat-files');
    if (stat) stat.textContent = files.length;
    const bytes = files.reduce((s, f) => s + (f.metadata?.size || 0), 0);
    el.count.textContent = `${folders} папок · ${files.length} файлов · ${fmtSize(bytes)}`;
  }

  // ---------- действия ----------
  function open(item){
    if (item.id === null){
      path.push(item.name);
      resetSearch();
      load();
      return;
    }
    previewIndex = previewList.findIndex(x => x.name === item.name);
    showViewer(item);
  }

  async function download(name){
    try {
      const url = await signed(name, 60);
      window.open(url, '_blank', 'noopener');
    } catch (e){ status('Не удалось получить ссылку: ' + e.message, true); }
  }

  async function rename(item){
    const next = safeName(prompt('Новое имя', item.name) || '');
    if (!next || next === item.name) return;
    status('Переименовываю…');
    try {
      if (item.id === null){
        const base = `${fullPath()}/${item.name}`;
        const files = await collectFiles(base);
        for (const f of files){
          const rest = f.slice(base.length);
          const { error } = await supabase.storage.from(FILES_BUCKET).move(f, `${fullPath()}/${next}${rest}`);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.storage.from(FILES_BUCKET)
          .move(`${fullPath()}/${item.name}`, `${fullPath()}/${next}`);
        if (error) throw error;
      }
      status('');
      load();
    } catch (e){ status('Переименовать не вышло: ' + e.message, true); }
  }

  async function remove(item){
    const isFolder = item.id === null;
    const ok = confirm(isFolder
      ? `Удалить папку «${item.name}» со всем содержимым?`
      : `Удалить «${item.name}»?`);
    if (!ok) return;
    status('Удаляю…');
    try {
      const targets = isFolder
        ? await collectFiles(`${fullPath()}/${item.name}`)
        : [`${fullPath()}/${item.name}`];
      if (targets.length){
        const { error } = await supabase.storage.from(FILES_BUCKET).remove(targets);
        if (error) throw error;
      }
      status('');
      load();
    } catch (e){ status('Удалить не вышло: ' + e.message, true); }
  }

  async function createFolder(){
    const name = safeName(prompt('Название папки', 'Новая папка') || '');
    if (!name) return;
    status('Создаю папку…');
    try {
      const { error } = await supabase.storage.from(FILES_BUCKET)
        .upload(`${fullPath()}/${name}/${PLACEHOLDER}`, new Blob([''], { type: 'text/plain' }), { upsert: true });
      if (error) throw error;
      status('');
      load();
    } catch (e){ status('Папка не создалась: ' + e.message, true); }
  }

  async function upload(fileList){
    const files = Array.from(fileList || []);
    if (!files.length) return;

    el.progress.hidden = false;
    let done = 0;
    const failed = [];

    for (const file of files){
      status(`Загружаю ${done + 1} из ${files.length}: ${file.name}`);
      const { error } = await supabase.storage.from(FILES_BUCKET)
        .upload(`${fullPath()}/${safeName(file.name)}`, file, { upsert: true, contentType: file.type || undefined });
      if (error) failed.push(`${file.name}: ${error.message}`);
      done++;
      el.progressBar.style.width = Math.round(done / files.length * 100) + '%';
    }

    el.progress.hidden = true;
    el.progressBar.style.width = '0';
    if (failed.length) status('Не загрузилось — ' + failed.join('; '), true);
    else { status('Готово'); setTimeout(() => status(''), 1200); }
    load();
  }

  // ---------- просмотр ----------
  async function showViewer(item){
    el.viewer.hidden = false;
    el.viewerName.textContent = item.name;
    el.viewerMeta.textContent = [fmtSize(item.metadata?.size), fmtDate(item.created_at)].filter(Boolean).join(' · ');
    el.viewerBody.innerHTML = '<span style="color:var(--muted);font-size:13px;">Открываю…</span>';

    const many = previewList.length > 1;
    el.viewerPrev.hidden = !many;
    el.viewerNext.hidden = !many;

    let url;
    try { url = await signed(item.name, 3600); }
    catch (e){ el.viewerBody.textContent = 'Не удалось открыть: ' + e.message; return; }

    el.viewerDownload.onclick = () => window.open(url, '_blank', 'noopener');

    const k = kind(item.name);
    el.viewerBody.innerHTML = '';

    if (k === 'image'){
      const img = document.createElement('img');
      img.src = url; img.alt = item.name;
      el.viewerBody.appendChild(img);
    } else if (k === 'text'){
      const pre = document.createElement('pre');
      pre.className = 'viewer__text';
      pre.textContent = 'Читаю файл…';
      el.viewerBody.appendChild(pre);
      try {
        const res = await fetch(url);
        const text = await res.text();
        pre.textContent = text.length ? text : '(пусто)';
      } catch (e){ pre.textContent = 'Не удалось прочитать файл: ' + e.message; }
    } else if (k === 'video'){
      const v = document.createElement('video');
      v.src = url; v.controls = true;
      el.viewerBody.appendChild(v);
    } else if (k === 'audio'){
      const a = document.createElement('audio');
      a.src = url; a.controls = true;
      el.viewerBody.appendChild(a);
    } else if (k === 'pdf'){
      const f = document.createElement('iframe');
      f.src = url;
      el.viewerBody.appendChild(f);
    } else {
      const p = document.createElement('p');
      p.style.color = 'var(--muted)';
      p.style.fontSize = '13px';
      p.textContent = 'Такой тип файла панель не показывает — нажми ↓, чтобы скачать.';
      el.viewerBody.appendChild(p);
    }
  }

  function step(delta){
    if (previewList.length < 2) return;
    previewIndex = (previewIndex + delta + previewList.length) % previewList.length;
    showViewer(previewList[previewIndex]);
  }

  function closeViewer(){
    el.viewer.hidden = true;
    el.viewerBody.innerHTML = '';
  }

  // ---------- чтение папки ----------
  async function load(){
    renderCrumbs();
    el.body.innerHTML = '<div class="fm__empty">Загружаю…</div>';
    try {
      entries = await listDir(fullPath());
      renderBody();
    } catch (e){
      el.body.innerHTML = '';
      status('Не получилось прочитать хранилище: ' + e.message, true);
    }
  }

  // ---------- монтаж ----------
  function mount(){
    el.win         = document.querySelector('.window[data-window="files"]');
    el.crumbs      = document.getElementById('fm-crumbs');
    el.up          = document.getElementById('fm-up');
    el.body        = document.getElementById('fm-body');
    el.search      = document.getElementById('fm-search');
    el.sort        = document.getElementById('fm-sort');
    el.status      = document.getElementById('fm-status');
    el.count       = document.getElementById('fm-count');
    el.progress    = document.getElementById('fm-progress');
    el.progressBar = document.getElementById('fm-progress-bar');
    el.fileInput   = document.getElementById('fm-file-input');
    el.viewer      = document.getElementById('viewer');
    el.viewerName  = document.getElementById('viewer-name');
    el.viewerMeta  = document.getElementById('viewer-meta');
    el.viewerBody  = document.getElementById('viewer-body');
    el.viewerPrev  = document.getElementById('viewer-prev');
    el.viewerNext  = document.getElementById('viewer-next');
    el.viewerDownload = document.getElementById('viewer-download');

    const gridBtn = document.getElementById('fm-view-grid');
    const listBtn = document.getElementById('fm-view-list');
    function setView(mode){
      viewMode = mode;
      localStorage.setItem('kuufa-fm-view', mode);
      gridBtn.classList.toggle('is-active', mode === 'grid');
      listBtn.classList.toggle('is-active', mode === 'list');
      renderBody();
    }
    gridBtn.addEventListener('click', () => setView('grid'));
    listBtn.addEventListener('click', () => setView('list'));
    setView(viewMode);

    el.up.addEventListener('click', () => {
      if (!path.length) return;
      path.pop();
      resetSearch();
      load();
    });

    el.search.addEventListener('input', () => { query = el.search.value.trim().toLowerCase(); renderBody(); });
    el.sort.addEventListener('change', () => { sortMode = el.sort.value; renderBody(); });

    document.getElementById('fm-new-folder').addEventListener('click', createFolder);
    document.getElementById('fm-upload-btn').addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', () => { upload(el.fileInput.files); el.fileInput.value = ''; });

    // перетаскивание файлов в окно
    let dragDepth = 0;
    el.win.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; el.win.classList.add('is-dropzone'); });
    el.win.addEventListener('dragover', (e) => e.preventDefault());
    el.win.addEventListener('dragleave', () => { if (--dragDepth <= 0){ dragDepth = 0; el.win.classList.remove('is-dropzone'); } });
    el.win.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      el.win.classList.remove('is-dropzone');
      upload(e.dataTransfer.files);
    });

    // просмотр
    document.getElementById('viewer-close').addEventListener('click', closeViewer);
    el.viewer.addEventListener('click', (e) => { if (e.target === el.viewer) closeViewer(); });
    el.viewerPrev.addEventListener('click', () => step(-1));
    el.viewerNext.addEventListener('click', () => step(1));
    document.addEventListener('keydown', (e) => {
      if (el.viewer.hidden) return;
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });

    load();
  }

  return { mount, reload: load };
})();

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