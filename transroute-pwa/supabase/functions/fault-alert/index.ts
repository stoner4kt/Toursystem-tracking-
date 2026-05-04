// ============================================================
//  TRANSROUTE PWA — SUPABASE EDGE FUNCTION
//  Function name: fault-alert
//  Triggered by: POST request when a critical fault is logged
//
//  Deploy command:
//    supabase functions deploy fault-alert
//
//  Set secrets:
//    supabase secrets set CALLMEBOT_PHONE=+27821234567
//    supabase secrets set CALLMEBOT_APIKEY=your_api_key
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

    // ── Send via CallMeBot ────────────────────────────────────
    const phone   = Deno.env.get('CALLMEBOT_PHONE') ?? '';
    const apikey  = Deno.env.get('CALLMEBOT_APIKEY') ?? '';

    if (!phone || !apikey) {
      console.warn('CallMeBot credentials not set — skipping WhatsApp alert');
      return new Response(
        JSON.stringify({ success: false, reason: 'CallMeBot not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callMeBotUrl =
      `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${message}&apikey=${apikey}`;

    const alertRes = await fetch(callMeBotUrl);
    const alertText = await alertRes.text();

    // ── Mark Alert as Sent in DB ──────────────────────────────
    if (alertRes.ok && inspection_id) {
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
      JSON.stringify({ success: alertRes.ok, callmebot_response: alertText }),
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
