# Bachelor.com student portal (Supabase)

Static website (HTML + JS) with a Supabase backend. Nothing is stored in the
browser except the Supabase login token. Students, notices, forms, match
profiles, site name, logo, and every dropdown option live in your Supabase project.

## Setup (about 10 minutes)

1. **Create a project** at https://supabase.com (free plan is fine).
2. **Create the database.** Supabase Dashboard > SQL Editor > New query, paste all of
   `supabase/schema.sql`, click Run. It creates the tables, security rules, image buckets and defaults.
3. **Create your admin login.** Dashboard > Authentication > Users > Add user > Create new user
   (email + password, tick "Auto Confirm User").
4. **Make that user an admin.** SQL Editor, run (use your email):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'YOUR-EMAIL@example.com';
   ```
5. **Connect the site.** Dashboard > Project Settings > API. Copy the **Project URL** and the
   **anon public** key into `config.js`. Never use the `service_role` key here.
6. **Run it.** Do not double-click index.html. Serve the folder, for example
   `npx serve .` or the VS Code "Live Server" extension. To publish, drag the folder onto
   Netlify Drop, or use Vercel / GitHub Pages / Cloudflare Pages.
7. Open the site, click **Admin**, sign in. In **Settings** you can change the site name,
   upload a logo, edit the home page text, and manage departments, years, hobbies and extra enrollment fields.

## Optional: Google sign-in for students
Students do not need an account. If you want the "Sign in with Google" page to work:
Authentication > Providers > Google (add your Google OAuth client ID and secret), then
Authentication > URL Configuration > set Site URL to `https://bachelorcom-ten.vercel.app/`
and add `https://bachelorcom-ten.vercel.app/` to Redirect URLs. In Google Cloud Console,
add `https://rscyxdficmsxeujxyroq.supabase.co/auth/v1/callback` as an authorized redirect URI
for the OAuth client. `config.js` sends the Google sign-in return to the Vercel URL.
Set `ALLOWED_EMAIL_DOMAIN` in `config.js` to limit sign-in to one email domain.
That limit only controls who can sign in. It does not restrict enrollment or forms, which stay open to everyone.

## How privacy works
- `match_profiles` (gender, WhatsApp) has **no public access**. Students call a database function that saves
  the profile and returns only safe fields (never gender or WhatsApp).
- Students, form responses and match profiles can only be read, edited or deleted by users listed in `admins`.
  This is enforced by Supabase Row Level Security, not just hidden in the page.
- The admin password is handled by Supabase Auth. It is not in the code.

## Good to know
- Admin tables show the latest 1,000 rows. Use "Export CSV" for the filtered list.
- Anyone can enroll, submit a form or upload a student photo (that is the point of a public form).
  If you get spam, add rate limiting or a CAPTCHA in front of the site, or require sign-in.
- Deleting a student removes the database row, not the photo file. Remove old photos from
  Storage > student-photos when needed.
- WhatsApp bulk messaging: browsers allow one chat per click, so the admin gets an "Open chat" link for each student.

## Files
- `index.html`, `js/core.js`, `js/public.js`, `js/admin.js`: the website
- `config.js`: your Supabase URL and key
- `assets/`: default logo (your Bachelor.com mark)
- `supabase/schema.sql`: database, security rules, storage
