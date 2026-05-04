// ============================================================
//  TRANSROUTE PWA — INSPECTION FORM LOGIC
// ============================================================

const CHECKLIST = {
  'Fluids & Engine': [
    'Engine Oil Level', 'Coolant Level', 'Brake Fluid',
    'Power Steering Fluid', 'Windshield Washer Fluid',
  ],
  'Tyres & Wheels': [
    'Front Left Tyre (pressure & condition)',
    'Front Right Tyre (pressure & condition)',
    'Rear Left Tyre (pressure & condition)',
    'Rear Right Tyre (pressure & condition)',
    'Spare Tyre (condition & pressure)',
  ],
  'Lights & Electrics': [
    'Headlights', 'Tail Lights', 'Brake Lights',
    'Indicators & Hazards', 'Interior Lights', 'Battery / Charge',
  ],
  'Body & Visibility': [
    'Windscreen (cracks/chips)', 'Wipers (front & rear)',
    'All Mirrors (condition & adjustment)',
    'Doors & Locks', 'Windows',
  ],
  'Safety Equipment': [
    'Seatbelts (all seats)', 'Fire Extinguisher (valid)',
    'First Aid Kit', 'Warning Triangles (×2)',
    'Reflective Safety Vest', 'Vehicle Licence Disc (valid)',
  ],
  'Mechanical': [
    'Brakes (feel & response)', 'Steering (play & alignment)',
    'Horn', 'Suspension (no unusual noise)',
    'Clutch / Gearbox', 'Exhaust (no smoke/leaks)',
  ],
};

// State
let checklist   = {};    // { item: 'ok' | 'fault' | null }
let mediaFiles  = [];    // { file: File, preview: string, type: 'before'|'after' }
let uploadedUrls = [];

// ── Build Checklist UI ────────────────────────────────────────
function buildChecklist() {
  const container = document.getElementById('checklist-container');
  container.innerHTML = '';

  Object.entries(CHECKLIST).forEach(([section, items]) => {
    const sec = document.createElement('div');
    sec.className = 'checklist-section';
    sec.innerHTML = `<div class="checklist-section-title">${section}</div>`;

    items.forEach((item) => {
      checklist[item] = null;
      const row = document.createElement('div');
      row.className = 'checklist-item';
      row.innerHTML = `
        <div class="checklist-label">${item}</div>
        <div class="checklist-buttons">
          <button type="button" class="chk-btn" data-item="${item}" data-value="ok">OK</button>
          <button type="button" class="chk-btn" data-item="${item}" data-value="fault">Fault</button>
        </div>`;
      sec.appendChild(row);
    });
    container.appendChild(sec);
  });

  // Delegate click events
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.chk-btn');
    if (!btn) return;
    const item  = btn.dataset.item;
    const value = btn.dataset.value;
    checklist[item] = value;

    // Update button styles
    const row = btn.closest('.checklist-item');
    row.querySelectorAll('.chk-btn').forEach((b) => {
      b.classList.toggle('ok',    b.dataset.value === 'ok'    && value === 'ok');
      b.classList.toggle('fault', b.dataset.value === 'fault' && value === 'fault');
    });
    updateFaultSummary();
  });
}

function updateFaultSummary() {
  const faults = Object.entries(checklist)
    .filter(([, v]) => v === 'fault')
    .map(([k]) => k);
  const el = document.getElementById('fault-summary');
  if (faults.length > 0) {
    el.innerHTML = `
      <div class="fault-alert">
        <div class="fault-icon">⚠</div>
        <div class="fault-text"><strong>${faults.length} fault(s) marked:</strong><br>
          <span style="font-size:.82rem">${faults.join(' · ')}</span>
        </div>
      </div>`;
  } else {
    el.innerHTML = '';
  }
  document.getElementById('fault-count-label').textContent =
    faults.length > 0 ? ` (${faults.length} fault${faults.length !== 1 ? 's' : ''})` : '';
}

function getCheckedCount() {
  const vals = Object.values(checklist);
  return vals.filter((v) => v !== null).length;
}
function getTotalItems() {
  return Object.keys(checklist).length;
}

