# TransRoute PWA — Complete Setup Guide

Everything you need to go from zero to a live, production-ready fleet management system.
**Estimated setup time: 45–60 minutes.**

---

## What You'll Set Up

| Service | Purpose | Cost |
|---|---|---|
| Supabase | Database + Auth + Edge Functions | Free tier |
| Cloudinary | Photo/video storage | Free tier |
| CallMeBot | WhatsApp fault alerts | Free |
| Netlify | Hosting the PWA | Free tier |

---

## Credential Checklist (Get this first)

Before setup, collect these values:

| Key / Secret | Where to get it | Where to set it |
|---|---|---|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | `config.js` |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key | `config.js` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Dashboard → Cloud name | `config.js` |
| `CLOUDINARY_UPLOAD_PRESET` | Cloudinary → Settings → Upload → Upload Presets | `config.js` |
| `FAULT_ALERT_FUNCTION_URL` | Supabase → Edge Functions → `fault-alert` → Invoke URL | `config.js` |
| `CALLMEBOT_PHONE` | Your activated WhatsApp number | Supabase secret (CLI) |
| `CALLMEBOT_APIKEY` | CallMeBot reply after activation message | Supabase secret (CLI) |

> `SUPABASE_ANON_KEY` is safe for frontend use. Never expose Supabase Service Role keys in frontend code.

---

## STEP 1 — Supabase (Database + Auth)

### 1.1 Create a Project

1. Go to **https://app.supabase.com** and sign up / log in
2. Click **"New Project"**
3. Fill in:
   - **Name:** `transroute`
   - **Database Password:** Choose a strong password (save it!)
   - **Region:** Choose the closest to South Africa (e.g. `eu-west-2 London` or `us-east-1`)
4. Click **"Create new project"** — wait ~2 minutes

### 1.2 Get Your API Keys

1. In your project, go to **Settings → API** (left sidebar)
2. Copy these two values — you'll need them in `config.js`:

   | Value | Where to find it | `config.js` key |
   |---|---|---|
   | Project URL | "Project URL" box | `SUPABASE_URL` |
   | `anon` public key | "Project API keys" → `anon` `public` | `SUPABASE_ANON_KEY` |

### 1.3 Run the Database Schema

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open `schema.sql` from this folder, copy the **entire contents**
4. Paste it into the SQL editor
5. Click **"Run"** (or press Ctrl+Enter)
6. You should see "Success. No rows returned."

### 1.4 Create Your First Admin User

1. Go to **Authentication → Users** in the left sidebar
2. Click **"Invite user"** (or **"Add user"**)
3. Enter your admin email address → send invite
4. Check your email and click the link to set your account
5. Go back to **SQL Editor** and run this query to make yourself admin:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE id = (
     SELECT id FROM auth.users WHERE email = 'YOUR_ADMIN_EMAIL_HERE'
   );
   ```
   Replace `YOUR_ADMIN_EMAIL_HERE` with your actual email.

### 1.5 Configure Auth (Magic Links)

1. Go to **Authentication → URL Configuration**
2. Set **"Site URL"** to your Netlify URL (e.g. `https://transroute-yourname.netlify.app`)
   - You can set this after Netlify deployment (Step 4)
   - For now, set it to `http://localhost:3000`
3. Under **"Redirect URLs"**, add:
   - `http://localhost:3000/login.html`
   - `https://YOUR-NETLIFY-SITE.netlify.app/login.html`
4. Go to **Authentication → Email Templates**
5. Customize the "Magic Link" email template with your company name if desired

### 1.6 Disable Email Confirmation (for magic links to work smoothly)

1. Go to **Authentication → Settings**
2. Under "Email Auth", turn **OFF** "Enable email confirmations"
3. Click Save

---

## STEP 2 — Cloudinary (Photo & Video Storage)

### 2.1 Create an Account

1. Go to **https://cloudinary.com** and sign up (free)
2. After signup, you'll see your **Dashboard**

### 2.2 Get Your Cloud Name

1. On the Dashboard, find the **"Cloud name"** (top of the page)
2. Copy it — this goes into `CLOUDINARY_CLOUD_NAME` in `config.js`

### 2.3 Create an Unsigned Upload Preset

