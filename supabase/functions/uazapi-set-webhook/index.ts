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
    console.log("=== Starting uazapi-set-webhook ===");

    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");

    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = rawAuth.replace("Bearer ", "");

    // Initialize Supabase client to verify user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Token inválido." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { base_url, api_key, webhook_url, instancia_id } = body;

    if (!base_url || !api_key || !webhook_url) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "URL Base, API Key e Webhook URL são obrigatórios." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Setting webhook for:", base_url);
    console.log("Webhook URL:", webhook_url);

    const normalizedBaseUrl = base_url.replace(/\/+$/, '');

    // Try multiple webhook endpoints (different UAZapi versions)
    const webhookEndpoints = [
      { url: `${normalizedBaseUrl}/webhook/set`, method: "POST" },
      { url: `${normalizedBaseUrl}/webhook`, method: "POST" },
      { url: `${normalizedBaseUrl}/instance/webhook`, method: "POST" },
      { url: `${normalizedBaseUrl}/config/webhook`, method: "POST" },
    ];

    // Different payload formats to try
    const payloads = [
      { url: webhook_url },
      { webhook: webhook_url },
      { webhookUrl: webhook_url },
      { webhook_url: webhook_url },
    ];

    let success = false;
    let lastError = "";

    for (const endpoint of webhookEndpoints) {
      for (const payload of payloads) {
        try {
          console.log(`Trying ${endpoint.method} ${endpoint.url} with payload:`, JSON.stringify(payload));
          
          const response = await fetch(endpoint.url, {
            method: endpoint.method,
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "token": api_key,
            },
            body: JSON.stringify(payload),
          });

          console.log("Response status:", response.status);

          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            console.log("Success! Response:", JSON.stringify(data));
            success = true;
            break;
          } else if (response.status !== 404 && response.status !== 405) {
            const text = await response.text().catch(() => "");
            lastError = text || `Status ${response.status}`;
          }
        } catch (e: any) {
          console.error("Error:", e.message);
          lastError = e.message;
        }
      }
      
      if (success) break;
    }

    if (success) {
      // Update the instance record with webhook configured status
      if (instancia_id) {
        await supabaseClient
          .from("disparos_instancias")
          .update({ 
            last_webhook_at: new Date().toISOString(),
          })
          .eq("id", instancia_id);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Webhook configurado com sucesso!"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: `Não foi possível configurar o webhook. ${lastError}`,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in uazapi-set-webhook:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || "Erro desconhecido"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
