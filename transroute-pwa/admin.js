// ============================================================
//  TRANSROUTE PWA — ADMIN DASHBOARD LOGIC
// ============================================================

// ── TAB NAVIGATION ───────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${target}`)?.classList.add('active');
    if (target === 'calendar') renderCalendar();
    if (target === 'fleet')    loadFleet();
    if (target === 'reports')  loadReports();
  });
});

// ────────────────────────────────────────────────────────────
//  CALENDAR
// ────────────────────────────────────────────────────────────
let calDate     = new Date();
let allBookings = [];
let driverOptions = [];

async function loadDriverOptions() {
  const { data } = await sb.from('profiles')
    .select('driver_id, name, is_active, role')
    .eq('role', 'driver')
    .eq('is_active', true)
    .order('name');
  driverOptions = data || [];
  const sel = document.getElementById('vehicle-assigned-driver');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Unassigned —</option>';
  driverOptions.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d.driver_id;
    opt.textContent = `${d.name} (${d.driver_id})`;
    sel.appendChild(opt);
  });
}

async function renderCalendar() {
  const year  = calDate.getFullYear();
  const month = calDate.getMonth();

  document.getElementById('cal-month-label').textContent =
    calDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  // Fetch bookings for this month
  const from = new Date(year, month, 1).toISOString().split('T')[0];
  const to   = new Date(year, month + 1, 0).toISOString().split('T')[0];
  const { data } = await sb.from('bookings')
    .select('*').gte('tour_date', from).lte('tour_date', to)
    .order('tour_date');
  allBookings = data || [];

  // Build calendar grid
  const grid     = document.getElementById('cal-grid');
  const firstDay = new Date(year, month, 1).getDay();
  const lastDay  = new Date(year, month + 1, 0).getDate();
  const today    = new Date();

  const bookingDates = new Set(allBookings.map((b) => b.tour_date));
  grid.innerHTML = '';

  // Day-name headers
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach((d) => {
    const el = document.createElement('div');
    el.className = 'cal-day-name'; el.textContent = d;
    grid.appendChild(el);
  });

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    grid.appendChild(el);
  }

  // Day cells
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = d;
    if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear())
      el.classList.add('today');
    if (bookingDates.has(dateStr)) el.classList.add('has-booking');
    el.addEventListener('click', () => showBookingsForDate(dateStr, el));
    grid.appendChild(el);
  }

  // Load stats
  loadCalendarStats();
}

function showBookingsForDate(dateStr, cell) {
  document.querySelectorAll('.cal-day.selected').forEach((el) => el.classList.remove('selected'));
  cell.classList.add('selected');
  const dayBookings = allBookings.filter((b) => b.tour_date === dateStr);
  const container   = document.getElementById('day-bookings');

  if (dayBookings.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:.88rem;padding:8px 0;">No bookings on ${formatDate(dateStr)}.</p>`;
    return;
  }
  container.innerHTML = dayBookings.map((b) => `
    <div class="booking-item">
      <div class="booking-dot" style="background:${b.status==='confirmed'?'var(--green)':b.status==='cancelled'?'var(--red)':'var(--amber)'}"></div>
      <div class="booking-info">
        <div class="booking-route">${b.client_name} — ${b.route || 'Route TBC'}</div>
        <div class="booking-meta">${b.invoice_no} · ${b.passengers||1} pax · ${b.amount ? 'R'+Number(b.amount).toLocaleString('en-ZA') : '—'}</div>
      </div>
      <div class="d-flex" style="display:flex;gap:6px;align-items:center">
        ${statusBadge(b.status)}
        <button class="btn btn-sm btn-outline" onclick="openEditBooking('${b.id}')">Edit</button>
      </div>
    </div>
  `).join('');
}

async function loadCalendarStats() {
  const { data } = await sb.from('bookings').select('status');
  const all    = data || [];
  document.getElementById('stat-total').textContent    = all.length;
  document.getElementById('stat-confirmed').textContent = all.filter(b=>b.status==='confirmed').length;
  document.getElementById('stat-pending').textContent   = all.filter(b=>b.status==='pending').length;
  document.getElementById('stat-invoiced').textContent  = all.filter(b=>b.status==='invoiced').length;
}

