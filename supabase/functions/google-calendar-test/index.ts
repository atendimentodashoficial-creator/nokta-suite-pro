import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get stored config
    const { data: config, error: configError } = await supabase
      .from("google_calendar_config")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: "Configuração do Google Calendar não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.refresh_token || !config.client_id || !config.client_secret) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais incompletas. Reconecte sua conta." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if access token is expired and refresh if needed
    let accessToken = config.access_token;
    const now = new Date();
    const expiresAt = config.token_expires_at ? new Date(config.token_expires_at) : null;

    if (!accessToken || !expiresAt || now >= expiresAt) {
      console.log("Access token expired, refreshing...");
      
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.client_id,
          client_secret: config.client_secret,
          refresh_token: config.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      const refreshData = await refreshResponse.json();

      if (!refreshResponse.ok || !refreshData.access_token) {
        console.error("Token refresh failed:", refreshData);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Falha ao renovar token: ${refreshData.error_description || refreshData.error || "erro desconhecido"}. Reconecte sua conta.` 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      accessToken = refreshData.access_token;
      const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();

      // Save new access token
      await supabase
        .from("google_calendar_config")
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      console.log("Token refreshed successfully");
    }

    // Test the connection by listing calendars
    const calendarResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!calendarResponse.ok) {
      const errorData = await calendarResponse.json().catch(() => ({}));
      console.error("Calendar API error:", errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Erro na API do Google Calendar: ${errorData?.error?.message || calendarResponse.statusText}` 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Conexão com Google Calendar OK!" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error testing Google Calendar:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
