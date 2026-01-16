import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { action, session_id, session_token, etapa_atual, dados_parciais } = payload ?? {};

    // "Ping" usado pelo frontend para aquecer CORS/preflight em navegadores novos
    if (action === "ping") {
      return new Response(
        JSON.stringify({ success: true, pong: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!session_id || !session_token) {
      return new Response(
        JSON.stringify({ error: "session_id and session_token are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate token + don't override completed sessions
    const { data: session } = await supabase
      .from("formularios_sessoes")
      .select("completed_at, session_token")
      .eq("id", session_id)
      .maybeSingle();

    if (!session) {
      return new Response(
        JSON.stringify({ error: "session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.session_token !== session_token) {
      return new Response(
        JSON.stringify({ error: "invalid session token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.completed_at) {
      return new Response(
        JSON.stringify({ success: true, message: "Session already completed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error } = await supabase
      .from("formularios_sessoes")
      .update({
        abandoned_at: new Date().toISOString(),
        etapa_atual: etapa_atual || 1,
        dados_parciais: dados_parciais || {},
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    if (error) {
      console.error("Error updating session:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
