-- =====================================================================
--  Bachelor.com student portal : Supabase schema
--  Run this whole file once in  Supabase Dashboard > SQL Editor > New query
--  Safe to run again (it is idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- One row only (id = 1). Holds site name, logo, texts and dropdown options.
create table if not exists public.site_settings (
  id             int primary key default 1 check (id = 1),
  site_name      text not null default 'Bachelor.com',
  tagline        text not null default 'Student portal',
  logo_url       text,
  hero_title     text not null default 'Everything you need for your campus journey.',
  hero_subtitle  text not null default 'Enroll, read notices, fill forms and find classmates in one place.',
  academic_term  text not null default 'Academic Term 2026–2027',
  footer_text    text not null default '',
  departments    text[] not null default '{}',
  years          text[] not null default '{}',
  hobbies        text[] not null default '{}',
  looking_for    text[] not null default '{}',
  enroll_fields  jsonb  not null default '[]'::jsonb,
  updated_at     timestamptz not null default now()
);

insert into public.site_settings (id, departments, years, hobbies, looking_for, enroll_fields)
values (
  1,
  array['Computer Science','Electrical Engineering','Mechanical Engineering','Business Administration','Biotechnology'],
  array['1st Year','2nd Year','3rd Year','4th Year'],
  array['Coding','Basketball','Gaming','Photography','Music','Reading','Gym & Fitness','Graphic Design','Chess','Cricket'],
  array['Study buddy','Project partner','Gym buddy','New friends','Hackathon team'],
  '[
    {"id":"roll_no","label":"Student roll / ID number","type":"text","required":true,"placeholder":"e.g. BC-2026-8842"},
    {"id":"residence","label":"Residence","type":"select","required":true,"options":["Hostel","Day scholar"]}
  ]'::jsonb
)
on conflict (id) do nothing;

-- People who can use the admin panel (linked to Supabase Auth users).
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  photo_url      text,
  department     text not null check (char_length(department) <= 120),
  year           text not null check (char_length(year) <= 60),
  instagram      text check (instagram is null or char_length(instagram) <= 60),
  whatsapp       text check (whatsapp is null or char_length(whatsapp) <= 30),
  custom_answers jsonb not null default '{}'::jsonb,
  user_id        uuid default auth.uid() references auth.users(id) on delete set null,
  email          text default (auth.jwt() ->> 'email'),
  created_at     timestamptz not null default now()
);

create table if not exists public.notices (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(btrim(title)) between 1 and 200),
  message           text not null,
  image_url         text,
  target_department text not null default 'All Departments',
  created_at        timestamptz not null default now()
);