// ── Media Capture ─────────────────────────────────────────────
function setupMediaCapture() {
  document.querySelectorAll('.capture-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const type  = input.dataset.type;
      const files = Array.from(e.target.files);
      files.forEach((file) => addMediaPreview(file, type));
      input.value = ''; // reset so same file can be re-selected
    });
  });
}

function addMediaPreview(file, type) {
  const isVideo = file.type.startsWith('video/');
  const url = URL.createObjectURL(file);
  mediaFiles.push({ file, preview: url, type });

  const grid = document.getElementById(`media-preview-${type}`);
  const item = document.createElement('div');
  item.className = 'media-preview-item';
  item.innerHTML = isVideo
    ? `<video src="${url}" muted playsinline></video>`
    : `<img src="${url}" alt="${type}">`;
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-media'; removeBtn.textContent = '×';
  removeBtn.onclick = () => {
    const idx = mediaFiles.findIndex((m) => m.preview === url);
    if (idx !== -1) mediaFiles.splice(idx, 1);
    item.remove();
    URL.revokeObjectURL(url);
  };
  item.appendChild(removeBtn);
  grid.appendChild(item);
}

// ── Load Vehicles ─────────────────────────────────────────────
async function loadVehicleOptions() {
  const { data } = await sb.from('vehicles')
    .select('registration_no, model, make, current_mileage')
    .eq('status', 'active')
    .order('registration_no');
  const sel = document.getElementById('vehicle-select');
  sel.innerHTML = '<option value="">— Select vehicle —</option>';
  (data || []).forEach((v) => {
    const opt = document.createElement('option');
    opt.value       = v.registration_no;
    opt.dataset.mileage = v.current_mileage;
    opt.textContent = `${v.registration_no}  (${v.make || ''} ${v.model})`;
    sel.appendChild(opt);
  });
}

document.getElementById('vehicle-select')?.addEventListener('change', (e) => {
  const selected = e.target.options[e.target.selectedIndex];
  const mileage  = selected.dataset.mileage;
  if (mileage) {
    document.getElementById('mileage-input').value = mileage;
    document.getElementById('mileage-input').placeholder = `Current: ${formatMileage(parseInt(mileage))}`;
  }
});

// ── Load Bookings (optional link) ─────────────────────────────
async function loadBookingOptions() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await sb.from('bookings')
    .select('invoice_no, client_name, route')
    .gte('tour_date', today)
    .in('status', ['confirmed', 'pending'])
    .order('tour_date').limit(20);
  const sel = document.getElementById('invoice-select');
  sel.innerHTML = '<option value="">— None / Not linked —</option>';
  (data || []).forEach((b) => {
    const opt = document.createElement('option');
    opt.value       = b.invoice_no;
    opt.textContent = `${b.invoice_no} — ${b.client_name} (${b.route || 'TBC'})`;
    sel.appendChild(opt);
  });
}

// ── Upload All Media to Cloudinary ────────────────────────────
async function uploadAllMedia() {
  uploadedUrls = [];
  for (const item of mediaFiles) {
    try {
      const url = await uploadToCloudinary(item.file, 'inspections/' + item.type);
      uploadedUrls.push({ url, type: item.type });
    } catch (err) {
      console.warn('Upload failed for', item.file.name, err);
    }
  }
  return uploadedUrls.map((u) => u.url);
}

