# RentCheck

RentCheck is a renter maintenance-request tool. Renters create an account, add
their address and landlord contact info, submit maintenance requests (with a
category, description, and photo), and track each request's status and
timeline through to resolution and a landlord rating.

Built with React + Vite, Tailwind CSS, and Supabase (Postgres, Auth, Storage,
Edge Functions).

## Features

- Email/password auth (Supabase Auth)
- Renter profile with address + landlord contact info
- Submit maintenance requests: category, description, optional photo
- Every request is timestamped and shows a full timeline of activity
  (submitted, landlord notified, status changes, resolved, rated)
- Mark a request resolved
- Rate your landlord (1–5 stars + optional comment) once a request is resolved
- Landlord SMS notification on submit via Twilio (property address, category,
  description, timestamp) — see [SMS notifications](#sms-notifications) below
- Landlord email notification hook on submit (currently a stub — see
  [Email notifications](#email-notifications) below)

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In **Settings → API**, copy the **Project URL** and **anon public** key.

## 2. Configure the app

```bash
cp .env.example .env
```

Fill in `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

## 3. Set up the database

Open your Supabase project's **SQL Editor** and run the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

This creates:

- `profiles`, `properties`, `landlords`, `maintenance_requests`,
  `request_events` (timeline), `ratings` tables, all with row-level security
  scoped to the signed-in renter
- A trigger that creates a `profiles` row automatically on signup
- Triggers that automatically log timeline events (`submitted`,
  `status_changed`, `rated`)
- A public `request-photos` Storage bucket with policies that let a renter
  upload/manage photos only inside their own `<user-id>/` folder

If you'd rather use the CLI:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

## 4. Install dependencies and run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## SMS notifications

When a renter submits a request, the app calls a Supabase Edge Function,
`notify-landlord` (see [`supabase/functions/notify-landlord`](supabase/functions/notify-landlord/index.ts)),
which texts the landlord's phone number via [Twilio](https://www.twilio.com/)
with the property address, category, description, and a timestamp.

**Credentials go in Supabase Edge Function secrets, never in `.env`.**
Anything in `.env` prefixed `VITE_` is bundled straight into the JavaScript
the browser downloads — a Twilio auth token there would be visible to
anyone who opens dev tools. Edge Function secrets, by contrast, are only
ever readable by code running on Supabase's servers.

Set up SMS delivery:

1. Get your Account SID, Auth Token, and a Twilio phone number from the
   [Twilio console](https://console.twilio.com/).
2. Log in and link the CLI to your project, if you haven't already:
   ```bash
   supabase login
   supabase link --project-ref your-project-ref
   ```
3. Set the secrets (run this from your machine's terminal — it talks to
   Supabase directly, nothing here touches your repo or `.env`):
   ```bash
   supabase secrets set \
     TWILIO_ACCOUNT_SID=your-account-sid \
     TWILIO_AUTH_TOKEN=your-auth-token \
     TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
   ```
4. Deploy the function:
   ```bash
   supabase functions deploy notify-landlord
   ```

Landlord phone numbers are stored as free text (whatever the renter typed
in Onboarding/Settings) and normalized to E.164 before sending, assuming a
US/Canada number when no country code is given — see `toE164()` in the
function if your landlords are outside the US. If a landlord has no phone
number on file, or it doesn't look like a valid number, the SMS is skipped
and that's recorded on the request's timeline instead of failing silently.

If you ever suspect a Twilio credential has leaked (e.g. pasted somewhere
it shouldn't have been), regenerate the Auth Token from the Twilio console
and re-run `supabase secrets set` with the new value — old requests signed
with the previous token stop working immediately.

## Email notifications

When a renter submits a request, the app calls a Supabase Edge Function,
`notify-landlord` (see [`supabase/functions/notify-landlord`](supabase/functions/notify-landlord/index.ts)),
passing the new request's id.

**As shipped, this function is a stub**: it looks up the request, property,
and landlord, logs the email it *would* send, and records a
`landlord_notified` timeline event — but it does not call a real email
provider yet. That was a deliberate choice so you can drop in whichever
provider you use.

To wire up real email delivery:

1. Pick a provider (e.g. [Resend](https://resend.com), SendGrid, Postmark).
2. Deploy the function:
   ```bash
   supabase functions deploy notify-landlord
   ```
3. Set your provider's API key as a secret:
   ```bash
   supabase secrets set RESEND_API_KEY=your-key
   ```
4. Uncomment/adapt the "SEND EMAIL HERE" block inside
   `supabase/functions/notify-landlord/index.ts` to call your provider's API.

By default the app calls this function directly from the browser right after
inserting the request. If you'd rather have Postgres call it server-side
(so it still fires even if the client's request fails), create a **Database
Webhook** in the Supabase dashboard (Database → Webhooks) on `INSERT` for
`public.maintenance_requests`, targeting your deployed function's URL.

## Project structure

```
src/
  components/     Shared UI (Navbar, Timeline, StarRating, StatusBadge, ...)
  context/        AuthContext (Supabase auth session)
  lib/            Supabase client
  pages/          Route-level pages (Login, Signup, Onboarding, Dashboard,
                   NewRequest, RequestDetail, Settings)
  utils/          Categories, date formatting helpers
supabase/
  migrations/     SQL schema + RLS policies + storage bucket
  functions/      notify-landlord Edge Function (real Twilio SMS, stub email)
```

## Data model

- **profiles** — one per renter, mirrors `auth.users`
- **properties** — a renter's address (one per renter in this version)
- **landlords** — contact info tied to a property (one per property)
- **maintenance_requests** — category, description, photo, status
  (`submitted` → `in_progress` → `resolved`), `created_at` timestamp
- **request_events** — timeline entries for a request
- **ratings** — one rating per request, tied to a landlord

## Notes

- Photos are stored in a public Storage bucket (`request-photos`), scoped by
  folder to the uploading renter. Anyone with a photo's URL can view it (this
  keeps landlord-facing links simple); only the renter who uploaded it can
  modify or delete it.
- This build has one property/landlord per renter. Multi-property support
  would mean adding a property picker and changing the `properties.renter_id`
  and `landlords.property_id` unique constraints to allow more than one row
  per renter.