> ⚠️ You MUST create an **unsigned** preset — the app uploads directly from the browser without a server signing request.

1. Go to **Settings → Upload** (gear icon in top-right → Upload tab)
2. Scroll down to **"Upload presets"**
3. Click **"Add upload preset"**
4. Set these values:
   - **Preset name:** `transroute_uploads` (remember this exactly!)
   - **Signing mode:** **Unsigned** ← This is critical
   - **Folder:** `transroute` (optional but recommended)
5. Click **"Save"**
6. Copy the preset name into `CLOUDINARY_UPLOAD_PRESET` in `config.js`

---

## STEP 3 — CallMeBot (WhatsApp Fault Alerts)

### 3.1 Activate Your Number

This is a one-time setup per WhatsApp number. The admin's number needs to be activated.

1. Open WhatsApp on your phone
2. Add this number as a contact: **+34 644 66 44 36** (CallMeBot)
3. Send this exact message to that number:
   ```
   I allow callmebot to send me messages
   ```
4. You'll receive a reply with your **API Key** — save it!
   (It looks like: `apikey=123456`)

### 3.2 Get Your Values

| Value | Example | `CALLMEBOT_PHONE` / `CALLMEBOT_APIKEY` |
|---|---|---|
| Your WhatsApp number | `+27821234567` | `CALLMEBOT_PHONE` |
| API Key from CallMeBot | `123456` | `CALLMEBOT_APIKEY` |

### 3.3 Deploy the Edge Function

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```
2. Log in:
   ```bash
   supabase login
   ```
3. Link your project (from the `transroute-pwa` folder):
   ```bash
   supabase link --project-ref YOUR_PROJECT_ID
   ```
   Your project ID is in your Supabase URL: `https://YOUR_PROJECT_ID.supabase.co`

4. Set the secrets for the Edge Function:
   ```bash
   # Option A: single admin recipient (legacy)
   supabase secrets set CALLMEBOT_PHONE=+27821234567
   supabase secrets set CALLMEBOT_APIKEY=123456

   # Option B: multiple admin recipients (recommended)
   supabase secrets set CALLMEBOT_RECIPIENTS='[{"phone":"+27821234567","apikey":"123456"},{"phone":"+27829876543","apikey":"456789"}]'
   ```

5. Deploy the function:
   ```bash
   supabase functions deploy fault-alert
   ```

6. After deployment, go to **Supabase → Edge Functions** in the dashboard
7. Click on `fault-alert` and copy the **Invoke URL**
8. Paste it into `FAULT_ALERT_FUNCTION_URL` in `config.js`

> 💡 **Skip for now?** If you don't set up CallMeBot, the app still works fully — you'll just miss the automated WhatsApp alerts. You can add this later.

---

## STEP 4 — Update config.js

Open `config.js` and fill in all your values:

```javascript
const CONFIG = {
  SUPABASE_URL:            'https://abcdefghijk.supabase.co',
  SUPABASE_ANON_KEY:       'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  CLOUDINARY_CLOUD_NAME:   'mycloud',
  CLOUDINARY_UPLOAD_PRESET:'transroute_uploads',
  APP_NAME:                'TransRoute',
  COMPANY_NAME:            'ABC Transport (Pty) Ltd',
  ADMIN_EMAIL:             'admin@abctransport.co.za',
  FAULT_ALERT_FUNCTION_URL:'https://abcdefghijk.supabase.co/functions/v1/fault-alert',
};
```

---

## STEP 5 — Generate App Icons

1. Go to **https://www.pwabuilder.com/imageGenerator**
2. Upload a square version of your company logo (or use the SVG in `icons/README.txt`)
3. Download the package
4. Copy `icon-192.png` and `icon-512.png` into the `icons/` folder

---

## STEP 6 — Deploy to Netlify

### 6.1 Deploy via Drag & Drop (easiest)

1. Go to **https://netlify.com** and sign up / log in
2. On the dashboard, find the **"Add new site"** area at the bottom
3. Simply **drag and drop the entire `transroute-pwa` folder** onto the page
4. Netlify will deploy it in ~30 seconds
5. You'll get a URL like `https://random-name-12345.netlify.app`

### 6.2 Set a Custom Site Name (optional)

