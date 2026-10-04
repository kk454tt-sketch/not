'use strict';

/* =====================================================================
   ADMIN PANEL
   Everything here is protected twice:
   1) the UI only renders for signed-in admins
   2) Supabase Row Level Security rejects every request from non-admins
   ===================================================================== */
const AD = {
  tab: 'overview',
  students: [], matches: [], notices: [], forms: [], responses: [],
  q: '', dept: '', year: '', selected: new Set(),
  bld: { form: [], enroll: [] }, pendingLogo: null
};
const TABS = [['overview', 'Overview'], ['students', 'Students'], ['matches', 'Match profiles'], ['notices', 'Notices'], ['forms', 'Forms'], ['settings', 'Settings']];
const FIELD_TYPES = [['text', 'Short text'], ['textarea', 'Long text'], ['number', 'Number'], ['email', 'Email'], ['tel', 'Phone'], ['date', 'Date'], ['select', 'Dropdown']];

const fetchRows = async (table, cols = '*') => {
  const { data, error } = await sb.from(table).select(cols).order('created_at', { ascending: false }).range(0, 999);
  if (error) throw error;
  return data || [];
};
const countRows = async (table) => {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
};
const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field';
const tableWrap = (inner) => `<div class="card overflow-x-auto">${inner}</div>`;

