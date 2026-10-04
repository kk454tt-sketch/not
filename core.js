'use strict';

/* =====================================================================
   CORE: Supabase client, state, helpers, router, auth, branding
   ===================================================================== */
const CFG = window.APP_CONFIG || {};
const CONFIGURED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY &&
  !String(CFG.SUPABASE_URL).startsWith('PASTE') && !String(CFG.SUPABASE_ANON_KEY).startsWith('PASTE'));
const sb = CONFIGURED ? supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

const DEFAULT_LOGO = 'assets/default-logo.png';
const DEFAULT_SETTINGS = {
  site_name: 'Bachelor.com', tagline: 'Student portal', logo_url: null,
  hero_title: 'Everything you need for your campus journey.',
  hero_subtitle: 'Enroll, read notices, fill forms and find classmates in one place.',
  academic_term: '', footer_text: '',
  departments: [], years: [], hobbies: [], looking_for: [], enroll_fields: []
};

const S = { settings: { ...DEFAULT_SETTINGS }, session: null, isAdmin: false };
const Routes = {};          // path -> async render function (filled by public.js / admin.js)
const actions = {};         // data-action name -> handler(el, event)

/* ---------- tiny helpers ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<span class="material-symbols-outlined ${cls}" aria-hidden="true">${name}</span>`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const errMsg = (e) => (e && (e.message || e.error_description)) ? (e.message || e.error_description) : String(e);
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const igHandle = (v) => String(v || '').replace(/[^A-Za-z0-9._]/g, '');
const phoneDigits = (v) => String(v || '').replace(/[^0-9]/g, '');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function brandHTML(name) {
  const n = String(name || '');
  const i = n.lastIndexOf('.');
  if (i > 0 && i < n.length - 1) return `${esc(n.slice(0, i))}<span class="text-ink2 font-normal">${esc(n.slice(i))}</span>`;
  return esc(n);
}

function avatar(url, name, size = 'w-12 h-12', text = 'text-sm') {
  if (url) return `<img src="${esc(url)}" alt="" loading="lazy" class="${size} rounded-full object-cover border border-line shrink-0 bg-muted">`;
  return `<span class="${size} ${text} rounded-full bg-muted text-ink2 font-display font-semibold flex items-center justify-center shrink-0">${esc(initials(name))}</span>`;
}

function emptyState(title, text, extra = '') {
  return `<div class="card card-pad text-center py-12 col-span-full">
    <div class="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">${icon('inbox', 'text-ink2')}</div>
    <h3 class="font-display font-semibold text-lg">${esc(title)}</h3>
    <p class="text-sm text-ink2 mt-1 max-w-md mx-auto">${esc(text)}</p>${extra}
  </div>`;
}

function skeletonCards(n = 3) {
  return `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">${Array.from({ length: n }, () => '<div class="skeleton h-44"></div>').join('')}</div>`;
}

function setApp(html) { $('#app').innerHTML = html; }

/* ---------- toast + modal ---------- */
function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = 'pointer-events-auto flex items-start gap-2 max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-lg border ' +
    (type === 'error' ? 'bg-white text-[#B42318] border-[#B42318]' : 'bg-ink text-white border-ink');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'error' : 'check_circle')}<span>${esc(message)}</span>`;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

function openModal(html, wide = false) {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = `<div class="fixed inset-0 z-[60] bg-ink/50 flex items-end sm:items-center justify-center p-0 sm:p-4" data-action="modal-backdrop">
    <div class="bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-line shadow-[0_4px_12px_rgba(22,24,27,.06)] relative" role="dialog" aria-modal="true">
      <button class="btn btn-ghost !p-2 absolute top-3 right-3" data-action="close-modal" aria-label="Close">${icon('close')}</button>
      <div class="p-6 sm:p-8">${html}</div>
    </div></div>`;
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modal-root').innerHTML = ''; document.body.style.overflow = ''; }
actions['close-modal'] = () => closeModal();
actions['modal-backdrop'] = (el, ev) => { if (ev.target === el) closeModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ---------- event delegation (no inline handlers anywhere) ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
  if (!e.target.closest('#user-slot')) { const m = $('#user-menu'); if (m) m.classList.add('hidden'); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]');
  if (!f) return;
  e.preventDefault();
  if (actions[f.dataset.submit]) actions[f.dataset.submit](f, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && actions[el.dataset.change]) actions[el.dataset.change](el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && actions[el.dataset.input]) actions[el.dataset.input](el, e);
});

/* ---------- misc utilities ---------- */
async function busy(btn, fn) {
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Please wait…'; }
  try { return await fn(); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

function validateImage(file, maxMB, allowSvg = false) {
  const ok = allowSvg ? /^image\/(png|jpe?g|webp|svg\+xml)$/ : /^image\/(png|jpe?g|webp)$/;
  if (!ok.test(file.type)) throw new Error(allowSvg ? 'Use a PNG, JPG, WebP or SVG image.' : 'Use a PNG, JPG or WebP image.');
  if (file.size > maxMB * 1024 * 1024) throw new Error(`The image must be smaller than ${maxMB} MB.`);
}

async function uploadImage(bucket, file, maxMB, allowSvg = false) {
  if (!file) return null;
  validateImage(file, maxMB, allowSvg);
  const ext = file.type.includes('svg') ? 'svg' : file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
  const path = `${uid()}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Shows a preview of a chosen image inside `previewEl`. Returns false if the file was rejected.
