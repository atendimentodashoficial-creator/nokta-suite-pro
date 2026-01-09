// Lovable Cloud backend function: mark WhatsApp chat as read (viewing is enough)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.77.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
      console.error("[whatsapp-mark-read] Missing env vars");
      return new Response(JSON.stringify({ error: "Missing env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";

    // Authenticated client to identify user from JWT
    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) {
      console.error("[whatsapp-mark-read] Unauthorized", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { chatId } = await req.json().catch(() => ({ chatId: null }));
    if (!chatId) {
      return new Response(JSON.stringify({ error: "chatId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for privileged update (still checks ownership explicitly)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: chatRow, error: chatError } = await admin
      .from("whatsapp_chats")
      .select("id, user_id, provider_unread_count")
      .eq("id", chatId)
      .maybeSingle();

    if (chatError) {
      console.error("[whatsapp-mark-read] select chat error", chatError);
      return new Response(JSON.stringify({ error: chatError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!chatRow?.id) {
      return new Response(JSON.stringify({ error: "Chat not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (chatRow.user_id !== userData.user.id) {
      console.warn("[whatsapp-mark-read] Forbidden for user", {
        chatId,
        chatUserId: chatRow.user_id,
        requester: userData.user.id,
      });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const baseline = chatRow.provider_unread_count ?? 0;

    const { error: updateError } = await admin
      .from("whatsapp_chats")
      .update({
        unread_count: 0,
        last_read_at: now,
        provider_unread_baseline: baseline,
      })
      .eq("id", chatId);

    if (updateError) {
      console.error("[whatsapp-mark-read] update error", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[whatsapp-mark-read] ok", { chatId, baseline, now });

    return new Response(JSON.stringify({ ok: true, chatId, baseline, last_read_at: now }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[whatsapp-mark-read] error", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
