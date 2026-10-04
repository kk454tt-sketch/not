'use strict';

/* =====================================================================
   PUBLIC PAGES: home, enroll, notices, forms, find matches, student sign-in
   ===================================================================== */
const Cache = { notices: new Map(), forms: new Map() };
const options = (list, placeholder) =>
  `<option value="">${esc(placeholder)}</option>` + (list || []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
const req = '<span class="text-[#B42318]">*</span>';

function pageHeader(title, text) {
  return `<div class="mb-6"><h1 class="font-display text-3xl sm:text-4xl font-bold">${esc(title)}</h1>
    <p class="text-ink2 mt-1 max-w-2xl">${esc(text)}</p></div>`;
}

/* One input, rendered from an admin-defined field {label,type,required,options,placeholder} */
function customFieldHTML(f, name) {
  const r = f.required ? 'required' : '';
  const label = `<label class="label" for="${name}">${esc(f.label)} ${f.required ? req : '<span class="text-ink2 font-normal text-xs">(optional)</span>'}</label>`;
  const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '';
  let input;
  if (f.type === 'select') input = `<select id="${name}" name="${name}" class="field" ${r}>${options(f.options, 'Select…')}</select>`;
  else if (f.type === 'textarea') input = `<textarea id="${name}" name="${name}" class="field" ${r} ${ph}></textarea>`;
  else {
    const t = ['text', 'tel', 'number', 'email', 'date'].includes(f.type) ? f.type : 'text';
    input = `<input id="${name}" name="${name}" type="${t}" class="field" ${r} ${ph}>`;
  }
  return `<div>${label}${input}</div>`;
}

/* ---------------------------------------------------------------------
   HOME
   --------------------------------------------------------------------- */
function noticeCard(n) {
  Cache.notices.set(n.id, n);
  return `<article class="card card-pad flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <span class="chip">${esc(n.target_department)}</span>
      <span class="text-xs text-ink2">${fmtDate(n.created_at)}</span>
    </div>
    ${n.image_url ? `<img src="${esc(n.image_url)}" alt="" loading="lazy" class="w-full h-36 object-cover rounded-xl border border-line">` : ''}
    <h3 class="font-display font-semibold text-lg leading-snug">${esc(n.title)}</h3>
    <p class="text-sm text-ink2 clamp-3 whitespace-pre-line">${esc(n.message)}</p>
    <button class="btn btn-ghost btn-sm self-start !px-0 mt-auto" data-action="open-notice" data-id="${esc(n.id)}">Read notice ${icon('arrow_forward', '!text-base')}</button>
  </article>`;
}

Routes.home = async () => {
  const s = S.settings;
  setApp(`
    <section class="pt-4 pb-10">
      ${s.academic_term ? `<span class="chip mb-5">${esc(s.academic_term)}</span>` : ''}
      <h1 class="font-display font-bold text-4xl sm:text-5xl leading-[1.1] max-w-4xl">${esc(s.hero_title)}</h1>
      <p class="text-lg text-ink2 mt-4 max-w-2xl">${esc(s.hero_subtitle)}</p>
      <div class="flex flex-wrap gap-3 mt-8">
        <a href="#/enroll" class="btn btn-primary !py-3 !px-5">Start enrollment ${icon('arrow_forward')}</a>
        <a href="#/notices" class="btn btn-outline !py-3 !px-5">View notices ${icon('notifications', 'text-ink2')}</a>
      </div>
    </section>
    <section id="home-stats" class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">${Array.from({ length: 4 }, () => '<div class="skeleton h-32"></div>').join('')}</section>

    <section class="mb-12">
      <h2 class="font-display text-2xl font-semibold mb-4">How it works</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${[
          ['1', 'how_to_reg', 'Enroll', 'Fill in your details and upload a photo. The admin office sees your registration straight away.', 'enroll', 'Go to enrollment'],
          ['2', 'assignment', 'Read notices, fill forms', 'Check announcements for your department and submit forms requested by your faculty.', 'notices', 'See notices'],
          ['3', 'diversity_3', 'Find classmates', 'Choose your hobbies and what you are looking for. Classmates are ranked by what you share.', 'matches', 'Find matches']
        ].map(([n, ic, t, d, to, cta]) => `
          <div class="card card-pad flex flex-col">
            <div class="flex items-center justify-between mb-5"><span class="chip">Step ${n}</span>${icon(ic, 'text-ink2')}</div>
            <h3 class="font-display font-semibold text-lg mb-1">${t}</h3>
            <p class="text-sm text-ink2 mb-5">${d}</p>
            <a href="#/${to}" class="mt-auto inline-flex items-center gap-1 text-sm font-semibold hover:underline">${cta} ${icon('arrow_forward', '!text-base')}</a>
          </div>`).join('')}
      </div>
    </section>

    <section>
      <div class="flex items-end justify-between mb-4">
        <h2 class="font-display text-2xl font-semibold">Recent notices</h2>
        <a href="#/notices" class="text-sm font-semibold hover:underline inline-flex items-center gap-1">View all ${icon('arrow_forward', '!text-base')}</a>
      </div>
      <div id="home-notices" class="grid grid-cols-1 md:grid-cols-3 gap-4">${Array.from({ length: 3 }, () => '<div class="skeleton h-44"></div>').join('')}</div>
    </section>`);

  const [stats, notices] = await Promise.all([
    sb.rpc('get_public_stats'),
    sb.from('notices').select('*').order('created_at', { ascending: false }).limit(3)
  ]);
  const st = stats.data || { students: 0, departments: 0, notices: 0, matches: 0 };
  const stat = (label, val, sub, ic) => `<div class="card card-pad flex flex-col justify-between gap-6">
      <div class="flex items-center justify-between"><span class="text-sm text-ink2 font-medium">${label}</span>${icon(ic, 'text-ink2')}</div>
      <div><div class="font-display text-4xl font-bold">${Number(val).toLocaleString()}</div><div class="text-sm text-ink2 mt-1">${sub}</div></div></div>`;
  const statsEl = $('#home-stats');
  if (statsEl) statsEl.innerHTML =
    stat('Students', st.students, 'Enrolled so far', 'group') +
    stat('Departments', st.departments, 'Academic departments', 'apartment') +
    stat('Notices', st.notices, 'Published', 'campaign') +
    stat('Match profiles', st.matches, 'Looking for classmates', 'hub');
  const nEl = $('#home-notices');
  if (nEl) nEl.innerHTML = (notices.data && notices.data.length)
    ? notices.data.map(noticeCard).join('')
    : emptyState('No notices yet', 'Announcements from the admin office will show up here.');
};

/* ---------------------------------------------------------------------
   ENROLL
   --------------------------------------------------------------------- */
Routes.enroll = async () => {
  const s = S.settings;
  const fields = s.enroll_fields || [];
  setApp(`<div class="max-w-2xl mx-auto">
    <div class="card card-pad sm:!p-8">
      ${s.academic_term ? `<span class="chip mb-4">${esc(s.academic_term)}</span>` : ''}
      <h1 class="font-display text-3xl font-bold">Student enrollment</h1>
      <p class="text-ink2 mt-1">Enter your details to register for the academic session.</p>
      <hr class="border-line my-6">
      <form data-submit="enroll-submit" class="space-y-5" novalidate>
        <div class="flex items-center gap-4 bg-canvas rounded-2xl p-4">
          <div id="enroll-photo-preview" class="w-20 h-20 rounded-full bg-white border border-line flex items-center justify-center overflow-hidden shrink-0">${icon('photo_camera', 'text-ink2 !text-3xl')}</div>
          <div class="min-w-0">
            <label for="enroll-photo" class="btn btn-outline btn-sm cursor-pointer">${icon('upload', '!text-base')} Upload photo ${req}</label>
            <input id="enroll-photo" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" data-change="enroll-photo">
            <p class="hint">JPG, PNG or WebP, up to 3 MB. Front facing, plain background.</p>
          </div>
        </div>
        <div><label class="label" for="enroll-name">Full name ${req}</label>
          <input id="enroll-name" name="name" class="field" maxlength="120" placeholder="e.g. Alex Rivera" required></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label class="label" for="enroll-dept">Department ${req}</label>
            <select id="enroll-dept" name="department" class="field" required>${options(s.departments, 'Select department')}</select></div>
          <div><label class="label" for="enroll-year">Academic year ${req}</label>
            <select id="enroll-year" name="year" class="field" required>${options(s.years, 'Select year')}</select></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label class="label" for="enroll-ig">Instagram <span class="text-ink2 font-normal text-xs">(optional)</span></label>
            <input id="enroll-ig" name="instagram" class="field" maxlength="60" placeholder="@username"></div>
          <div><label class="label" for="enroll-wa">WhatsApp <span class="text-ink2 font-normal text-xs">(optional, admin only)</span></label>
            <input id="enroll-wa" name="whatsapp" type="tel" class="field" maxlength="30" placeholder="+91 98765 43210"></div>
        </div>
        ${fields.length ? `<div class="bg-canvas rounded-2xl p-4 space-y-4">${fields.map((f, i) => customFieldHTML(f, 'cf_' + i)).join('')}</div>` : ''}
        <button type="submit" class="btn btn-primary w-full !py-3.5">Submit enrollment</button>
        <p class="hint text-center">Your phone number is only visible to the admin office.</p>
      </form>
    </div></div>`);
};

actions['enroll-photo'] = (input) => previewImage(input, $('#enroll-photo-preview'), 3);

actions['enroll-submit'] = (form) => busy($('button[type=submit]', form), async () => {
  const fd = new FormData(form);
  const file = $('#enroll-photo').files[0];
  const name = String(fd.get('name') || '').trim();
  const wa = String(fd.get('whatsapp') || '').trim();
  if (!file) return toast('Upload your photo to continue.', 'error');
  if (!name || !fd.get('department') || !fd.get('year')) return toast('Fill in name, department and year.', 'error');
  if (wa && !/^\+?[0-9()\-\s]{7,20}$/.test(wa)) return toast('Enter a valid WhatsApp number, like +91 98765 43210.', 'error');
  const fields = S.settings.enroll_fields || [];
  const custom = {};
  for (let i = 0; i < fields.length; i++) {
    const v = String(fd.get('cf_' + i) || '').trim();
    if (fields[i].required && !v) return toast(`"${fields[i].label}" is required.`, 'error');
    custom[fields[i].label] = v;
  }
  try {
    const photo_url = await uploadImage('student-photos', file, 3);
    const { error } = await sb.from('students').insert({
      name, photo_url, department: fd.get('department'), year: fd.get('year'),
      instagram: igHandle(fd.get('instagram')) || null, whatsapp: wa || null, custom_answers: custom
    });
    if (error) throw error;
    setApp(`<div class="max-w-xl mx-auto card card-pad text-center py-12">
      <div class="mx-auto w-14 h-14 rounded-full bg-ink text-white flex items-center justify-center mb-4">${icon('check', '!text-3xl')}</div>
      <h1 class="font-display text-2xl font-bold">Enrollment received</h1>
      <p class="text-ink2 mt-2">${esc(name)}, you are registered in ${esc(fd.get('department'))}, ${esc(fd.get('year'))}.</p>
      <div class="flex flex-wrap justify-center gap-3 mt-6">
        <a href="#/notices" class="btn btn-primary">View notices</a>
        <button class="btn btn-outline" data-action="reload">Enroll another student</button>
      </div></div>`);
    window.scrollTo(0, 0);
  } catch (e) { toast(errMsg(e), 'error'); }
});

/* ---------------------------------------------------------------------
   NOTICES (search, filter, sort, pagination)
   --------------------------------------------------------------------- */
const NS = { all: [], q: '', dept: '', sort: 'new', page: 1, per: 9 };

Routes.notices = async () => {
  NS.q = ''; NS.dept = ''; NS.sort = 'new'; NS.page = 1;
  setApp(`
    ${pageHeader('Notices', 'Announcements from the admin office and your departments.')}
    <div class="card p-3 sm:p-4 grid grid-cols-1 md:grid-cols-[1fr_220px_180px] gap-3 mb-6">
      <div class="relative">${icon('search', 'absolute left-3.5 top-1/2 -translate-y-1/2 text-ink2')}
        <input class="field !pl-11" placeholder="Search notices" aria-label="Search notices" data-input="notice-filter" id="nf-q"></div>
      <select class="field" aria-label="Department" data-change="notice-filter" id="nf-dept">${options(S.settings.departments, 'All departments')}</select>
      <select class="field" aria-label="Sort" data-change="notice-filter" id="nf-sort"><option value="new">Newest first</option><option value="old">Oldest first</option></select>
    </div>
    <div id="notice-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${Array.from({ length: 3 }, () => '<div class="skeleton h-44"></div>').join('')}</div>
    <div id="notice-pager" class="mt-6"></div>`);
  const { data, error } = await sb.from('notices').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  NS.all = data || [];
  renderNoticeList();
};

actions['notice-filter'] = () => {
  NS.q = $('#nf-q').value.trim().toLowerCase();
  NS.dept = $('#nf-dept').value;
  NS.sort = $('#nf-sort').value;
  NS.page = 1;
  renderNoticeList();
};

function renderNoticeList() {
  let list = NS.all.filter((n) =>
    (!NS.q || (n.title + ' ' + n.message).toLowerCase().includes(NS.q)) &&
    (!NS.dept || NS.dept === 'All Departments' || n.target_department === NS.dept || n.target_department === 'All Departments'));
  if (NS.sort === 'old') list = list.slice().reverse();
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / NS.per));
  NS.page = Math.min(NS.page, pages);
  const from = (NS.page - 1) * NS.per;
  const slice = list.slice(from, from + NS.per);
  $('#notice-grid').innerHTML = slice.length
    ? slice.map(noticeCard).join('')
    : emptyState(NS.all.length ? 'No notices match your search' : 'No notices yet',
        NS.all.length ? 'Try a different keyword or department.' : 'Announcements from the admin office will show up here.');
  $('#notice-pager').innerHTML = total > NS.per ? `<div class="card p-3 flex items-center justify-between gap-3">
      <button class="btn btn-ghost btn-sm" data-action="notice-page" data-dir="-1" ${NS.page === 1 ? 'disabled' : ''}>${icon('chevron_left', '!text-base')} Previous</button>
      <span class="text-sm text-ink2">Showing ${from + 1}–${from + slice.length} of ${total}</span>
      <button class="btn btn-ghost btn-sm" data-action="notice-page" data-dir="1" ${NS.page === pages ? 'disabled' : ''}>Next ${icon('chevron_right', '!text-base')}</button>
    </div>` : '';
}
actions['notice-page'] = (el) => { NS.page += Number(el.dataset.dir); renderNoticeList(); window.scrollTo(0, 0); };

