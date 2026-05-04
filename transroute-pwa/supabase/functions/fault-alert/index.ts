// ============================================================
//  TRANSROUTE PWA — SUPABASE EDGE FUNCTION
//  Function name: fault-alert
//  Triggered by: POST request when a critical fault is logged
//
//  Deploy command:
//    supabase functions deploy fault-alert
//
//  Set secrets:
//    # Single recipient (backward compatible):
//    supabase secrets set CALLMEBOT_PHONE=+27821234567
//    supabase secrets set CALLMEBOT_APIKEY=your_api_key
//
//    # Multi-recipient (recommended for multiple admins):
//    supabase secrets set CALLMEBOT_RECIPIENTS='[{"phone":"+27821234567","apikey":"123456"},{"phone":"+27829876543","apikey":"456789"}]'
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Verify JWT ────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse Request Body ────────────────────────────────────
    const { vehicle_reg, driver_id, faults, inspection_id } = await req.json();

    if (!vehicle_reg || !faults || faults.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Build WhatsApp Message ────────────────────────────────
    const faultList = (faults as string[])
      .slice(0, 5) // Limit to 5 faults to keep message short
      .map((f: string, i: number) => `${i + 1}. ${f}`)
      .join('%0A'); // URL-encoded newline

    const timestamp = new Date().toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const message = encodeURIComponent(
      `🚨 CRITICAL FAULT ALERT — TransRoute\n` +
      `Vehicle: ${vehicle_reg}\n` +
      `Driver ID: ${driver_id}\n` +
      `Time: ${timestamp}\n\n` +
      `Faults reported:\n${decodeURIComponent(faultList)}\n\n` +
      `Inspection ID: ${inspection_id ?? 'N/A'}\n` +
      `Action required: Vehicle must be inspected before next trip.`
    );

    // ── Send via CallMeBot (single or multi-admin recipients) ─
    const recipientsRaw = Deno.env.get('CALLMEBOT_RECIPIENTS') ?? '';
    let recipients: Array<{ phone: string; apikey: string }> = [];

    if (recipientsRaw) {
      try {
        const parsed = JSON.parse(recipientsRaw);
        if (Array.isArray(parsed)) {
          recipients = parsed
            .filter((r) => r?.phone && r?.apikey)
            .map((r) => ({ phone: String(r.phone), apikey: String(r.apikey) }));
        }
      } catch (e) {
        console.warn('Invalid CALLMEBOT_RECIPIENTS JSON:', e);
      }
    }

    // Backward-compatible fallback to single-recipient secrets
    if (recipients.length === 0) {
      const phone = Deno.env.get('CALLMEBOT_PHONE') ?? '';
      const apikey = Deno.env.get('CALLMEBOT_APIKEY') ?? '';
      if (phone && apikey) {
        recipients = [{ phone, apikey }];
      }
    }

    if (recipients.length === 0) {
      console.warn('CallMeBot credentials not set — skipping WhatsApp alert');
      return new Response(
        JSON.stringify({ success: false, reason: 'CallMeBot not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{ phone: string; ok: boolean; response: string }> = [];

    for (const recipient of recipients) {
      const callMeBotUrl =
        `https://api.callmebot.com/whatsapp.php?phone=${recipient.phone}&text=${message}&apikey=${recipient.apikey}`;
      const alertRes = await fetch(callMeBotUrl);
      const alertText = await alertRes.text();
      results.push({ phone: recipient.phone, ok: alertRes.ok, response: alertText });
    }

    const anySuccess = results.some((r) => r.ok);

    // ── Mark Alert as Sent in DB ──────────────────────────────
    if (anySuccess && inspection_id) {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await adminClient
        .from('inspections')
        .update({ alert_sent: true })
        .eq('id', inspection_id);
    }

    return new Response(
      JSON.stringify({ success: anySuccess, recipients: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('fault-alert error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