1. In Netlify, go to **Site configuration → General → Site details**
2. Click **"Change site name"**
3. Enter something like `transroute-fleet`
4. Your URL becomes `https://transroute-fleet.netlify.app`

### 6.3 Update Supabase Auth URLs

Now that you have your Netlify URL, go back to Supabase:
1. **Authentication → URL Configuration**
2. Update **"Site URL"** to your Netlify URL
3. Add your Netlify URL to **"Redirect URLs"**:
   - `https://transroute-fleet.netlify.app/login.html`

---

## STEP 7 — First Login & Test

### 7.1 Log in as Admin

1. Go to your Netlify URL
2. You'll be redirected to `login.html`
3. Enter your admin email → click "Send Magic Link"
4. Check your email → click the link
5. You should land on the **Admin Dashboard** (`index.html`)

### 7.2 Add Your First Vehicle

1. Click the **Fleet** tab
2. Click **"+ Add Vehicle"**
3. Fill in registration, model, mileage → Save

### 7.3 Test a Driver Inspection

1. Open a different browser or incognito window
2. Go to your Netlify URL
3. Log in with a driver's email
4. (Make them a driver in Supabase: their `role` should be `driver` — this is the default)
5. You'll land on `inspection.html`
6. Select a vehicle, mark checklist items, take a photo, submit

---

## STEP 8 — Create Driver Accounts

Drivers log in via Magic Link — no passwords needed.

**To add a driver:**
1. Go to **Supabase → Authentication → Users**
2. Click **"Invite user"** → enter driver's email
3. The driver will receive a "confirm your email" link
4. After they confirm, their profile is auto-created with `role = 'driver'`
5. They can then log in via magic link at any time

**To promote someone to admin:**
```sql
UPDATE profiles SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'driver@email.com');
```

---

## STEP 9 — Install as a PWA on Phones

### Android:
1. Open Chrome on Android
2. Go to your Netlify URL
3. Tap the three-dot menu → **"Add to Home Screen"**
4. Tap **"Add"**

### iPhone (iOS):
1. Open Safari on iPhone
2. Go to your Netlify URL
3. Tap the **Share** button (box with arrow)
4. Scroll down → tap **"Add to Home Screen"**
5. Tap **"Add"**

The app will now appear as an icon on the home screen and run in full-screen mode.

---

## Troubleshooting