actions['open-notice'] = (el) => {
  const n = Cache.notices.get(el.dataset.id);
  if (!n) return;
  openModal(`<div class="flex items-center gap-2 mb-3 pr-10"><span class="chip">${esc(n.target_department)}</span><span class="text-xs text-ink2">${fmtDate(n.created_at)}</span></div>
    <h2 class="font-display text-2xl font-bold leading-tight">${esc(n.title)}</h2>
    ${n.image_url ? `<img src="${esc(n.image_url)}" alt="" class="w-full max-h-72 object-cover rounded-2xl border border-line mt-4">` : ''}
    <p class="text-ink mt-4 whitespace-pre-line leading-relaxed">${esc(n.message)}</p>`);
};

/* ---------------------------------------------------------------------
   FORMS
   --------------------------------------------------------------------- */
Routes.forms = async () => {
  setApp(`${pageHeader('Forms', 'Requests and applications from your faculty or the admin office.')}
    <div id="forms-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4">${Array.from({ length: 2 }, () => '<div class="skeleton h-40"></div>').join('')}</div>`);
  const { data, error } = await sb.from('forms').select('*').eq('is_active', true).order('created_at', { ascending: false });
  if (error) throw error;
  (data || []).forEach((f) => Cache.forms.set(f.id, f));
  $('#forms-grid').innerHTML = (data && data.length) ? data.map((f) => `
    <article class="card card-pad flex flex-col gap-3">
      <div class="flex items-center justify-between"><span class="chip">${(f.fields || []).length} field${(f.fields || []).length === 1 ? '' : 's'}</span>${icon('assignment', 'text-ink2')}</div>
      <h3 class="font-display font-semibold text-xl">${esc(f.title)}</h3>
      <p class="text-sm text-ink2">${esc(f.description) || 'No description.'}</p>
      <button class="btn btn-primary self-start mt-2" data-action="open-form" data-id="${esc(f.id)}">Fill form</button>
    </article>`).join('') : emptyState('No forms right now', 'When the admin office publishes a form, it will appear here.');
};

