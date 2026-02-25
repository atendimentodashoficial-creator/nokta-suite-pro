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

    // Get user's UAZapi configuration - try uazapi_config first, then fall back to disparos_instancias
    let config: { base_url: string; api_key: string } | null = null;

    const { data: uazapiConfig } = await supabase
      .from("uazapi_config")
      .select("base_url, api_key")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (uazapiConfig) {
      config = uazapiConfig;
    } else {
      // Fallback: try the first active disparos_instancias for this user
      const { data: instancia } = await supabase
        .from("disparos_instancias")
        .select("base_url, api_key")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (instancia) {
        config = instancia;
      }
    }

    if (!config) {
      return new Response(
        JSON.stringify({ error: "UAZapi não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch labels from UAZapi
    let labels = [];
    
    try {
      const response = await fetch(`${config.base_url}/label`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "token": config.api_key,
        },
      });

      if (response.ok) {
        labels = await response.json();
      } else {
        console.log("Labels endpoint not available, continuing without labels");
      }
    } catch (err) {
      console.log("Error fetching labels (non-critical):", err);
    }

    // Sync labels to database
    const labelsToUpsert = (Array.isArray(labels) ? labels : []).map((label: any) => ({
      user_id: user.id,
      label_id: label.id || label.labelId,
      label_name: label.name || label.labelName || "Sem nome",
      label_color: label.color || null,
      updated_at: new Date().toISOString(),
    }));

    if (labelsToUpsert.length > 0) {
      await supabase
        .from("whatsapp_labels")
        .upsert(labelsToUpsert, {
          onConflict: "user_id,label_id",
          ignoreDuplicates: false,
        });
    }

    return new Response(
      JSON.stringify({ success: true, labels }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in uazapi-get-labels:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