document.getElementById('cal-prev')?.addEventListener('click', () => {
  calDate.setMonth(calDate.getMonth() - 1); renderCalendar();
});
document.getElementById('cal-next')?.addEventListener('click', () => {
  calDate.setMonth(calDate.getMonth() + 1); renderCalendar();
});

// ── Add / Edit Booking ────────────────────────────────────────
document.getElementById('btn-add-booking')?.addEventListener('click', () => {
  resetBookingForm();
  document.getElementById('modal-booking-title').textContent = 'New Booking';
  openModal('modal-booking');
});

function resetBookingForm() {
  document.getElementById('booking-id').value       = '';
  document.getElementById('booking-invoice').value  = `INV-${Date.now().toString().slice(-6)}`;
  document.getElementById('booking-client').value   = '';
  document.getElementById('booking-route').value    = '';
  document.getElementById('booking-date').value     = '';
  document.getElementById('booking-pax').value      = '1';
  document.getElementById('booking-amount').value   = '';
  document.getElementById('booking-status').value   = 'pending';
  document.getElementById('booking-notes').value    = '';
}

async function openEditBooking(id) {
  const { data } = await sb.from('bookings').select('*').eq('id', id).single();
  if (!data) return;
  document.getElementById('booking-id').value       = data.id;
  document.getElementById('booking-invoice').value  = data.invoice_no;
  document.getElementById('booking-client').value   = data.client_name;
  document.getElementById('booking-route').value    = data.route || '';
  document.getElementById('booking-date').value     = data.tour_date;
  document.getElementById('booking-pax').value      = data.passengers || 1;
  document.getElementById('booking-amount').value   = data.amount || '';
  document.getElementById('booking-status').value   = data.status;
  document.getElementById('booking-notes').value    = data.notes || '';
  document.getElementById('modal-booking-title').textContent = 'Edit Booking';
  openModal('modal-booking');
}

document.getElementById('form-booking')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('booking-id').value;
  const payload = {
    invoice_no:  document.getElementById('booking-invoice').value.trim(),
    client_name: document.getElementById('booking-client').value.trim(),
    route:       document.getElementById('booking-route').value.trim(),
    tour_date:   document.getElementById('booking-date').value,
    passengers:  parseInt(document.getElementById('booking-pax').value) || 1,
    amount:      parseFloat(document.getElementById('booking-amount').value) || null,
    status:      document.getElementById('booking-status').value,
    notes:       document.getElementById('booking-notes').value.trim(),
  };
  const submitBtn = e.target.querySelector('[type="submit"]');
  submitBtn.disabled = true; submitBtn.textContent = 'Saving…';

  const { data: bookingData, error } = id
    ? await sb.from('bookings').update(payload).eq('id', id).select().single()
    : await sb.from('bookings').insert(payload).select().single();

  submitBtn.disabled = false; submitBtn.textContent = 'Save Booking';
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(id ? 'Booking updated' : 'Booking added', 'success');
  await postToWorkerWebhook(CONFIG.WORKER_BOOKINGS_WEBHOOK_URL, bookingData || payload);
  closeModal('modal-booking');
  renderCalendar();
});