actions['open-form'] = (el) => {
  const f = Cache.forms.get(el.dataset.id);
  if (!f) return;
  openModal(`<h2 class="font-display text-2xl font-bold pr-10">${esc(f.title)}</h2>
    <p class="text-sm text-ink2 mt-1">${esc(f.description)}</p>
    <form data-submit="form-submit" data-id="${esc(f.id)}" class="space-y-4 mt-6" novalidate>
      ${(f.fields || []).map((fld, i) => customFieldHTML(fld, 'f_' + i)).join('')}
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Submit form</button>
      </div></form>`);
};

actions['form-submit'] = (form) => busy($('button[type=submit]', form), async () => {
  const f = Cache.forms.get(form.dataset.id);
  const fd = new FormData(form);
  const answers = [];
  for (let i = 0; i < (f.fields || []).length; i++) {
    const v = String(fd.get('f_' + i) || '').trim();
    if (f.fields[i].required && !v) return toast(`"${f.fields[i].label}" is required.`, 'error');
    answers.push({ label: f.fields[i].label, value: v });
  }
  const { error } = await sb.from('form_responses').insert({ form_id: f.id, answers });
  if (error) return toast(errMsg(error), 'error');
  closeModal();
  toast('Form submitted.');
});

/* ---------------------------------------------------------------------
   FIND MATCHES
   --------------------------------------------------------------------- */