// ── Form Submission ───────────────────────────────────────────
document.getElementById('form-inspection')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('btn-submit');

  const vehicleReg = document.getElementById('vehicle-select').value;
  const inspType   = document.getElementById('insp-type').value;
  const mileage    = parseInt(document.getElementById('mileage-input').value) || null;
  const invoiceNo  = document.getElementById('invoice-select').value || null;
  const notes      = document.getElementById('notes-input').value.trim() || null;

  if (!vehicleReg) { toast('Please select a vehicle', 'warning'); return; }
  if (!inspType)   { toast('Please select inspection type', 'warning'); return; }

  const checked = getCheckedCount();
  const total   = getTotalItems();
  if (checked < total) {
    const confirmed = confirm(`${total - checked} checklist item(s) not marked. Submit anyway?`);
    if (!confirmed) return;
  }

  const faults = Object.entries(checklist)
    .filter(([, v]) => v === 'fault')
    .map(([k]) => k);

  const hasCriticalFault = faults.length > 0;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;margin:0 6px 0 0;display:inline-block;vertical-align:middle"></span> Submitting…';

  // Try to upload media if online
  let mediaUrls = [];
  if (navigator.onLine && mediaFiles.length > 0) {
    submitBtn.textContent = 'Uploading photos…';
    mediaUrls = await uploadAllMedia();
  }

  const payload = {
    vehicle_reg:          vehicleReg,
    driver_id:            currentProfile.driver_id,
    inspection_type:      inspType,
    checklist_json:       checklist,
    faults_json:          faults,
    media_urls:           mediaUrls,
    mileage_at_inspection: mileage,
    invoice_no:           invoiceNo,
    notes,
    has_critical_fault:   hasCriticalFault,
  };

  if (!navigator.onLine) {
    // Save offline with raw file references for later upload
    const fileData = mediaFiles.map((m) => ({
      blob: m.file,
      name: m.type + '_' + m.file.name,
    }));
    await saveInspectionOffline({ ...payload, mediaFiles: fileData });

    // Register background sync if supported
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-inspections');
    }
    updateSyncBadge();
    toast('Saved offline — will sync when connected', 'warning', 5000);
    submitBtn.disabled = false; submitBtn.textContent = 'Submit Inspection';
    return;
  }

  submitBtn.textContent = 'Saving to server…';
  const { data, error } = await sb.from('inspections').insert(payload).select().single();

  if (error) {
    toast('Save failed: ' + error.message, 'error');
    submitBtn.disabled = false; submitBtn.textContent = 'Submit Inspection';
    return;
  }

  // Update vehicle mileage
  if (mileage) {
    await sb.from('vehicles')
      .update({ current_mileage: mileage })
      .eq('registration_no', vehicleReg)
      .lt('current_mileage', mileage);
  }

  // Trigger fault alert
  if (hasCriticalFault && data) {
    await triggerFaultAlert({ ...payload, id: data.id });
  }

  await postToWorkerWebhook(CONFIG.WORKER_INSPECTIONS_WEBHOOK_URL, data || payload);

  toast(
    hasCriticalFault ? '⚠ Inspection saved — fault alert sent!' : 'Inspection submitted successfully',
    hasCriticalFault ? 'warning' : 'success',
    4000
  );

  // Show WhatsApp reminder link for manual share
  if (hasCriticalFault) {
    const waMsg  = encodeURIComponent(
      `🚨 FAULT ALERT: ${vehicleReg} has ${faults.length} critical fault(s). ` +
      `Reported by ${currentProfile.name}. Faults: ${faults.join(', ')}.`
    );
    const waLink = `https://wa.me/${CONFIG.ADMIN_EMAIL.replace(/\D/g, '')}?text=${waMsg}`;
    document.getElementById('wa-alert-link').href = waLink;
    document.getElementById('wa-alert-section').style.display = 'block';
  }

  resetForm();
  submitBtn.disabled = false; submitBtn.textContent = 'Submit Inspection';
  document.getElementById('success-section').style.display = 'block';
  document.getElementById('form-inspection').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function resetForm() {
  document.getElementById('vehicle-select').value = '';
  document.getElementById('insp-type').value = '';
  document.getElementById('mileage-input').value = '';
  document.getElementById('invoice-select').value = '';
  document.getElementById('notes-input').value = '';
  document.getElementById('media-preview-before').innerHTML = '';
  document.getElementById('media-preview-after').innerHTML = '';
  mediaFiles = [];
  uploadedUrls = [];
  buildChecklist();
}

document.getElementById('btn-new-inspection')?.addEventListener('click', () => {
  resetForm();
  document.getElementById('success-section').style.display = 'none';
  document.getElementById('wa-alert-section').style.display = 'none';
  document.getElementById('form-inspection').style.display = 'block';
});

// ── Init ──────────────────────────────────────────────────────
(async () => {
  const session = await initAuth();
  if (!session) return;

  document.getElementById('driver-name').textContent = currentProfile?.name || 'Driver';
  document.getElementById('btn-signout')?.addEventListener('click', signOut);

  await Promise.all([loadVehicleOptions(), loadBookingOptions()]);
  buildChecklist();
  setupMediaCapture();
  updateSyncBadge();

  // Show pending sync count
  const count = await getPendingCount();
  if (count > 0) toast(`${count} inspection(s) pending sync`, 'warning', 5000);
})();
