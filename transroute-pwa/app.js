// ============================================================
//  TRANSROUTE PWA — SHARED UTILITIES & AUTH
// ============================================================

// ── Supabase Client ──────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// ── Auth State ───────────────────────────────────────────────
let currentUser  = null;
let currentProfile = null;

async function initAuth(requiredRole = null) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  currentUser = session.user;

  const { data: profile } = await sb.from('profiles')
    .select('*').eq('id', currentUser.id).single();
  currentProfile = profile;

  if (requiredRole && profile?.role !== requiredRole) {
    if (requiredRole === 'admin') {
      window.location.href = 'inspection.html';
    } else {
      window.location.href = 'index.html';
    }
    return null;
  }
  return { user: currentUser, profile };
}

async function signOut() {
  await sb.auth.signOut();
  clearIndexedDB();
  window.location.href = 'login.html';
}

// ── Service Worker Registration ──────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered:', reg.scope);

      // Listen for sync messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_INSPECTIONS') {
          syncPendingInspections();
        }
      });
    } catch (err) {
      console.warn('SW registration failed:', err);
    }
  });
}

// ── Offline Detection ─────────────────────────────────────────
const offlineBanner = document.getElementById('offline-banner');
function updateOnlineStatus() {
  const isOffline = !navigator.onLine;
  if (offlineBanner) offlineBanner.classList.toggle('visible', isOffline);
}
window.addEventListener('online',  () => { updateOnlineStatus(); syncPendingInspections(); });
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ── IndexedDB ─────────────────────────────────────────────────
const DB_NAME    = 'transroute-offline';
const DB_VERSION = 1;
let idb = null;

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    if (idb) return resolve(idb);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending_inspections')) {
        const store = db.createObjectStore('pending_inspections', {
          keyPath: 'local_id', autoIncrement: true,
        });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };
    req.onsuccess = (e) => { idb = e.target.result; resolve(idb); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function saveInspectionOffline(data) {
  const db     = await openIndexedDB();
  const record = { ...data, synced: false, saved_at: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx   = db.transaction('pending_inspections', 'readwrite');
    const req  = tx.objectStore('pending_inspections').add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function getPendingInspections() {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('pending_inspections', 'readonly');
    const idx = tx.objectStore('pending_inspections').index('synced');
    const req = idx.getAll(false);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function markInspectionSynced(localId) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('pending_inspections', 'readwrite');
    const store = tx.objectStore('pending_inspections');
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const rec = getReq.result;
      if (rec) { rec.synced = true; store.put(rec); }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function clearIndexedDB() {
  const db = await openIndexedDB();
  const tx = db.transaction('pending_inspections', 'readwrite');
  tx.objectStore('pending_inspections').clear();
}

async function getPendingCount() {
  try {
    const pending = await getPendingInspections();
    return pending.length;
  } catch { return 0; }
}

// ── Sync Pending Inspections ──────────────────────────────────
async function syncPendingInspections() {
  if (!navigator.onLine) return;
  try {
    const pending = await getPendingInspections();
    for (const record of pending) {
      const { local_id, synced, saved_at, mediaFiles, ...payload } = record;

      // Upload any locally-stored media blobs to Cloudinary
      if (mediaFiles && mediaFiles.length > 0) {
        const uploadedUrls = [];
        for (const fileData of mediaFiles) {
          try {
            const url = await uploadToCloudinary(fileData.blob, fileData.name);
            uploadedUrls.push(url);
          } catch (err) {
            console.warn('Media upload failed during sync:', err);
          }
        }
        payload.media_urls = uploadedUrls;
      }

      const { data: syncedData, error } = await sb.from('inspections').insert(payload).select().single();
      if (!error) {
        await markInspectionSynced(local_id);
        if (payload.has_critical_fault) {
          await triggerFaultAlert(payload);
        }
        await postToWorkerWebhook(CONFIG.WORKER_INSPECTIONS_WEBHOOK_URL, syncedData || payload);
      }
    }
    updateSyncBadge();
  } catch (err) {
    console.warn('Sync error:', err);
  }
}

async function updateSyncBadge() {
  const count = await getPendingCount();
  document.querySelectorAll('.sync-count').forEach((el) => {
    el.textContent = count;
    el.closest('[data-sync-wrapper]')?.classList.toggle('hidden', count === 0);
  });
}

// ── Cloudinary Upload ─────────────────────────────────────────
async function uploadToCloudinary(file, folder = 'inspections') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CONFIG.CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', `transroute/${folder}`);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: formData }
  );
  if (!res.ok) throw new Error('Cloudinary upload failed');
  const json = await res.json();
  return json.secure_url;
}

// ── Fault Alert (Edge Function) ───────────────────────────────
async function triggerFaultAlert(inspection) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    await fetch(CONFIG.FAULT_ALERT_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        vehicle_reg:   inspection.vehicle_reg,
        driver_id:     inspection.driver_id,
        faults:        inspection.faults_json,
        inspection_id: inspection.id,
      }),
    });
  } catch (err) {
    console.warn('Fault alert failed:', err);
  }
}

// ── Toast Notifications ───────────────────────────────────────
function toast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Formatting Helpers ────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function formatMileage(km) {
  if (!km && km !== 0) return '—';
  return km.toLocaleString('en-ZA') + ' km';
}
function statusBadge(status) {
  const map = {
    active:         'badge-green',
    confirmed:      'badge-green',
    completed:      'badge-blue',
    pending:        'badge-amber',
    maintenance:    'badge-amber',
    invoiced:       'badge-amber',
    decommissioned: 'badge-gray',
    cancelled:      'badge-gray',
    'pre-trip':     'badge-blue',
    'post-trip':    'badge-green',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}

// ── Modal Helpers ─────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}
// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});


async function postToWorkerWebhook(url, payload) {
  if (!url || url.includes('YOUR_WORKER')) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.WORKER_SHARED_TOKEN || ''}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('Worker webhook failed:', err);
  }
}