Routes.matches = async () => {
  const s = S.settings;
  setApp(`
    ${pageHeader('Find matches', 'Find classmates with similar hobbies and goals.')}
    <div class="card card-pad flex gap-3 items-start mb-6">
      <div class="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center shrink-0">${icon('lock')}</div>
      <div><h2 class="font-display font-semibold">Your private details stay private</h2>
        <p class="text-sm text-ink2 mt-0.5">Your WhatsApp number and gender are never shown to other students. Only the admin office can see them. Your name, photo, department, year, hobbies and Instagram handle appear on your match card.</p></div>
    </div>
    <div class="card card-pad sm:!p-8">
      <h2 class="font-display text-2xl font-semibold mb-6">Your match profile</h2>
      <form data-submit="match-submit" class="space-y-6" novalidate>
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
          <div class="flex lg:flex-col items-center lg:items-start gap-4">
            <div id="match-photo-preview" class="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-canvas border border-line flex items-center justify-center overflow-hidden shrink-0">${icon('photo_camera', 'text-ink2 !text-3xl')}</div>
            <div><label for="match-photo" class="btn btn-outline btn-sm cursor-pointer">${icon('upload', '!text-base')} Add photo</label>
              <input id="match-photo" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" data-change="match-photo">
              <p class="hint">Optional, up to 3 MB</p></div>
          </div>
          <div class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label class="label" for="m-name">Your name ${req}</label><input id="m-name" name="name" class="field" maxlength="120" required></div>
              <div><label class="label" for="m-gender">Gender ${req} <span class="chip chip-outline !py-0.5 ml-1">Private</span></label>
                <select id="m-gender" name="gender" class="field" required><option value="">Select</option><option>Male</option><option>Female</option><option>Other / Prefer not to say</option></select></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label class="label" for="m-dept">Department ${req}</label><select id="m-dept" name="department" class="field" required>${options(s.departments, 'Select department')}</select></div>
              <div><label class="label" for="m-year">Academic year ${req}</label><select id="m-year" name="year" class="field" required>${options(s.years, 'Select year')}</select></div>
            </div>
            <div><label class="label" for="m-look">What are you looking for? ${req}</label><select id="m-look" name="looking_for" class="field" required>${options(s.looking_for, 'Select')}</select></div>
            <div><span class="label">Hobbies and interests ${req}</span>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Hobbies">
                ${(s.hobbies || []).map((h) => `<label class="chip chip-toggle"><input type="checkbox" name="hobby" value="${esc(h)}" class="sr-only" data-change="toggle-chip">${esc(h)}</label>`).join('') || '<p class="text-sm text-ink2">The admin has not added hobby options yet.</p>'}
              </div></div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label class="label" for="m-ig">Instagram <span class="chip chip-outline !py-0.5 ml-1">Shown on your card</span></label><input id="m-ig" name="instagram" class="field" maxlength="60" placeholder="@username"></div>
              <div><label class="label" for="m-wa">WhatsApp ${req} <span class="chip chip-outline !py-0.5 ml-1">Admin only</span></label><input id="m-wa" name="whatsapp" type="tel" class="field" maxlength="30" placeholder="+91 98765 43210" required></div>
            </div>
          </div>
        </div>
        <div class="flex justify-end"><button type="submit" class="btn btn-primary !py-3 !px-6">Save and find matches ${icon('arrow_forward')}</button></div>
      </form>
    </div>
    <section id="match-results" class="mt-10 hidden"></section>`);
};

