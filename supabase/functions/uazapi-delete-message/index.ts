import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");
    
    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      throw new Error("Missing authorization header");
    }

    const jwt = rawAuth.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { id } = await req.json();

    if (!id) {
      throw new Error("Missing required field: id (message id)");
    }

    // Get user's UAZapi configuration
    const { data: config, error: configError } = await supabase
      .from("uazapi_config")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: "UAZapi não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete message via UAZapi
    const response = await fetch(`${config.base_url}/message/delete`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": config.api_key,
      },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`UAZapi error: ${response.status} ${response.statusText} - ${text}`);
    }

    // Delete from database
    await supabase
      .from("whatsapp_messages")
      .delete()
      .eq("message_id", id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in uazapi-delete-message:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