function previewImage(input, previewEl, maxMB, allowSvg = false) {
  const file = input.files && input.files[0];
  if (!file) return false;
  try { validateImage(file, maxMB, allowSvg); }
  catch (e) { toast(errMsg(e), 'error'); input.value = ''; return false; }
  previewEl.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" class="w-full h-full object-cover">`;
  return true;
}

function downloadCSV(filename, rows) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;      // stop spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- navigation ---------- */
const NAV = [
  ['home', 'Home'], ['enroll', 'Enroll'], ['notices', 'Notices'], ['forms', 'Forms'], ['matches', 'Find Matches']
];
const currentPath = () => (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
const go = (path) => { location.hash = '#/' + path; };

function buildNav() {
  const link = (p, label, cls) => `<a href="#/${p}" data-nav="${p}" class="${cls}">${label}</a>`;
  $('#main-nav').innerHTML = NAV.map(([p, l]) => link(p, l, 'nav-link')).join('');
  $('#mobile-nav').innerHTML = NAV.map(([p, l]) => link(p, l, 'nav-link !py-3')).join('') +
    `<a href="#/login" data-nav="login" class="nav-link !py-3">Student sign-in</a>` +
    `<a href="#/admin" data-nav="admin" class="nav-link !py-3">Admin</a>`;
}
function markNav(path) {
  $$('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === path;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#mobile-nav').classList.add('hidden');
}

async function renderRoute() {
  const path = currentPath();
  const render = Routes[path] || Routes.home;
  markNav(Routes[path] ? path : 'home');
  window.scrollTo(0, 0);
  try { await render(); }
  catch (e) {
    console.error(e);
    setApp(`<div class="max-w-xl mx-auto card card-pad text-center">
      <h2 class="font-display text-xl font-semibold">Something went wrong</h2>
      <p class="text-sm text-ink2 mt-2">${esc(errMsg(e))}</p>
      <button class="btn btn-primary mt-5" data-action="reload">Try again</button></div>`);
  }
}
actions['reload'] = () => renderRoute();

/* ---------- branding / settings ---------- */
async function loadSettings() {
  const { data, error } = await sb.from('site_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error('Could not load site settings. Did you run supabase/schema.sql? (' + error.message + ')');
  if (data) S.settings = { ...DEFAULT_SETTINGS, ...data };
}

function applyBranding() {
  const s = S.settings;
  const logo = s.logo_url || DEFAULT_LOGO;
  $('#brand-logo').src = logo;
  $('#favicon').href = logo;
  $('#brand-name').innerHTML = brandHTML(s.site_name);
  $('#footer-name').innerHTML = brandHTML(s.site_name);
  $('#footer-term').textContent = s.academic_term || '';
  $('#footer-text').textContent = s.footer_text || `© ${new Date().getFullYear()} ${s.site_name}`;
  document.title = s.tagline ? `${s.site_name} · ${s.tagline}` : s.site_name;
}

/* ---------- auth ---------- */
function renderUserSlot() {
  const slot = $('#user-slot');
  const adminBtn = $('#admin-btn');
  if (adminBtn) adminBtn.textContent = S.isAdmin ? 'Admin panel' : 'Admin';
  if (!S.session) {
    slot.innerHTML = `<a href="#/login" class="btn btn-outline hidden sm:inline-flex">Sign in</a>`;
    return;
  }
  const email = S.session.user.email || '';
  slot.innerHTML = `
    <button class="w-10 h-10 rounded-full bg-ink text-white font-display font-semibold flex items-center justify-center" data-action="toggle-user-menu" aria-label="Account menu">${esc(initials(email))}</button>
    <div id="user-menu" class="hidden absolute right-0 top-12 w-64 bg-white border border-line rounded-2xl p-2 shadow-[0_4px_12px_rgba(22,24,27,.06)]">
      <div class="px-3 py-2 text-xs text-ink2 break-all border-b border-line mb-1">${esc(email)}</div>
      ${S.isAdmin ? `<a href="#/admin" class="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-canvas">Admin panel</a>` : ''}
      <button class="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold hover:bg-canvas" data-action="sign-out">Sign out</button>
    </div>`;
}
actions['toggle-user-menu'] = () => $('#user-menu').classList.toggle('hidden');
actions['sign-out'] = async () => {
  await sb.auth.signOut();
  toast('Signed out.');
  if (currentPath() === 'admin' || currentPath() === 'login') go('home');
};

async function refreshAuth() {
  const { data: { session } } = await sb.auth.getSession();
  S.session = session;
  S.isAdmin = false;
  if (session) {
    const { data } = await sb.rpc('is_admin');
    S.isAdmin = data === true;
    const domain = String(CFG.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase().replace(/^@/, '');
    const email = String(session.user.email || '').toLowerCase();
    if (!S.isAdmin && domain && !email.endsWith('@' + domain)) {
      await sb.auth.signOut();
      S.session = null;
      toast(`Please sign in with your @${domain} account.`, 'error');
    }
  }
  renderUserSlot();
}

/* ---------- setup screen (shown until config.js is filled in) ---------- */
function renderSetup() {
  setApp(`<div class="max-w-xl mx-auto card card-pad">
    <h1 class="font-display text-2xl font-bold">Connect Supabase</h1>
    <p class="text-ink2 text-sm mt-2">This site stores everything in your Supabase project. Two quick steps:</p>
    <ol class="list-decimal pl-5 mt-4 space-y-2 text-sm">
      <li>Open <code class="chip">config.js</code> and paste your Supabase <b>Project URL</b> and <b>anon public key</b>.</li>
      <li>Run <code class="chip">supabase/schema.sql</code> once in the Supabase SQL Editor.</li>
    </ol>
    <p class="text-xs text-ink2 mt-4">Full steps are in README.md.</p>
  </div>`);
}

/* ---------- start ---------- */
const App = {
  async start() {
    buildNav();
    $('#menu-btn').addEventListener('click', () => $('#mobile-nav').classList.toggle('hidden'));
    $('#footer-name').innerHTML = brandHTML(S.settings.site_name);
    if (!CONFIGURED) { renderSetup(); return; }
    setApp(skeletonCards());
    try {
      await loadSettings();
      applyBranding();
      await refreshAuth();
    } catch (e) {
      setApp(`<div class="max-w-xl mx-auto card card-pad"><h2 class="font-display text-xl font-semibold">Setup problem</h2><p class="text-sm text-ink2 mt-2">${esc(errMsg(e))}</p></div>`);
      return;
    }
    const authKey = () => `${S.session ? S.session.user.id : ''}|${S.isAdmin}`;
    sb.auth.onAuthStateChange(() => {
      setTimeout(async () => {
        const before = authKey();
        await refreshAuth();
        if (before !== authKey() && ['admin', 'login'].includes(currentPath())) renderRoute();
      }, 0);
    });
    window.addEventListener('hashchange', renderRoute);
    renderRoute();
  }
};