async function saveSettings(patch) {
  const { data, error } = await sb.from('site_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1).select().single();
  if (error) throw new Error(error.code === 'PGRST116' ? 'Not allowed. This account is not an admin.' : error.message);
  S.settings = { ...S.settings, ...data };
  applyBranding();
  return data;
}

/* ---------------------------------------------------------------------
   LOGIN + SHELL
   --------------------------------------------------------------------- */
function renderAdminLogin() {
  setApp(`<div class="max-w-md mx-auto pt-4">
    <div class="card card-pad sm:!p-8">
      <div class="w-12 h-12 rounded-2xl bg-canvas flex items-center justify-center mb-4">${icon('lock')}</div>
      <h1 class="font-display text-2xl font-bold">Admin sign-in</h1>
      <p class="text-ink2 text-sm mt-1">Use the email and password of an admin account.</p>
      ${S.session && !S.isAdmin ? `<div class="mt-4 rounded-xl bg-canvas p-3 text-sm">You are signed in as <b class="break-all">${esc(S.session.user.email)}</b>, which is not an admin account.
        <button class="underline font-semibold ml-1" data-action="sign-out">Sign out</button></div>` : ''}
      <form data-submit="admin-login" class="space-y-4 mt-6">
        <div><label class="label" for="a-email">Email</label><input id="a-email" name="email" type="email" class="field" autocomplete="username" required></div>
        <div><label class="label" for="a-pass">Password</label><input id="a-pass" name="password" type="password" class="field" autocomplete="current-password" required></div>
        <button type="submit" class="btn btn-primary w-full !py-3.5">Sign in</button>
      </form>
    </div></div>`);
}

actions['admin-login'] = (form) => busy($('button[type=submit]', form), async () => {
  const fd = new FormData(form);
  const { error } = await sb.auth.signInWithPassword({ email: String(fd.get('email')).trim(), password: String(fd.get('password')) });
  if (error) return toast(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message, 'error');
  await refreshAuth();
  if (!S.isAdmin) {
    await sb.auth.signOut();
    S.session = null; renderUserSlot();
    return toast('This account is not an admin. Add it to the admins table (see README step 5).', 'error');
  }
  toast('Signed in.');
  renderRoute();
});

Routes.admin = async () => {
  if (!S.session || !S.isAdmin) return renderAdminLogin();
  setApp(`<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div><h1 class="font-display text-3xl font-bold">Admin panel</h1>
        <p class="text-sm text-ink2 break-all">Signed in as ${esc(S.session.user.email)}</p></div>
      <button class="btn btn-outline self-start" data-action="sign-out">${icon('logout', '!text-base')} Sign out</button>
    </div>
    <div id="admin-tabs" class="flex gap-1 overflow-x-auto pb-2 mb-5 border-b border-line"></div>
    <div id="admin-body"></div>`);
  await showTab(AD.tab);
};

async function showTab(tab) {
  AD.tab = tab;
  $('#admin-tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab-btn ${k === tab ? 'active' : ''}" data-action="admin-tab" data-tab="${k}">${l}</button>`).join('');
  $('#admin-body').innerHTML = skeletonCards();
  try { await ({ overview: tabOverview, students: tabStudents, matches: tabMatches, notices: tabNotices, forms: tabForms, settings: tabSettings })[tab](); }
  catch (e) { $('#admin-body').innerHTML = `<div class="card card-pad text-sm text-ink2">${esc(errMsg(e))}</div>`; }
}
actions['admin-tab'] = (el) => showTab(el.dataset.tab);

/* ---------------------------------------------------------------------
   OVERVIEW
   --------------------------------------------------------------------- */
async function tabOverview() {
  const [students, nStu, nMat, nNot, nForms] = await Promise.all([
    fetchRows('students', 'id,name,photo_url,department,year,created_at'),
    countRows('students'), countRows('match_profiles'), countRows('notices'), countRows('forms')
  ]);
  const byDept = {};
  S.settings.departments.forEach((d) => (byDept[d] = 0));
  students.forEach((s) => (byDept[s.department] = (byDept[s.department] || 0) + 1));
  const max = Math.max(1, ...Object.values(byDept));
  const stat = (l, v) => `<div class="card card-pad"><div class="text-sm text-ink2 font-medium">${l}</div><div class="font-display text-3xl font-bold mt-2">${v.toLocaleString()}</div></div>`;
  $('#admin-body').innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">${stat('Students', nStu)}${stat('Match profiles', nMat)}${stat('Notices', nNot)}${stat('Forms', nForms)}</div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card card-pad"><h2 class="font-display font-semibold text-lg mb-4">Students by department</h2>
        ${Object.keys(byDept).length ? `<div class="space-y-3">${Object.entries(byDept).map(([d, n]) => `
          <div><div class="flex justify-between text-sm mb-1"><span class="font-medium">${esc(d)}</span><span class="text-ink2">${n}</span></div>
          <div class="h-2 rounded-full bg-muted overflow-hidden"><div class="h-full bg-ink rounded-full" style="width:${(n / max) * 100}%"></div></div></div>`).join('')}</div>`
          : '<p class="text-sm text-ink2">Add departments in Settings to see this chart.</p>'}</div>
      <div class="card card-pad"><h2 class="font-display font-semibold text-lg mb-4">Latest registrations</h2>
        ${students.length ? `<ul class="divide-y divide-line">${students.slice(0, 6).map((s) => `
          <li class="py-3 flex items-center gap-3">${avatar(s.photo_url, s.name, 'w-10 h-10')}
            <div class="min-w-0 flex-1"><div class="font-semibold text-sm truncate">${esc(s.name)}</div><div class="text-xs text-ink2 truncate">${esc(s.department)} · ${esc(s.year)}</div></div>
            <span class="text-xs text-ink2 shrink-0">${fmtDate(s.created_at)}</span></li>`).join('')}</ul>`
          : '<p class="text-sm text-ink2">No students have enrolled yet.</p>'}</div>
    </div>`;
}

/* ---------------------------------------------------------------------
   STUDENTS
   --------------------------------------------------------------------- */
async function tabStudents() {
  AD.students = await fetchRows('students');
  AD.q = ''; AD.dept = ''; AD.year = ''; AD.selected = new Set();
  $('#admin-body').innerHTML = `
    <div class="card p-3 sm:p-4 flex flex-col lg:flex-row gap-3 lg:items-center justify-between mb-4">
      <div class="flex flex-col sm:flex-row gap-3 flex-1">
        <input id="sf-q" class="field field-sm sm:max-w-xs" placeholder="Search name, Instagram, WhatsApp" aria-label="Search" data-input="stu-filter">
        <select id="sf-dept" class="field field-sm sm:max-w-[200px]" data-change="stu-filter" aria-label="Department">${options(S.settings.departments, 'All departments')}</select>
        <select id="sf-year" class="field field-sm sm:max-w-[160px]" data-change="stu-filter" aria-label="Year">${options(S.settings.years, 'All years')}</select>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-outline btn-sm" data-action="stu-export">${icon('download', '!text-base')} Export CSV</button>
        <button class="btn btn-primary btn-sm" data-action="wa-open">${icon('chat', '!text-base')} WhatsApp message</button>
      </div>
    </div>
    <div id="stu-table"></div>`;
  renderStudents();
}

const filteredStudents = () => AD.students.filter((s) =>
  (!AD.dept || s.department === AD.dept) && (!AD.year || s.year === AD.year) &&
  (!AD.q || [s.name, s.instagram, s.whatsapp, s.email].join(' ').toLowerCase().includes(AD.q)));

actions['stu-filter'] = () => { AD.q = $('#sf-q').value.trim().toLowerCase(); AD.dept = $('#sf-dept').value; AD.year = $('#sf-year').value; renderStudents(); };

function renderStudents() {
  const rows = filteredStudents();
  $('#stu-table').innerHTML = rows.length ? tableWrap(`<table class="tbl"><thead><tr>
      <th><input type="checkbox" aria-label="Select all" data-change="stu-select-all" ${rows.every((r) => AD.selected.has(r.id)) ? 'checked' : ''}></th>
      <th>Student</th><th>Department</th><th>Year</th><th>Instagram</th><th>WhatsApp</th><th>Joined</th><th></th></tr></thead><tbody>
      ${rows.map((s) => `<tr>
        <td><input type="checkbox" aria-label="Select ${esc(s.name)}" data-change="stu-select" data-id="${esc(s.id)}" ${AD.selected.has(s.id) ? 'checked' : ''}></td>
        <td><div class="flex items-center gap-3">${avatar(s.photo_url, s.name, 'w-10 h-10')}<span class="font-semibold">${esc(s.name)}</span></div></td>
        <td>${esc(s.department)}</td><td>${esc(s.year)}</td>
        <td>${s.instagram ? '@' + esc(igHandle(s.instagram)) : '<span class="text-ink2">-</span>'}</td>
        <td>${s.whatsapp ? esc(s.whatsapp) : '<span class="text-ink2">-</span>'}</td>
        <td class="whitespace-nowrap text-ink2">${fmtDate(s.created_at)}</td>
        <td class="whitespace-nowrap text-right"><button class="btn btn-ghost btn-sm" data-action="stu-view" data-id="${esc(s.id)}">Details</button>
          <button class="btn btn-danger btn-sm" data-action="stu-delete" data-id="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">${icon('delete', '!text-base')}</button></td></tr>`).join('')}
      </tbody></table>`) + `<p class="text-xs text-ink2 mt-2">${rows.length} student${rows.length === 1 ? '' : 's'} shown · ${AD.selected.size} selected</p>`
    : emptyState(AD.students.length ? 'No students match your filters' : 'No students yet', AD.students.length ? 'Clear the search or filters.' : 'Students appear here when they enroll.');
}

actions['stu-select'] = (el) => { el.checked ? AD.selected.add(el.dataset.id) : AD.selected.delete(el.dataset.id); renderStudents(); };
actions['stu-select-all'] = (el) => { filteredStudents().forEach((s) => (el.checked ? AD.selected.add(s.id) : AD.selected.delete(s.id))); renderStudents(); };

actions['stu-view'] = (el) => {
  const s = AD.students.find((x) => x.id === el.dataset.id); if (!s) return;
  const row = (k, v) => `<div class="flex justify-between gap-4 py-2 border-b border-line text-sm"><span class="text-ink2">${esc(k)}</span><span class="font-medium text-right break-words">${v ? esc(v) : '-'}</span></div>`;
  openModal(`<div class="flex items-center gap-4 pr-10 mb-4">${avatar(s.photo_url, s.name, 'w-20 h-20', 'text-xl')}
      <div><h2 class="font-display text-2xl font-bold">${esc(s.name)}</h2><p class="text-sm text-ink2">${esc(s.department)} · ${esc(s.year)}</p></div></div>
    ${row('Instagram', s.instagram ? '@' + igHandle(s.instagram) : '')}${row('WhatsApp', s.whatsapp)}${row('Signed-in email', s.email)}${row('Enrolled', fmtDateTime(s.created_at))}
    ${Object.entries(s.custom_answers || {}).map(([k, v]) => row(k, v)).join('')}`);
};

actions['stu-delete'] = async (el) => {
  const s = AD.students.find((x) => x.id === el.dataset.id); if (!s) return;
  if (!confirm(`Delete ${s.name}? This cannot be undone.`)) return;
  const { error } = await sb.from('students').delete().eq('id', s.id);
  if (error) return toast(errMsg(error), 'error');
  AD.students = AD.students.filter((x) => x.id !== s.id); AD.selected.delete(s.id);
  renderStudents(); toast('Student deleted.');
};

actions['stu-export'] = () => {
  const rows = filteredStudents();
  if (!rows.length) return toast('Nothing to export.', 'error');
  downloadCSV('students.csv', [['Name', 'Department', 'Year', 'Instagram', 'WhatsApp', 'Email', 'Other details', 'Enrolled']].concat(
    rows.map((s) => [s.name, s.department, s.year, s.instagram || '', s.whatsapp || '', s.email || '',
      Object.entries(s.custom_answers || {}).map(([k, v]) => `${k}: ${v}`).join('; '), s.created_at])));
};

/* WhatsApp: browsers only allow one chat window per click, so each student gets their own "Open chat" link */
actions['wa-open'] = () => {
  const chosen = AD.students.filter((s) => AD.selected.has(s.id));
  if (!chosen.length) return toast('Select at least one student first.', 'error');
  const withPhone = chosen.filter((s) => phoneDigits(s.whatsapp));
  if (!withPhone.length) return toast('None of the selected students have a WhatsApp number.', 'error');
  const skipped = chosen.length - withPhone.length;
  openModal(`<h2 class="font-display text-2xl font-bold pr-10">Send a WhatsApp message</h2>
    <p class="text-sm text-ink2 mt-1">WhatsApp opens one chat at a time. Click "Open chat" next to each student.${skipped ? ` ${skipped} selected student${skipped > 1 ? 's have' : ' has'} no number and ${skipped > 1 ? 'were' : 'was'} skipped.` : ''}</p>
    <label class="label mt-5" for="wa-msg">Message</label>
    <textarea id="wa-msg" class="field" data-input="wa-msg">Hello! This is an announcement from ${esc(S.settings.site_name)}.</textarea>
    <ul class="divide-y divide-line mt-4 max-h-72 overflow-y-auto" id="wa-list">${withPhone.map((s) => `
      <li class="py-2.5 flex items-center justify-between gap-3"><div class="min-w-0"><div class="font-semibold text-sm truncate">${esc(s.name)}</div><div class="text-xs text-ink2">${esc(s.whatsapp)}</div></div>
        <a class="btn btn-outline btn-sm wa-link" data-digits="${phoneDigits(s.whatsapp)}" target="_blank" rel="noopener noreferrer">Open chat</a></li>`).join('')}</ul>
    <div class="flex justify-end mt-5"><button class="btn btn-outline btn-sm" data-action="wa-copy" data-numbers="${esc(withPhone.map((s) => s.whatsapp).join(', '))}">Copy numbers</button></div>`, true);
  actions['wa-msg']();
};
actions['wa-msg'] = () => {
  const text = encodeURIComponent($('#wa-msg').value);
  $$('.wa-link').forEach((a) => (a.href = `https://wa.me/${a.dataset.digits}?text=${text}`));
};
actions['wa-copy'] = async (el) => { try { await navigator.clipboard.writeText(el.dataset.numbers); toast('Numbers copied.'); } catch { toast('Could not copy.', 'error'); } };

/* ---------------------------------------------------------------------
   MATCH PROFILES (shows the private columns, admin only)
   --------------------------------------------------------------------- */
async function tabMatches() {
  AD.matches = await fetchRows('match_profiles');
  $('#admin-body').innerHTML = `
    <div class="flex items-center justify-between mb-4"><p class="text-sm text-ink2">Gender and WhatsApp are private. Only admins can see this table.</p>
      <button class="btn btn-outline btn-sm" data-action="mat-export">${icon('download', '!text-base')} Export CSV</button></div>
    ${AD.matches.length ? tableWrap(`<table class="tbl"><thead><tr><th>Student</th><th>Gender</th><th>Department</th><th>Year</th><th>Looking for</th><th>Hobbies</th><th>Instagram</th><th>WhatsApp</th><th>Created</th><th></th></tr></thead><tbody>
      ${AD.matches.map((m) => `<tr><td><div class="flex items-center gap-3">${avatar(m.photo_url, m.name, 'w-10 h-10')}<span class="font-semibold">${esc(m.name)}</span></div></td>
        <td>${esc(m.gender)}</td><td>${esc(m.department)}</td><td>${esc(m.year)}</td><td>${esc(m.looking_for)}</td>
        <td class="min-w-[180px]"><div class="flex flex-wrap gap-1">${(m.hobbies || []).map((h) => `<span class="chip chip-outline !py-0.5">${esc(h)}</span>`).join('')}</div></td>
        <td>${m.instagram ? '@' + esc(igHandle(m.instagram)) : '-'}</td><td>${esc(m.whatsapp)}</td>
        <td class="whitespace-nowrap text-ink2">${fmtDate(m.created_at)}</td>
        <td><button class="btn btn-danger btn-sm" data-action="mat-delete" data-id="${esc(m.id)}" aria-label="Delete ${esc(m.name)}">${icon('delete', '!text-base')}</button></td></tr>`).join('')}
      </tbody></table>`) : emptyState('No match profiles yet', 'Profiles appear here when students use Find Matches.')}`;
}
actions['mat-delete'] = async (el) => {
  const m = AD.matches.find((x) => x.id === el.dataset.id); if (!m) return;
  if (!confirm(`Delete the match profile of ${m.name}?`)) return;
  const { error } = await sb.from('match_profiles').delete().eq('id', m.id);
  if (error) return toast(errMsg(error), 'error');
  toast('Profile deleted.'); tabMatches();
};
actions['mat-export'] = () => {
  if (!AD.matches.length) return toast('Nothing to export.', 'error');
  downloadCSV('match-profiles.csv', [['Name', 'Gender', 'Department', 'Year', 'Looking for', 'Hobbies', 'Instagram', 'WhatsApp', 'Created']].concat(
    AD.matches.map((m) => [m.name, m.gender, m.department, m.year, m.looking_for, (m.hobbies || []).join('; '), m.instagram || '', m.whatsapp, m.created_at])));
};

/* ---------------------------------------------------------------------
   NOTICES
   --------------------------------------------------------------------- */
async function tabNotices() {
  AD.notices = await fetchRows('notices');
  $('#admin-body').innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 items-start">
    <form data-submit="notice-create" class="card card-pad space-y-4" novalidate>
      <h2 class="font-display font-semibold text-lg">Publish a notice</h2>
      <div><label class="label" for="n-title">Title</label><input id="n-title" name="title" class="field" maxlength="200" required></div>
      <div><label class="label" for="n-msg">Message</label><textarea id="n-msg" name="message" class="field" required></textarea></div>
      <div><label class="label" for="n-dept">Show to</label><select id="n-dept" name="target" class="field"><option>All Departments</option>${S.settings.departments.map((d) => `<option>${esc(d)}</option>`).join('')}</select></div>
      <div><label class="label" for="n-img">Image <span class="text-ink2 font-normal text-xs">(optional, up to 3 MB)</span></label>
        <input id="n-img" name="image" type="file" accept="image/png,image/jpeg,image/webp" class="file-input"></div>
      <button type="submit" class="btn btn-primary w-full">Publish notice</button>
    </form>
    <div><h2 class="font-display font-semibold text-lg mb-3">Published notices (${AD.notices.length})</h2>
    ${AD.notices.length ? `<div class="space-y-3">${AD.notices.map((n) => `<div class="card p-4 flex items-start gap-4">
        ${n.image_url ? `<img src="${esc(n.image_url)}" alt="" class="w-16 h-16 rounded-xl object-cover border border-line shrink-0">` : ''}
        <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2 mb-1"><span class="chip">${esc(n.target_department)}</span><span class="text-xs text-ink2">${fmtDate(n.created_at)}</span></div>
          <h3 class="font-display font-semibold">${esc(n.title)}</h3><p class="text-sm text-ink2 clamp-3 whitespace-pre-line">${esc(n.message)}</p></div>
        <button class="btn btn-danger btn-sm shrink-0" data-action="notice-delete" data-id="${esc(n.id)}" aria-label="Delete notice">${icon('delete', '!text-base')}</button></div>`).join('')}</div>`
      : emptyState('No notices yet', 'Publish your first notice using the form.')}</div></div>`;
}
actions['notice-create'] = (form) => busy($('button[type=submit]', form), async () => {
  const fd = new FormData(form);
  const title = String(fd.get('title')).trim(), message = String(fd.get('message')).trim();
  if (!title || !message) return toast('Enter a title and a message.', 'error');
  try {
    const file = fd.get('image');
    const image_url = file && file.size ? await uploadImage('notice-images', file, 3) : null;
    const { error } = await sb.from('notices').insert({ title, message, image_url, target_department: fd.get('target') });
    if (error) throw error;
    toast('Notice published.'); tabNotices();
  } catch (e) { toast(errMsg(e), 'error'); }
});
actions['notice-delete'] = async (el) => {
  if (!confirm('Delete this notice?')) return;
  const { error } = await sb.from('notices').delete().eq('id', el.dataset.id);
  if (error) return toast(errMsg(error), 'error');
  toast('Notice deleted.'); tabNotices();
};

/* ---------------------------------------------------------------------
   FIELD BUILDER (used for custom forms and for extra enrollment fields)
   --------------------------------------------------------------------- */
const blankField = () => ({ label: '', type: 'text', required: false, options: '' });
const fromSaved = (fields) => (fields || []).map((f) => ({ label: f.label, type: f.type || 'text', required: !!f.required, options: (f.options || []).join(', '), placeholder: f.placeholder }));
function toSaved(list) {
  return list.filter((f) => f.label.trim()).map((f) => {
    const out = { id: slug(f.label), label: f.label.trim(), type: f.type, required: !!f.required };
    if (f.type === 'select') out.options = f.options.split(',').map((o) => o.trim()).filter(Boolean);
    if (f.placeholder) out.placeholder = f.placeholder;
    return out;
  });
}
function builderHTML(which) {
  const list = AD.bld[which];
  return `<div id="bld-${which}" class="space-y-3">${list.map((f, i) => `
    <div class="rounded-2xl border border-line p-3 space-y-2">
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2">
        <input class="field field-sm" placeholder="Field label, e.g. Hostel room number" aria-label="Field label" value="${esc(f.label)}" data-input="bld-label" data-b="${which}" data-i="${i}">
        <select class="field field-sm" aria-label="Field type" data-change="bld-type" data-b="${which}" data-i="${i}">${FIELD_TYPES.map(([v, l]) => `<option value="${v}" ${f.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      ${f.type === 'select' ? `<input class="field field-sm" placeholder="Options, separated by commas" aria-label="Options" value="${esc(f.options)}" data-input="bld-options" data-b="${which}" data-i="${i}">` : ''}
      <div class="flex items-center justify-between">
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" ${f.required ? 'checked' : ''} data-change="bld-req" data-b="${which}" data-i="${i}"> Required</label>
        <button type="button" class="btn btn-ghost btn-sm" data-action="bld-remove" data-b="${which}" data-i="${i}">${icon('close', '!text-base')} Remove</button>
      </div></div>`).join('')}
    ${list.length ? '' : '<p class="text-sm text-ink2">No fields yet.</p>'}
    <button type="button" class="btn btn-outline btn-sm" data-action="bld-add" data-b="${which}">${icon('add', '!text-base')} Add field</button></div>`;
}
const rebuild = (which) => { const el = $('#bld-' + which); if (el) el.outerHTML = builderHTML(which); };
actions['bld-add'] = (el) => { AD.bld[el.dataset.b].push(blankField()); rebuild(el.dataset.b); };
actions['bld-remove'] = (el) => { AD.bld[el.dataset.b].splice(Number(el.dataset.i), 1); rebuild(el.dataset.b); };
actions['bld-label'] = (el) => { AD.bld[el.dataset.b][el.dataset.i].label = el.value; };
actions['bld-options'] = (el) => { AD.bld[el.dataset.b][el.dataset.i].options = el.value; };
actions['bld-req'] = (el) => { AD.bld[el.dataset.b][el.dataset.i].required = el.checked; };
actions['bld-type'] = (el) => { AD.bld[el.dataset.b][el.dataset.i].type = el.value; rebuild(el.dataset.b); };
function checkFields(saved) {
  if (saved.some((f) => f.type === 'select' && !(f.options && f.options.length))) { toast('Add at least one option to each dropdown field.', 'error'); return false; }
  return true;
}

/* ---------------------------------------------------------------------
   FORMS
   --------------------------------------------------------------------- */
async function tabForms() {
  const [forms, responses] = await Promise.all([fetchRows('forms'), fetchRows('form_responses')]);
  AD.forms = forms; AD.responses = responses;
  AD.bld.form = [blankField()];
  const count = (id) => responses.filter((r) => r.form_id === id).length;
  $('#admin-body').innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
    <form data-submit="form-create" class="card card-pad space-y-4" novalidate>
      <h2 class="font-display font-semibold text-lg">Create a form</h2>
      <div><label class="label" for="f-title">Title</label><input id="f-title" name="title" class="field" maxlength="200" required></div>
      <div><label class="label" for="f-desc">Description</label><textarea id="f-desc" name="description" class="field !min-h-[80px]"></textarea></div>
      <div><span class="label">Fields</span>${builderHTML('form')}</div>
      <button type="submit" class="btn btn-primary w-full">Publish form</button>
    </form>
    <div><h2 class="font-display font-semibold text-lg mb-3">Your forms (${forms.length})</h2>
    ${forms.length ? `<div class="space-y-3">${forms.map((f) => `<div class="card p-4">
        <div class="flex items-start justify-between gap-3"><div class="min-w-0"><h3 class="font-display font-semibold">${esc(f.title)}</h3>
          <p class="text-sm text-ink2">${esc(f.description) || 'No description.'}</p></div>
          <span class="chip ${f.is_active ? 'chip-dark' : ''} shrink-0">${f.is_active ? 'Visible' : 'Hidden'}</span></div>
        <div class="flex flex-wrap items-center gap-2 mt-3">
          <button class="btn btn-outline btn-sm" data-action="resp-view" data-id="${esc(f.id)}">${count(f.id)} response${count(f.id) === 1 ? '' : 's'}</button>
          <button class="btn btn-outline btn-sm" data-action="form-toggle" data-id="${esc(f.id)}">${f.is_active ? 'Hide from students' : 'Show to students'}</button>
          <button class="btn btn-danger btn-sm ml-auto" data-action="form-delete" data-id="${esc(f.id)}" aria-label="Delete form">${icon('delete', '!text-base')}</button></div></div>`).join('')}</div>`
      : emptyState('No forms yet', 'Create a form on the left and students can fill it in.')}</div></div>`;
}
actions['form-create'] = (form) => busy($('button[type=submit]', form), async () => {
  const fd = new FormData(form);
  const title = String(fd.get('title')).trim();
  const fields = toSaved(AD.bld.form);
  if (!title) return toast('Enter a form title.', 'error');
  if (!fields.length) return toast('Add at least one field with a label.', 'error');
  if (!checkFields(fields)) return;
  const { error } = await sb.from('forms').insert({ title, description: String(fd.get('description')).trim(), fields });
  if (error) return toast(errMsg(error), 'error');
  toast('Form published.'); tabForms();
});
actions['form-toggle'] = async (el) => {
  const f = AD.forms.find((x) => x.id === el.dataset.id); if (!f) return;
  const { error } = await sb.from('forms').update({ is_active: !f.is_active }).eq('id', f.id);
  if (error) return toast(errMsg(error), 'error');
  tabForms();
};
actions['form-delete'] = async (el) => {
  if (!confirm('Delete this form and all its responses?')) return;
  const { error } = await sb.from('forms').delete().eq('id', el.dataset.id);
  if (error) return toast(errMsg(error), 'error');
  toast('Form deleted.'); tabForms();
};
actions['resp-view'] = (el) => {
  const f = AD.forms.find((x) => x.id === el.dataset.id); if (!f) return;
  const rs = AD.responses.filter((r) => r.form_id === f.id);
  const labels = (f.fields || []).map((x) => x.label);
  const val = (r, l) => ((r.answers || []).find((a) => a.label === l) || {}).value || '';
  openModal(`<div class="flex items-center justify-between gap-3 pr-10"><h2 class="font-display text-2xl font-bold">${esc(f.title)}</h2>
      ${rs.length ? `<button class="btn btn-outline btn-sm" data-action="resp-export" data-id="${esc(f.id)}">${icon('download', '!text-base')} CSV</button>` : ''}</div>
    ${rs.length ? `<div class="overflow-x-auto mt-4 border border-line rounded-2xl"><table class="tbl"><thead><tr>${labels.map((l) => `<th>${esc(l)}</th>`).join('')}<th>Signed-in email</th><th>Submitted</th></tr></thead><tbody>
      ${rs.map((r) => `<tr>${labels.map((l) => `<td>${esc(val(r, l)) || '-'}</td>`).join('')}<td>${esc(r.respondent_email) || '-'}</td><td class="whitespace-nowrap text-ink2">${fmtDateTime(r.created_at)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="text-sm text-ink2 mt-4">No responses yet.</p>'}`, true);
};
actions['resp-export'] = (el) => {
  const f = AD.forms.find((x) => x.id === el.dataset.id);
  const rs = AD.responses.filter((r) => r.form_id === f.id);
  const labels = (f.fields || []).map((x) => x.label);
  downloadCSV(`${slug(f.title)}-responses.csv`, [[...labels, 'Email', 'Submitted']].concat(rs.map((r) =>
    [...labels.map((l) => ((r.answers || []).find((a) => a.label === l) || {}).value || ''), r.respondent_email || '', r.created_at])));
};

/* ---------------------------------------------------------------------
   SETTINGS  (site name, logo, texts, dropdown options, extra fields, password)
   --------------------------------------------------------------------- */
const LISTS = [['departments', 'Departments', 'e.g. Law'], ['years', 'Academic years', 'e.g. 5th Year'], ['hobbies', 'Hobbies', 'e.g. Robotics'], ['looking_for', '"Looking for" goals', 'e.g. Language exchange']];

async function tabSettings() {
  const s = S.settings;
  AD.pendingLogo = null;
  AD.bld.enroll = fromSaved(s.enroll_fields);
  $('#admin-body').innerHTML = `<div class="space-y-6 max-w-5xl">
    <form data-submit="save-branding" class="card card-pad space-y-5" novalidate>
      <div><h2 class="font-display font-semibold text-lg">Site name and logo</h2><p class="text-sm text-ink2">Changes show on every page right after you save.</p></div>
      <div class="flex flex-col sm:flex-row gap-5 items-start">
        <div id="logo-preview" class="w-24 h-24 rounded-2xl border border-line bg-white flex items-center justify-center overflow-hidden shrink-0"><img src="${esc(s.logo_url || DEFAULT_LOGO)}" alt="Current logo" class="w-full h-full object-contain p-2"></div>
        <div><label for="logo-file" class="btn btn-outline btn-sm cursor-pointer">${icon('upload', '!text-base')} Upload new logo</label>
          <input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only" data-change="logo-pick">
          <button type="button" class="btn btn-ghost btn-sm ml-1" data-action="logo-reset">Use default logo</button>
          <p class="hint">PNG, JPG, WebP or SVG, up to 2 MB. A square image on a transparent background looks best.</p></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label class="label" for="s-name">Site name</label><input id="s-name" name="site_name" class="field" maxlength="60" value="${esc(s.site_name)}" required>
          <p class="hint">Text after the last dot is shown in grey, like Bachelor<span class="text-ink2">.com</span></p></div>
        <div><label class="label" for="s-tag">Tagline</label><input id="s-tag" name="tagline" class="field" maxlength="100" value="${esc(s.tagline)}"></div>
        <div><label class="label" for="s-term">Academic term</label><input id="s-term" name="academic_term" class="field" maxlength="60" value="${esc(s.academic_term)}" placeholder="e.g. Academic Term 2026–2027"></div>
        <div><label class="label" for="s-foot">Footer text</label><input id="s-foot" name="footer_text" class="field" maxlength="160" value="${esc(s.footer_text)}" placeholder="Leave empty for a default copyright line"></div>
      </div>
      <div><label class="label" for="s-hero">Home page headline</label><input id="s-hero" name="hero_title" class="field" maxlength="140" value="${esc(s.hero_title)}"></div>
      <div><label class="label" for="s-sub">Home page text</label><textarea id="s-sub" name="hero_subtitle" class="field !min-h-[80px]" maxlength="300">${esc(s.hero_subtitle)}</textarea></div>
      <div class="flex justify-end"><button type="submit" class="btn btn-primary">Save changes</button></div>
    </form>

    <div class="card card-pad"><h2 class="font-display font-semibold text-lg mb-1">Dropdown options</h2>
      <p class="text-sm text-ink2 mb-5">These fill the dropdowns and hobby chips on the Enroll and Find Matches pages. Saved as you add or remove.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">${LISTS.map(([key, label, ph]) => `<div id="list-${key}">${listEditorHTML(key, label, ph)}</div>`).join('')}</div></div>

    <div class="card card-pad"><h2 class="font-display font-semibold text-lg mb-1">Extra enrollment fields</h2>
      <p class="text-sm text-ink2 mb-4">Additional questions shown at the bottom of the enrollment form.</p>
      ${builderHTML('enroll')}
      <div class="flex justify-end mt-4"><button class="btn btn-primary" data-action="enroll-fields-save">Save enrollment fields</button></div></div>

    <form data-submit="change-password" class="card card-pad space-y-4 max-w-xl" novalidate>
      <h2 class="font-display font-semibold text-lg">Change your password</h2>
      <div><label class="label" for="pw1">New password</label><input id="pw1" name="pw1" type="password" class="field" minlength="8" autocomplete="new-password" required></div>
      <div><label class="label" for="pw2">Repeat new password</label><input id="pw2" name="pw2" type="password" class="field" minlength="8" autocomplete="new-password" required></div>
      <button type="submit" class="btn btn-primary">Update password</button>
    </form></div>`;
}

actions['logo-pick'] = (input) => {
  if (previewImage(input, $('#logo-preview'), 2, true)) AD.pendingLogo = input.files[0];
};
actions['logo-reset'] = async (el) => {
  if (!confirm('Go back to the default logo?')) return;
  try { await saveSettings({ logo_url: null }); toast('Default logo restored.'); tabSettings(); }
  catch (e) { toast(errMsg(e), 'error'); }
};
actions['save-branding'] = (form) => busy($('button[type=submit]', form), async () => {
  const fd = new FormData(form);
  const name = String(fd.get('site_name')).trim();
  if (!name) return toast('Enter a site name.', 'error');
  try {
    const patch = {
      site_name: name, tagline: String(fd.get('tagline')).trim(), academic_term: String(fd.get('academic_term')).trim(),
      footer_text: String(fd.get('footer_text')).trim(), hero_title: String(fd.get('hero_title')).trim() || DEFAULT_SETTINGS.hero_title,
      hero_subtitle: String(fd.get('hero_subtitle')).trim()
    };
    if (AD.pendingLogo) patch.logo_url = await uploadImage('branding', AD.pendingLogo, 2, true);
    await saveSettings(patch);
    AD.pendingLogo = null;
    toast('Site settings saved.');
  } catch (e) { toast(errMsg(e), 'error'); }
});

function listEditorHTML(key, label, placeholder) {
  const items = S.settings[key] || [];
  return `<h3 class="font-semibold text-sm mb-2">${label}</h3>
    <form data-submit="list-add" data-key="${key}" class="flex gap-2 mb-3"><input name="v" class="field field-sm" maxlength="60" placeholder="${esc(placeholder)}" aria-label="Add to ${esc(label)}">
      <button class="btn btn-primary btn-sm" type="submit">Add</button></form>
    <div class="flex flex-wrap gap-2">${items.map((it, i) => `<span class="chip chip-outline !pr-1.5">${esc(it)}
      <button type="button" class="w-5 h-5 rounded-full hover:bg-muted flex items-center justify-center" data-action="list-remove" data-key="${key}" data-i="${i}" aria-label="Remove ${esc(it)}">${icon('close', '!text-[14px]')}</button></span>`).join('') || '<span class="text-sm text-ink2">Nothing added yet.</span>'}</div>`;
}
const refreshList = (key) => { const l = LISTS.find((x) => x[0] === key); $('#list-' + key).innerHTML = listEditorHTML(key, l[1], l[2]); };
actions['list-add'] = async (form) => {
  const key = form.dataset.key;
  const v = String(new FormData(form).get('v')).trim();
  if (!v) return;
  const items = S.settings[key] || [];
  if (items.some((x) => x.toLowerCase() === v.toLowerCase())) return toast(`"${v}" is already in the list.`, 'error');
  try { await saveSettings({ [key]: [...items, v] }); refreshList(key); }
  catch (e) { toast(errMsg(e), 'error'); }
};
actions['list-remove'] = async (el) => {
  const key = el.dataset.key;
  try { await saveSettings({ [key]: (S.settings[key] || []).filter((_, i) => i !== Number(el.dataset.i)) }); refreshList(key); }
  catch (e) { toast(errMsg(e), 'error'); }
};
actions['enroll-fields-save'] = (el) => busy(el, async () => {
  const fields = toSaved(AD.bld.enroll);
  if (!checkFields(fields)) return;
  try { await saveSettings({ enroll_fields: fields }); toast('Enrollment fields saved.'); }
  catch (e) { toast(errMsg(e), 'error'); }
});
actions['change-password'] = (form) => busy($('button[type=submit]', form), async () => {
  const fd = new FormData(form);
  const a = String(fd.get('pw1')), b = String(fd.get('pw2'));
  if (a.length < 8) return toast('Use at least 8 characters.', 'error');
  if (a !== b) return toast('The two passwords do not match.', 'error');
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) return toast(error.message, 'error');
  form.reset(); toast('Password updated.');
});
