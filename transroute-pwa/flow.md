# TransRoute System Flow (Client-Friendly)

## 1) Authentication & Role Routing
1. User opens `login.html`.
2. Supabase Auth sends a magic link to the provided email.
3. After sign-in, app reads `profiles.role`:
   - `admin` → routed to `index.html` (Admin console)
   - `driver` → routed to `inspection.html` (Inspection app)

## 2) Admin Flow (`index.html` + `admin.js`)
- **Calendar tab**
  - Reads from `bookings` table.
  - Shows booking stats and date-based booking cards.
  - Admin can create/edit bookings (invoice, route, date, status, amount).
- **Fleet tab**
  - Reads from `vehicles` table.
  - Shows service progress, mileage, status, and allows CRUD updates.
- **Reports tab**
  - Reads recent inspections from `inspections` table.
  - Displays fault flags, metadata, and captured evidence references.

## 3) Driver Inspection Flow (`inspection.html` + `inspection.js`)
1. Driver selects vehicle + trip context.
2. Driver completes checklist items (OK/Fault).
3. Driver can capture before/after media.
4. Submit builds payload:
   - vehicle info
   - checklist JSON
   - faults array
   - notes + linked booking
   - media URLs (if uploaded)
5. Payload inserts into `inspections` table.

## 4) Media & Evidence Flow
- Media uploads directly from browser to Cloudinary using unsigned preset.
- Returned secure URLs are attached to inspection records.

## 5) Critical Fault Alert Flow
1. If any fault is marked, `has_critical_fault=true`.
2. App calls Supabase Edge Function `fault-alert`.
3. Edge Function sends WhatsApp alert via CallMeBot to admin contact.

## 6) Offline-First Sync Flow
1. If driver is offline on submit:
   - inspection payload stored in IndexedDB (`pending_inspections`).
   - files retained for later upload.
2. Service worker/background sync triggers when online.
3. Pending records replay:
   - uploads media to Cloudinary
   - inserts inspection to Supabase
   - triggers alert if critical
4. Record marked `synced=true` locally.

## 7) Presentation Script (Quick Demo)
1. Open `demo.html` to explain the 6-step story.
2. Open `index.html` and demo Calendar → Fleet → Reports.
3. Open `inspection.html` and submit a sample inspection path.
4. Explain offline save + later sync as resilience differentiator.


## 8) Data Ownership (Important)
- **Supabase is the source of truth** for operational data (vehicles, bookings, inspections, users).
- **Google Sheets is a secondary log/export sink** for reporting/shareability and does not drive app state.
- If Worker/Sheets is down, app should still continue operating against Supabase.