// ────────────────────────────────────────────────────────────
//  FLEET MANAGEMENT
// ────────────────────────────────────────────────────────────
async function loadFleet() {
  const tbody = document.getElementById('fleet-tbody');
  tbody.innerHTML = `<tr><td colspan="8"><div class="spinner"></div></td></tr>`;
  const { data, error } = await sb.from('vehicles').select('*').order('registration_no');
  if (!driverOptions.length) await loadDriverOptions();
  if (error) { tbody.innerHTML = `<tr><td colspan="8">Error loading fleet</td></tr>`; return; }
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🚌</div><p>No vehicles added yet.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map((v) => {
    const pct = v.next_service_km
      ? Math.min(100, Math.round((v.current_mileage / v.next_service_km) * 100))
      : 0;
    const barClass = pct >= 95 ? 'danger' : pct >= 80 ? 'warn' : '';
    const kmLeft = v.next_service_km ? v.next_service_km - v.current_mileage : null;
    return `
      <tr>
        <td><strong>${v.registration_no}</strong></td>
        <td>${v.make || ''} ${v.model}</td>
        <td>${v.year || '—'}</td>
        <td>${formatMileage(v.current_mileage)}</td>
        <td>
          <div class="progress-bar" title="${formatMileage(v.current_mileage)} / ${formatMileage(v.next_service_km)}">
            <div class="progress-bar-fill ${barClass}" style="width:${pct}%"></div>
          </div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:3px">
            ${kmLeft !== null ? (kmLeft > 0 ? formatMileage(kmLeft) + ' left' : '<span style="color:var(--red)">Overdue</span>') : '—'}
          </div>
        </td>
        <td>${v.assigned_driver_id ? (driverOptions.find(d => d.driver_id === v.assigned_driver_id)?.name || v.assigned_driver_id) : '—'}</td>
        <td>${statusBadge(v.status)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-outline" onclick="openEditVehicle('${v.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteVehicle('${v.id}','${v.registration_no}')">Del</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

document.getElementById('btn-add-vehicle')?.addEventListener('click', async () => {
  await loadDriverOptions();
  resetVehicleForm();
  document.getElementById('modal-vehicle-title').textContent = 'Add Vehicle';
  openModal('modal-vehicle');
});

function resetVehicleForm() {
  ['vehicle-id','vehicle-reg','vehicle-model','vehicle-make',
   'vehicle-year','vehicle-mileage','vehicle-service-km','vehicle-notes'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('vehicle-status').value = 'active';
  document.getElementById('vehicle-assigned-driver').value = '';
}

async function openEditVehicle(id) {
  await loadDriverOptions();
  const { data } = await sb.from('vehicles').select('*').eq('id', id).single();
  if (!data) return;
  document.getElementById('vehicle-id').value         = data.id;
  document.getElementById('vehicle-reg').value        = data.registration_no;
  document.getElementById('vehicle-model').value      = data.model;
  document.getElementById('vehicle-make').value       = data.make || '';
  document.getElementById('vehicle-year').value       = data.year || '';
  document.getElementById('vehicle-mileage').value    = data.current_mileage;
  document.getElementById('vehicle-service-km').value = data.next_service_km || '';
  document.getElementById('vehicle-status').value     = data.status;
  document.getElementById('vehicle-notes').value      = data.notes || '';
  document.getElementById('vehicle-assigned-driver').value = data.assigned_driver_id || '';
  document.getElementById('modal-vehicle-title').textContent = 'Edit Vehicle';
  openModal('modal-vehicle');
}

document.getElementById('form-vehicle')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('vehicle-id').value;
  const payload = {
    registration_no: document.getElementById('vehicle-reg').value.trim().toUpperCase(),
    model:           document.getElementById('vehicle-model').value.trim(),
    make:            document.getElementById('vehicle-make').value.trim() || null,
    year:            parseInt(document.getElementById('vehicle-year').value) || null,
    current_mileage: parseInt(document.getElementById('vehicle-mileage').value) || 0,
    next_service_km: parseInt(document.getElementById('vehicle-service-km').value) || null,
    status:          document.getElementById('vehicle-status').value,
    notes:           document.getElementById('vehicle-notes').value.trim() || null,
    assigned_driver_id: document.getElementById('vehicle-assigned-driver').value || null,
  };
  const submitBtn = e.target.querySelector('[type="submit"]');
  submitBtn.disabled = true; submitBtn.textContent = 'Saving…';

  const { error } = id
    ? await sb.from('vehicles').update(payload).eq('id', id)
    : await sb.from('vehicles').insert(payload);

  submitBtn.disabled = false; submitBtn.textContent = 'Save Vehicle';
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(id ? 'Vehicle updated' : 'Vehicle added', 'success');
  closeModal('modal-vehicle');
  loadFleet();
});

async function deleteVehicle(id, reg) {
  if (!confirm(`Delete vehicle ${reg}? This cannot be undone.`)) return;
  const { error } = await sb.from('vehicles').delete().eq('id', id);
  if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
  toast(`${reg} removed`, 'success');
  loadFleet();
}

// ────────────────────────────────────────────────────────────
//  REPORTS (Inspections)
// ────────────────────────────────────────────────────────────
async function loadReports() {
  const container = document.getElementById('reports-list');
  container.innerHTML = '<div class="spinner"></div>';

  const { data, error } = await sb.from('inspections')
    .select('*, profiles(name), vehicles(model)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { container.innerHTML = '<p>Error loading reports.</p>'; return; }
  if (!data.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No inspections recorded yet.</p></div>`;
    return;
  }

  container.innerHTML = data.map((insp) => {
    const faults  = insp.faults_json || [];
    const media   = insp.media_urls  || [];
    return `
      <div class="inspection-item" onclick="openReportDetail('${insp.id}')">
        <div>
          <div class="inspection-title">${insp.vehicle_reg} — ${insp.inspection_type}</div>
          <div class="inspection-meta">
            Driver: ${insp.profiles?.name || insp.driver_id} ·
            ${formatDateTime(insp.created_at)} ·
            ${media.length} photo(s)
          </div>
          ${faults.length > 0
            ? `<div class="inspection-fault-count">⚠ ${faults.length} fault(s) reported</div>`
            : '<div style="color:var(--green);font-size:.8rem;margin-top:3px">✓ No faults</div>'
          }
        </div>
        <button class="btn btn-sm btn-amber" onclick="event.stopPropagation();downloadPDF('${insp.id}')">
          PDF
        </button>
      </div>`;
  }).join('');
}

async function openReportDetail(id) {
  const { data: insp } = await sb.from('inspections')
    .select('*, profiles(name, driver_id), vehicles(model, make)')
    .eq('id', id).single();
  if (!insp) return;

  const faults  = insp.faults_json  || [];
  const media   = insp.media_urls   || [];
  const checklistEntries = Object.entries(insp.checklist_json || {});

  document.getElementById('report-detail-body').innerHTML = `
    <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><strong>Vehicle</strong><p>${insp.vehicle_reg} — ${insp.vehicles?.make||''} ${insp.vehicles?.model||''}</p></div>
      <div><strong>Driver</strong><p>${insp.profiles?.name || insp.driver_id}</p></div>
      <div><strong>Type</strong><p>${statusBadge(insp.inspection_type)}</p></div>
      <div><strong>Date</strong><p>${formatDateTime(insp.created_at)}</p></div>
      <div><strong>Mileage</strong><p>${formatMileage(insp.mileage_at_inspection)}</p></div>
      <div><strong>Invoice</strong><p>${insp.invoice_no || '—'}</p></div>
    </div>
    ${faults.length > 0 ? `
      <div class="fault-alert">
        <div class="fault-icon">⚠</div>
        <div class="fault-text"><strong>${faults.length} Critical Fault(s):</strong><br>${faults.join(' · ')}</div>
      </div>` : '<p style="color:var(--green);font-weight:600;margin-bottom:12px">✓ No critical faults</p>'
    }
    <div style="margin-bottom:16px">
      <strong>Checklist (${checklistEntries.filter(([,v])=>v==='ok').length}/${checklistEntries.length} OK)</strong>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px">
        ${checklistEntries.map(([item, result]) => `
          <div style="font-size:.82rem;display:flex;gap:6px;align-items:center">
            <span style="color:${result==='ok'?'var(--green)':'var(--red)'}">
              ${result === 'ok' ? '✓' : '✕'}
            </span>${item}
          </div>`).join('')}
      </div>
    </div>
    ${media.length > 0 ? `
      <div>
        <strong>Photos / Videos</strong>
        <div class="media-preview" style="margin-top:8px">
          ${media.map((url) => url.match(/\.(mp4|webm|mov)$/i)
            ? `<div class="media-preview-item"><video src="${url}" controls></video></div>`
            : `<div class="media-preview-item"><a href="${url}" target="_blank"><img src="${url}" alt="media"></a></div>`
          ).join('')}
        </div>
      </div>` : ''
    }
    ${insp.notes ? `<div style="margin-top:14px"><strong>Notes</strong><p style="font-size:.9rem;color:var(--text-muted)">${insp.notes}</p></div>` : ''}
    <div style="margin-top:20px;display:flex;gap:10px">
      <button class="btn btn-amber btn-full" onclick="downloadPDF('${insp.id}')">⬇ Download PDF Report</button>
    </div>
  `;
  document.getElementById('report-detail-id').value = id;
  openModal('modal-report-detail');
}

// ── PDF Generation ────────────────────────────────────────────
async function downloadPDF(inspectionId) {
  const { data: insp } = await sb.from('inspections')
    .select('*, profiles(name, driver_id), vehicles(model, make, registration_no)')
    .eq('id', inspectionId).single();
  if (!insp) { toast('Inspection not found', 'error'); return; }

  toast('Generating PDF…', 'info', 5000);
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = doc.internal.pageSize.getWidth();
  let   y    = 15;

  // ── Header ──────────────────────────────────────────────────
  doc.setFillColor(15, 39, 68);
  doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text(CONFIG.APP_NAME, 14, 13);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(CONFIG.COMPANY_NAME, 14, 20);
  doc.setFontSize(9);
  doc.text('VEHICLE INSPECTION REPORT', W - 14, 13, { align: 'right' });
  doc.text(formatDateTime(insp.created_at), W - 14, 20, { align: 'right' });
  y = 36;

  // ── Details Grid ─────────────────────────────────────────────
  doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Inspection Details', 14, y); y += 7;
  const details = [
    ['Vehicle', `${insp.vehicle_reg}  ${insp.vehicles?.make||''} ${insp.vehicles?.model||''}`],
    ['Driver',  insp.profiles?.name || insp.driver_id],
    ['Type',    insp.inspection_type],
    ['Mileage', formatMileage(insp.mileage_at_inspection)],
    ['Invoice', insp.invoice_no || '—'],
  ];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  details.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');   doc.text(label + ':', 14, y);
    doc.setFont('helvetica', 'normal'); doc.text(value || '—', 50, y);
    y += 6;
  });
  y += 4;

  // ── Faults ────────────────────────────────────────────────────
  const faults = insp.faults_json || [];
  if (faults.length > 0) {
    doc.setFillColor(254, 226, 226); doc.rect(14, y - 4, W - 28, 7 + faults.length * 6, 'F');
    doc.setTextColor(185, 28, 28); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(`⚠ Critical Faults (${faults.length})`, 16, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    faults.forEach((f) => { doc.text('• ' + f, 18, y); y += 6; });
    y += 4;
  } else {
    doc.setFillColor(209, 250, 229); doc.rect(14, y - 4, W - 28, 10, 'F');
    doc.setTextColor(6, 95, 70); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('✓ No Critical Faults Reported', 16, y); y += 12;
  }

  // ── Checklist ─────────────────────────────────────────────────
  doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Inspection Checklist', 14, y); y += 6;
  const entries = Object.entries(insp.checklist_json || {});
  doc.setFontSize(8.5);
  const colW = (W - 28) / 2;
  entries.forEach(([item, result], i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    const col = i % 2;
    const xPos = 14 + col * colW;
    if (col === 0 && i > 0) y += 0;
    const color = result === 'ok' ? [16, 185, 129] : [239, 68, 68];
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(result === 'ok' ? '✓' : '✕', xPos, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(item, xPos + 5, y);
    if (col === 1) y += 6;
  });
  if (entries.length % 2 !== 0) y += 6;
  y += 4;

  // ── Notes ────────────────────────────────────────────────────
  if (insp.notes) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Notes', 14, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(doc.splitTextToSize(insp.notes, W - 28), 14, y);
  }

  // ── Footer ────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(15, 39, 68); doc.rect(0, 287, W, 10, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text(`${CONFIG.COMPANY_NAME} — Generated ${formatDateTime(new Date())}`, 14, 293);
    doc.text(`Page ${i} of ${pageCount}`, W - 14, 293, { align: 'right' });
  }

  doc.save(`TransRoute_Inspection_${insp.vehicle_reg}_${insp.created_at.split('T')[0]}.pdf`);
  toast('PDF downloaded', 'success');
}

// ── Init ──────────────────────────────────────────────────────
(async () => {
  const session = await initAuth('admin');
  if (!session) return;

  document.getElementById('admin-name').textContent = currentProfile?.name || 'Admin';
  document.getElementById('btn-signout')?.addEventListener('click', signOut);
  document.querySelector('[data-tab="calendar"]')?.click();
  updateSyncBadge();
})();


loadDriverOptions();
