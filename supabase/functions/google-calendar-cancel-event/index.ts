import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json();
    const { reuniaoId } = body;

    if (!reuniaoId) {
      return new Response(
        JSON.stringify({ success: false, error: "ID da reunião é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the reuniao to get google_event_id
    const { data: reuniao, error: reuniaoError } = await supabase
      .from("reunioes")
      .select("google_event_id")
      .eq("id", reuniaoId)
      .eq("user_id", user.id)
      .single();

    if (reuniaoError || !reuniao) {
      console.error("Reuniao not found:", reuniaoError);
      return new Response(
        JSON.stringify({ success: false, error: "Reunião não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!reuniao.google_event_id) {
      // No Google event, just update local status
      const { error: updateError } = await supabase
        .from("reunioes")
        .update({ status: "cancelado" })
        .eq("id", reuniaoId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, message: "Reunião cancelada localmente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Google Calendar config
    const { data: config, error: configError } = await supabase
      .from("google_calendar_config")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (configError || !config || !config.access_token) {
      console.error("Config error:", configError);
      // Still update local status even if Google is not connected
      await supabase.from("reunioes").update({ status: "cancelado" }).eq("id", reuniaoId);
      return new Response(
        JSON.stringify({ success: true, message: "Reunião cancelada localmente (Google Calendar não conectado)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = config.access_token;

    // Check if token is expired and refresh if needed
    if (config.token_expires_at && new Date(config.token_expires_at) <= new Date()) {
      console.log("Token expired, refreshing...");
      
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

      if (!refreshResponse.ok) {
        console.error("Token refresh error:", refreshData);
        // Still update local status
        await supabase.from("reunioes").update({ status: "cancelado" }).eq("id", reuniaoId);
        return new Response(
          JSON.stringify({ success: true, error: "Reunião cancelada localmente. Erro ao renovar token do Google." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      accessToken = refreshData.access_token;
      const expiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

      await supabase
        .from("google_calendar_config")
        .update({
          access_token: accessToken,
          token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    // Delete event from Google Calendar
    const calendarId = config.calendar_id || "primary";
    console.log(`Deleting Google Calendar event: ${reuniao.google_event_id}`);
    
    const deleteResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(reuniao.google_event_id)}?sendUpdates=all`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const errorData = await deleteResponse.json().catch(() => ({}));
      console.error("Google Calendar delete error:", errorData);
      // Still update local status
      await supabase.from("reunioes").update({ status: "cancelado" }).eq("id", reuniaoId);
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: "Reunião cancelada localmente, mas houve erro ao remover do Google Calendar" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Google Calendar event deleted successfully");

    // Update local status
    const { error: updateError } = await supabase
      .from("reunioes")
      .update({ status: "cancelado" })
      .eq("id", reuniaoId);

    if (updateError) {
      console.error("Error updating local status:", updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Reunião cancelada com sucesso no Google Calendar" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