actions['match-photo'] = (input) => previewImage(input, $('#match-photo-preview'), 3);
actions['toggle-chip'] = (input) => input.closest('label').classList.toggle('on', input.checked);

actions['match-submit'] = (form) => busy($('button[type=submit]', form), async () => {
  const fd = new FormData(form);
  const hobbies = $$('input[name=hobby]:checked', form).map((i) => i.value);
  const wa = String(fd.get('whatsapp') || '').trim();
  const name = String(fd.get('name') || '').trim();
  if (!name || !fd.get('gender') || !fd.get('department') || !fd.get('year') || !fd.get('looking_for'))
    return toast('Fill in all required fields.', 'error');
  if (!hobbies.length) return toast('Select at least one hobby.', 'error');
  if (!/^\+?[0-9()\-\s]{7,20}$/.test(wa)) return toast('Enter a valid WhatsApp number, like +91 98765 43210.', 'error');
  try {
    const file = $('#match-photo').files[0];
    const photo = file ? await uploadImage('student-photos', file, 3) : null;
    const { data, error } = await sb.rpc('submit_match_profile', {
      p_name: name, p_gender: fd.get('gender'), p_department: fd.get('department'), p_year: fd.get('year'),
      p_photo_url: photo, p_hobbies: hobbies, p_looking_for: fd.get('looking_for'),
      p_instagram: igHandle(fd.get('instagram')), p_whatsapp: wa
    });
    if (error) throw error;
    showMatches(data || [], hobbies.length);
    toast('Profile saved. Here are your matches.');
  } catch (e) { toast(errMsg(e), 'error'); }
});

