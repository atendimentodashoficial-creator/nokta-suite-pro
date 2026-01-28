import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const decodeAdminToken = (token: string): string | null => {
  try {
    const decoded = atob(token);
    const [adminId] = decoded.split(":");
    if (adminId && adminId.length === 36 && adminId.includes("-")) return adminId;
    return null;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    const jwtOrAdminToken = rawAuth.replace("Bearer ", "");

    // Initialize Supabase client to verify user/admin
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT (cliente) OR admin_token (painel admin)
    let authorized = false;
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwtOrAdminToken);
      if (!authError && user) authorized = true;
    } catch {
      // ignore
    }

    if (!authorized) {
      const adminId = decodeAdminToken(jwtOrAdminToken);
      if (adminId) {
        const { data: adminUser, error: adminErr } = await supabaseClient
          .from("admin_users")
          .select("id")
          .eq("id", adminId)
          .maybeSingle();
        if (!adminErr && adminUser) authorized = true;
      }
    }

    if (!authorized) {
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
      { url: `${normalizedBaseUrl}/webhook/set`, method: "PUT" },
      { url: `${normalizedBaseUrl}/webhook/set`, method: "POST" },
      { url: `${normalizedBaseUrl}/webhook`, method: "PUT" },
      { url: `${normalizedBaseUrl}/webhook`, method: "POST" },
      { url: `${normalizedBaseUrl}/instance/webhook`, method: "PUT" },
      { url: `${normalizedBaseUrl}/instance/webhook`, method: "POST" },
    ];

    // Complete payload with all necessary fields for UAZAPI
    const fullPayload = {
      url: webhook_url,
      enabled: true,
      webhook_by_events: false,
      addUrlEvents: true,
      addUrlTypesMessages: true,
      events: [
        "QRCODE_UPDATED",
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "MESSAGES_DELETE",
        "SEND_MESSAGE",
        "CONNECTION_UPDATE",
        "CALL",
      ],
    };

    // Some UAZAPI panels require the generic "messages" subscription instead of explicit event names.
    const messagesOnlyPayloads = [
      { url: webhook_url, enabled: true, addUrlEvents: true, addUrlTypesMessages: true, webhook_by_events: true, events: ["messages"] },
      { url: webhook_url, enabled: true, addUrlEvents: true, addUrlTypesMessages: true, webhook_by_events: true, events: "messages" },
      { url: webhook_url, enabled: true, addUrlEvents: true, addUrlTypesMessages: true, webhook_by_events: true, Events: "messages" },
    ];

    // Also try simpler payloads as fallback
    const payloads = [
      ...messagesOnlyPayloads,
      fullPayload,
      { url: webhook_url, enabled: true, addUrlEvents: true, addUrlTypesMessages: true, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"] },
      { url: webhook_url, enabled: true, addUrlEvents: true, addUrlTypesMessages: true },
      { url: webhook_url, enabled: true },
    ];

    let success = false;
    let lastError = "";
    let lastResponse: any = null;

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
            console.log("Response data:", JSON.stringify(data));
            lastResponse = data;
            
            // Check if webhook is actually enabled
            const webhookData = Array.isArray(data) ? data[0] : data;
            if (webhookData?.enabled === true || webhookData?.success === true || response.status === 200) {
              console.log("Webhook configured successfully!");
              success = true;
              break;
            }
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

    // If first attempts didn't enable it, try to explicitly enable
    if (!success && lastResponse) {
      console.log("Trying to explicitly enable webhook...");
      try {
        const enableResponse = await fetch(`${normalizedBaseUrl}/webhook/set`, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": api_key,
          },
          body: JSON.stringify({
            ...fullPayload,
            id: lastResponse?.id || (Array.isArray(lastResponse) ? lastResponse[0]?.id : undefined),
          }),
        });
        
        if (enableResponse.ok) {
          const enableData = await enableResponse.json().catch(() => ({}));
          console.log("Enable response:", JSON.stringify(enableData));
          success = true;
        }
      } catch (e: any) {
        console.error("Enable error:", e.message);
      }
    }

    if (success) {
      // Some UAZAPI panels require explicitly defining which events should be forwarded.
      // We'll best-effort configure it, but don't fail the whole setup if this part isn't supported.
      const eventSetupAttempts: Array<{ endpoint: string; method: string; ok: boolean; status?: number; body?: string }> = [];
      const eventEndpoints = [
        { url: `${normalizedBaseUrl}/webhook/events`, method: "PUT" },
        { url: `${normalizedBaseUrl}/webhook/events`, method: "POST" },
        { url: `${normalizedBaseUrl}/webhook/listen`, method: "POST" },
      ];
      const eventPayloads = [
        // Panel hint: "coloque 'messages'"
        { events: ["messages"], autoPath: false },
        { events: ["messages"], autoPath: true },
        // Fallback to explicit event names (some servers expect this)
        { events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE"], autoPath: false },
      ];

      for (const ep of eventEndpoints) {
        for (const payload of eventPayloads) {
          try {
            const r = await fetch(ep.url, {
              method: ep.method,
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "token": api_key,
              },
              body: JSON.stringify(payload),
            });
            const text = await r.text().catch(() => "");
            eventSetupAttempts.push({ endpoint: ep.url, method: ep.method, ok: r.ok, status: r.status, body: text?.slice(0, 500) });
            if (r.ok) break;
          } catch (e: any) {
            eventSetupAttempts.push({ endpoint: ep.url, method: ep.method, ok: false, body: e?.message || String(e) });
          }
        }
      }

      // Update the instance record with webhook configured status
      if (instancia_id) {
        await supabaseClient
          .from("disparos_instancias")
          .update({
            last_webhook_at: new Date().toISOString(),
          })
          .eq("id", instancia_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Webhook configurado com sucesso!",
          event_setup: eventSetupAttempts,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