create table if not exists public.forms (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '',
  fields      jsonb not null default '[]'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.form_responses (
  id               uuid primary key default gen_random_uuid(),
  form_id          uuid not null references public.forms(id) on delete cascade,
  answers          jsonb not null default '[]'::jsonb,
  respondent_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now()
);

-- Contains PRIVATE columns (gender, whatsapp). Nobody except admins can read this table.
create table if not exists public.match_profiles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  gender      text not null,
  department  text not null,
  year        text not null,
  photo_url   text,
  hobbies     text[] not null default '{}',
  looking_for text not null,
  instagram   text check (instagram is null or char_length(instagram) <= 60),
  whatsapp    text not null check (char_length(whatsapp) <= 30),
  user_id     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists students_created_idx on public.students (created_at desc);
create index if not exists notices_created_idx  on public.notices  (created_at desc);
create index if not exists responses_form_idx   on public.form_responses (form_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. HELPER: is the current user an admin?
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.site_settings  enable row level security;
alter table public.admins         enable row level security;
alter table public.students       enable row level security;
alter table public.notices        enable row level security;
alter table public.forms          enable row level security;
alter table public.form_responses enable row level security;
alter table public.match_profiles enable row level security;

-- site_settings: everyone reads, admins edit
drop policy if exists "settings read"  on public.site_settings;
drop policy if exists "settings write" on public.site_settings;
create policy "settings read"  on public.site_settings for select to anon, authenticated using (true);
create policy "settings write" on public.site_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- admins: a signed-in user can only see their own row; nobody can edit from the app
drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins for select to authenticated using (user_id = auth.uid());

-- students: anyone can enroll (insert). Only admins can read, edit, delete.
drop policy if exists "students insert" on public.students;
drop policy if exists "students admin"  on public.students;
create policy "students insert" on public.students for insert to anon, authenticated
  with check (user_id is not distinct from auth.uid() and (email is null or email = auth.jwt() ->> 'email'));
create policy "students admin"  on public.students for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- notices: everyone reads, admins manage
drop policy if exists "notices read"  on public.notices;
drop policy if exists "notices admin" on public.notices;
create policy "notices read"  on public.notices for select to anon, authenticated using (true);
create policy "notices admin" on public.notices for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- forms: everyone reads active forms, admins manage
drop policy if exists "forms read"  on public.forms;
drop policy if exists "forms admin" on public.forms;
create policy "forms read"  on public.forms for select to anon, authenticated using (is_active or public.is_admin());
create policy "forms admin" on public.forms for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- form_responses: anyone can submit to an active form, admins read/delete
drop policy if exists "responses insert" on public.form_responses;
drop policy if exists "responses admin"  on public.form_responses;
create policy "responses insert" on public.form_responses for insert to anon, authenticated
  with check (exists (select 1 from public.forms f where f.id = form_id and f.is_active)
              and (respondent_email is null or respondent_email = auth.jwt() ->> 'email'));
create policy "responses admin"  on public.form_responses for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- match_profiles: NO public access at all. Students go through the function below.
drop policy if exists "matches admin" on public.match_profiles;
create policy "matches admin" on public.match_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. FUNCTIONS (what the public website calls)
-- ---------------------------------------------------------------------

-- Home page counters
create or replace function public.get_public_stats()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'students',    (select count(*) from public.students),
    'departments', (select coalesce(cardinality(departments), 0) from public.site_settings where id = 1),
    'notices',     (select count(*) from public.notices),
    'matches',     (select count(*) from public.match_profiles)
  );
$$;

-- Ranks other profiles for one profile.
-- Score = shared hobbies x2 + same "looking for" x3 + same department x1 + same year x1
-- Only SAFE columns are returned: never gender, never WhatsApp.
create or replace function public.compute_matches(p_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with me as (select * from public.match_profiles where id = p_id)
  select coalesce(jsonb_agg(to_jsonb(t) order by t.score desc, t.created_at desc), '[]'::jsonb)
  from (
    select o.id, o.name, o.photo_url, o.department, o.year, o.looking_for, o.hobbies, o.instagram, o.created_at,
           array(select h from unnest(o.hobbies) h where h = any (me.hobbies)) as shared_hobbies,
           ( 2 * cardinality(array(select h from unnest(o.hobbies) h where h = any (me.hobbies)))
             + case when o.looking_for = me.looking_for then 3 else 0 end
             + case when o.department  = me.department  then 1 else 0 end
             + case when o.year        = me.year        then 1 else 0 end ) as score
    from public.match_profiles o, me
    where o.id <> me.id
    order by score desc, o.created_at desc
    limit 9
  ) t;
$$;

revoke all on function public.compute_matches(uuid) from public, anon, authenticated;

-- Saves a match profile and returns the top matches in one step.
create or replace function public.submit_match_profile(
  p_name text, p_gender text, p_department text, p_year text, p_photo_url text,
  p_hobbies text[], p_looking_for text, p_instagram text, p_whatsapp text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if coalesce(btrim(p_name), '') = '' or char_length(p_name) > 120 then
    raise exception 'Enter your name.';
  end if;
  if p_hobbies is null or cardinality(p_hobbies) = 0 or cardinality(p_hobbies) > 30 then
    raise exception 'Select at least one hobby.';
  end if;
  if coalesce(btrim(p_whatsapp), '') = '' or char_length(p_whatsapp) > 30 then
    raise exception 'Enter a valid WhatsApp number.';
  end if;
  if coalesce(btrim(p_department), '') = '' or coalesce(btrim(p_year), '') = ''
     or coalesce(btrim(p_looking_for), '') = '' or coalesce(btrim(p_gender), '') = '' then
    raise exception 'Fill in all required fields.';
  end if;

  insert into public.match_profiles
    (id, name, gender, department, year, photo_url, hobbies, looking_for, instagram, whatsapp)
  values
    (new_id, btrim(p_name), p_gender, p_department, p_year, nullif(p_photo_url, ''), p_hobbies,
     p_looking_for, nullif(btrim(replace(coalesce(p_instagram, ''), '@', '')), ''), btrim(p_whatsapp));

  return public.compute_matches(new_id);
end;
$$;

grant execute on function public.get_public_stats() to anon, authenticated;
grant execute on function public.submit_match_profile(text,text,text,text,text,text[],text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. STORAGE BUCKETS (images)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('branding',       'branding',       true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('student-photos', 'student-photos', true, 3145728, array['image/png','image/jpeg','image/webp']),
  ('notice-images',  'notice-images',  true, 3145728, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos upload"  on storage.objects;
drop policy if exists "assets admin"   on storage.objects;
-- anyone may upload a student photo (path is a random id, only inside that bucket)
create policy "photos upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'student-photos');
-- admins manage everything in the three buckets
create policy "assets admin" on storage.objects for all to authenticated
  using      (bucket_id in ('branding','student-photos','notice-images') and public.is_admin())
  with check (bucket_id in ('branding','student-photos','notice-images') and public.is_admin());

-- ---------------------------------------------------------------------
-- 6. MAKE YOURSELF ADMIN  (do this AFTER creating your user, see README)
-- ---------------------------------------------------------------------
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'YOUR-EMAIL@example.com';