function showMatches(list, myHobbyCount) {
  const max = 2 * myHobbyCount + 5;           // best possible score for this profile
  const box = $('#match-results');
  box.classList.remove('hidden');
  box.innerHTML = `<div class="flex items-end justify-between mb-4 flex-wrap gap-2">
      <h2 class="font-display text-2xl font-semibold">Your matches ${list.length ? `<span class="chip chip-dark ml-2 align-middle">${list.length}</span>` : ''}</h2>
      <p class="text-sm text-ink2">Shared hobbies +2, same goal +3, same department +1, same year +1</p></div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${list.length ? list.map((m, i) => {
      const pct = Math.min(100, Math.round((m.score / max) * 100));
      const ig = igHandle(m.instagram);
      return `<article class="card card-pad flex flex-col gap-4">
        <div class="flex items-start gap-3">
          ${avatar(m.photo_url, m.name, 'w-14 h-14', 'text-base')}
          <div class="min-w-0 flex-1"><h3 class="font-display font-semibold text-lg leading-tight truncate">${esc(m.name)}</h3>
            <p class="text-sm text-ink2 truncate">${esc(m.department)} · ${esc(m.year)}</p></div>
          <span class="chip ${i === 0 ? 'chip-dark' : ''} shrink-0">${pct}% match</span>
        </div>
        <div><p class="text-xs text-ink2 font-semibold mb-1">Looking for</p><p class="text-sm font-semibold">${esc(m.looking_for)}</p></div>
        <div><p class="text-xs text-ink2 font-semibold mb-1.5">Hobbies</p><div class="flex flex-wrap gap-1.5">
          ${(m.hobbies || []).map((h) => `<span class="chip ${(m.shared_hobbies || []).includes(h) ? 'chip-dark' : 'chip-outline'}">${esc(h)}</span>`).join('')}</div></div>
        <div class="mt-auto pt-3 border-t border-line flex items-center justify-between text-sm">
          <span class="text-ink2">Instagram</span>
          ${ig ? `<a class="font-semibold hover:underline inline-flex items-center gap-1" href="https://instagram.com/${ig}" target="_blank" rel="noopener noreferrer">@${ig} ${icon('open_in_new', '!text-base')}</a>` : '<span class="text-ink2">Not shared</span>'}
        </div></article>`;
    }).join('') : emptyState('You are the first profile', 'Matches will appear as more classmates join. Check back soon.')}</div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------------------------------------------------------------
   STUDENT SIGN-IN (optional, Google)
   --------------------------------------------------------------------- */
Routes.login = async () => {
  const s = S.settings;
  const domain = String(CFG.ALLOWED_EMAIL_DOMAIN || '').replace(/^@/, '');
  const body = S.session ? `
      <h1 class="font-display text-2xl font-bold">You are signed in</h1>
      <p class="text-ink2 mt-2 break-all">${esc(S.session.user.email)}</p>
      <button class="btn btn-outline w-full mt-6" data-action="sign-out">Sign out</button>`
    : `<h1 class="font-display text-2xl font-bold">Student sign-in</h1>
      <p class="text-ink2 mt-2">${domain ? `Sign in with your <b>@${esc(domain)}</b> Google account.` : 'Sign in with your Google account.'}
        Signing in is optional. You can enroll, read notices and find matches without it. If you sign in, your email is saved with what you submit.</p>
      <button class="btn btn-outline w-full !py-3.5 mt-6" data-action="google-login">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
        Sign in with Google</button>
      <p class="hint text-center mt-4">Are you an admin? <a class="font-semibold underline" href="#/admin">Admin sign-in</a></p>`;
  setApp(`<div class="max-w-md mx-auto pt-6"><div class="text-center mb-6 font-display font-bold text-xl">${brandHTML(s.site_name)}</div>
    <div class="card card-pad sm:!p-8">${body}</div></div>`);
};

actions['google-login'] = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) toast(errMsg(error), 'error');
};
