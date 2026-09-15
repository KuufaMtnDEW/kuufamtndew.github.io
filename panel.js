(() => {
	
/* =========================================================
   KUUFA Panel — логика (Supabase: Auth + Postgres + Storage)
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

async function handleSession(session){
  realtimeChannels.forEach(ch => supabase.removeChannel(ch));
  realtimeChannels = [];

  const user = session?.user || null;
  console.log('SESSION:', session);
  console.log('USER:', user);

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
  initSeo();
  initFiles();
}

supabase.auth.getSession().then(({ data }) => handleSession(data.session));
supabase.auth.onAuthStateChange((_event, session) => handleSession(session));

// ---------- sidebar navigation ----------
document.querySelectorAll('.sidebar__item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar__item').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const view = btn.dataset.view;
    document.querySelectorAll('.view').forEach(sec => {
      sec.hidden = sec.dataset.view !== view;
    });
  });
});

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

// ---------- SEO-отчёты ----------
function initSeo(){
  const form = document.getElementById('seo-form');
  const projectInput = document.getElementById('seo-project');
  const metricInput = document.getElementById('seo-metric');
  const valueInput = document.getElementById('seo-value');
  const tbody = document.getElementById('seo-table-body');

  function render(rows){
    tbody.innerHTML = '';
    if (rows.length === 0){
      tbody.innerHTML = '<tr class="data-table__empty"><td colspan="5">Записей пока нет</td></tr>';
    }
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td></td><td></td><td></td><td></td>
        <td><button class="data-table__del" title="Удалить">✕</button></td>
      `;
      const cells = tr.querySelectorAll('td');
      cells[0].textContent = fmtDate(r.created_at);
      cells[1].textContent = r.project;
      cells[2].textContent = r.metric;
      cells[3].textContent = r.value;
      tr.querySelector('.data-table__del').addEventListener('click', async () => {
        await supabase.from('seo_reports').delete().eq('id', r.id);
        refetchAndRender('seo_reports', 'created_at', render);
      });
      tbody.appendChild(tr);
    });
    document.getElementById('stat-seo').textContent = rows.length;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const project = projectInput.value.trim();
    const metric = metricInput.value.trim();
    const value = valueInput.value.trim();
    if (!project || !metric || !value) return;
    projectInput.value = ''; metricInput.value = ''; valueInput.value = '';
    await supabase.from('seo_reports').insert({ project, metric, value, user_id: currentUser.id });
    refetchAndRender('seo_reports', 'created_at', render);
  };

  subscribeTable('seo_reports', () => refetchAndRender('seo_reports', 'created_at', render));
  refetchAndRender('seo_reports', 'created_at', render);
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

})();