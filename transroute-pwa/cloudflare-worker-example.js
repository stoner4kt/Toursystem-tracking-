/**
 * Cloudflare Worker: Security + Google Sheets logging gateway
 *
 * Endpoints:
 *  POST /bookings   -> append booking row to Google Sheet
 *  POST /inspections -> append inspection row to Google Sheet
 */

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.WORKER_SHARED_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const payload = await request.json().catch(() => null);
    if (!payload) return json({ error: 'Invalid JSON body' }, 400);

    if (url.pathname === '/bookings') {
      const row = [
        new Date().toISOString(),
        payload.id || '',
        payload.invoice_no || '',
        payload.client_name || '',
        payload.route || '',
        payload.tour_date || '',
        payload.passengers ?? '',
        payload.amount ?? '',
        payload.status || '',
        payload.notes || '',
      ];
      await appendSheet(env, env.GSHEET_BOOKINGS_SPREADSHEET_ID, env.GSHEET_BOOKINGS_TAB, row);
      return json({ ok: true });
    }

    if (url.pathname === '/inspections') {
      const row = [
        new Date().toISOString(),
        payload.id || '',
        payload.vehicle_reg || '',
        payload.driver_id || '',
        payload.inspection_type || '',
        JSON.stringify(payload.faults_json || []),
        payload.has_critical_fault ? 'YES' : 'NO',
        payload.mileage_at_inspection ?? '',
        payload.invoice_no || '',
        payload.notes || '',
      ];
      await appendSheet(env, env.GSHEET_INSPECTIONS_SPREADSHEET_ID, env.GSHEET_INSPECTIONS_TAB, row);
      return json({ ok: true });
    }

    return json({ error: 'Not Found' }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function appendSheet(env, spreadsheetId, tabName, row) {
  const token = await getGoogleAccessToken(env);
  const range = `${tabName}!A1`;
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets append failed: ${res.status} ${text}`);
  }
}

async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const input = `${enc(header)}.${enc(claim)}`;

  const keyData = pemToArrayBuffer(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const jwt = `${input}.${base64Url(sig)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Google token failed: ${JSON.stringify(tokenJson)}`);
  return tokenJson.access_token;
}

function base64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem) {
  const normalized = pem.replace(/\\n/g, '\n');
  const b64 = normalized.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