### "Invalid login credentials" or blank screen after magic link
- Check that your `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `config.js` are correct
- Ensure the Netlify URL is in Supabase's "Redirect URLs" list
- Make sure email confirmations are disabled (Step 1.6)

### Photos not uploading
- Verify `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET` in `config.js`
- Confirm the preset is set to **Unsigned** in Cloudinary settings

### WhatsApp alerts not sending
- Ensure you sent the activation message to CallMeBot (Step 3.1)
- The API key must match exactly
- Check Supabase Edge Function logs: **Supabase → Edge Functions → fault-alert → Logs**

### "Offline" banner shown but I have internet
- The app checks `navigator.onLine` — try refreshing the page
- Make sure the service worker is registered (check browser DevTools → Application → Service Workers)

### Admin redirected to inspection page (or vice versa)
- Check the `role` column in your `profiles` table in Supabase
- Run: `SELECT id, driver_id, name, role FROM profiles;` in the SQL Editor

---

## Redeploying After Changes

Any time you edit `config.js` or other files:
1. Drag the updated `transroute-pwa` folder to Netlify again
2. Netlify will auto-deploy the new version

Or use Netlify CLI for automated deployments:
```bash
npm install -g netlify-cli
netlify deploy --prod --dir transroute-pwa
```

---

## File Structure Reference

```
transroute-pwa/
├── config.js              ← ✏️  EDIT THIS with your credentials
├── manifest.json          ← PWA manifest (name, icons, theme)
├── sw.js                  ← Service worker (offline + background sync)
├── style.css              ← All styles
├── app.js                 ← Shared: Supabase client, auth, IndexedDB, sync
├── admin.js               ← Admin dashboard logic
├── inspection.js          ← Inspection form logic
├── login.html             ← Login page (magic link)
├── index.html             ← Admin dashboard (Calendar, Fleet, Reports)
├── inspection.html        ← Driver inspection form
├── icons/
│   ├── README.txt         ← Instructions to generate icons
│   ├── icon-192.png       ← ✏️  Add this (see README.txt)
│   └── icon-512.png       ← ✏️  Add this (see README.txt)
├── supabase/
│   └── functions/
│       └── fault-alert/
│           ├── index.ts   ← Edge Function (WhatsApp alert)
│           └── deno.json
├── schema.sql             ← Run this in Supabase SQL Editor
└── SETUP_GUIDE.md         ← This file
```

---

*TransRoute PWA — Built for zero monthly subscriptions. All data stays in your Supabase project.*


---

## STEP 9 — Admin Operations Checklist (After Login)

### 9.1 Add / Edit / Remove Vehicles
1. Open **Fleet** tab in Admin.
2. Click **+ Add Vehicle** to create a vehicle.
3. Use **Edit** to update mileage/service/status.
4. Use **Del** to remove a vehicle.

### 9.2 Assign Vehicle to Driver
1. In Fleet, click **Edit** on a vehicle.
2. Use **Assigned Driver** dropdown.
3. Save vehicle.

### 9.3 Create / Edit Bookings
1. Open **Calendar** tab.
2. Click **+ New** to create booking.
3. Click **Edit** on an existing booking to update details/status.

### 9.4 Add Drivers
1. Go to **Supabase → Authentication → Users**.
2. Invite driver by email.
3. Profile auto-creates in `profiles` table with default role `driver`.
4. Driver logs in via magic link.

---

## STEP 10 — Security Hardening (Recommended)

For production, add a small backend layer (e.g. Cloudflare Workers) for privileged actions:
- Driver invite workflow
- Signed media upload flow
- Admin-only server validations

Keep this rule: **No privileged secret in frontend files** (`config.js`, HTML, JS).

---

## STEP 11 — Cloudflare Worker + Google Sheets Logging

This step adds secure server-side logging to Google Sheets for:
- bookings (`/bookings` endpoint)
- inspections (`/inspections` endpoint)

**Architecture note:** Supabase remains the system of record (source of truth). Google Sheets is a secondary copy for audit/reporting/export only.

### 11.1 Create Two Google Sheets
1. Create sheet #1 named `TransRoute Bookings`.
2. Create sheet #2 named `TransRoute Inspections`.
3. In each sheet, create a tab:
   - `Bookings`
   - `Inspections`
4. Copy each spreadsheet ID from the URL:
   - `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

### 11.2 Create Google Service Account Credentials
1. Open Google Cloud Console: https://console.cloud.google.com
2. Create/select a project.
3. Enable **Google Sheets API**.
4. Go to **IAM & Admin → Service Accounts**.
5. Create a service account (e.g. `transroute-sheets-writer`).
6. Create JSON key for that account and download it.
7. Copy:
   - `client_email` → used as `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → used as `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
8. Share both spreadsheets with the service account email as **Editor**.

### 11.3 Deploy Cloudflare Worker
1. Create Cloudflare account and install Wrangler:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
2. In this repo, use `cloudflare-worker-example.js` as your Worker script.
3. Create a Worker project and paste script.
4. Set Worker secrets:
   ```bash
   wrangler secret put WORKER_SHARED_TOKEN
   wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
   wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
   wrangler secret put GSHEET_BOOKINGS_SPREADSHEET_ID
   wrangler secret put GSHEET_INSPECTIONS_SPREADSHEET_ID
   ```
5. Set Worker plain vars:
   - `GSHEET_BOOKINGS_TAB=Bookings`
   - `GSHEET_INSPECTIONS_TAB=Inspections`
6. Deploy worker and copy URL:
   - `https://YOUR_WORKER.workers.dev`

### 11.4 Set Frontend Config Values
Open `config.js` and set:
- `WORKER_BOOKINGS_WEBHOOK_URL=https://YOUR_WORKER.workers.dev/bookings`
- `WORKER_INSPECTIONS_WEBHOOK_URL=https://YOUR_WORKER.workers.dev/inspections`
- `WORKER_SHARED_TOKEN=...` (same as Worker secret)

### 11.5 Verify End-to-End
1. Create or edit a booking from admin screen.
2. Submit an inspection.
3. Confirm rows appear in both spreadsheets.
4. If missing, check Cloudflare Worker logs and browser console.

