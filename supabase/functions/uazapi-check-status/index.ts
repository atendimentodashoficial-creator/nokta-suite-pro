const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Lightweight status check - does NOT call /chat/find to avoid interfering with pairing
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");

    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { base_url, api_key } = body;

    if (!base_url || !api_key) {
      return new Response(JSON.stringify({ success: false, error: "URL Base e API Key são obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedBaseUrl = base_url.replace(/\/+$/, '');
    
    // ONLY check /instance/status - no heavy validation to avoid pairing interference
    const statusResponse = await fetch(`${normalizedBaseUrl}/instance/status`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": api_key,
      },
    });

    if (!statusResponse.ok) {
      return new Response(JSON.stringify({ 
        success: false, 
        status: "unknown",
        error: `Status check failed: ${statusResponse.status}`
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const statusData = await statusResponse.json().catch(() => null);
    
    if (!statusData) {
      return new Response(JSON.stringify({ 
        success: false, 
        status: "unknown" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nestedStatus = statusData?.status;
    const instanceData = statusData?.instance;
    const instanceStatus = instanceData?.status;
    
    // Check for definitive connected state
    const loggedIn = nestedStatus?.loggedIn === true || statusData?.loggedIn === true;
    const jid = nestedStatus?.jid ?? statusData?.jid;
    const connected = nestedStatus?.connected === true || statusData?.connected === true;
    
    // Check for transitional states - should NOT be treated as connected
    const isConnecting = instanceStatus === "connecting" || instanceStatus === "starting";
    
    // Check for disconnected state - IMPORTANT: check this BEFORE checking connected
    const isDisconnected = instanceStatus === "disconnected" || 
                           instanceStatus === "close" || 
                           instanceStatus === "DISCONNECTED" ||
                           nestedStatus?.connected === false ||
                           statusData?.connected === false;
    
    // Only consider truly connected if:
    // 1. loggedIn is true
    // 2. jid is present (has a valid phone number)
    // 3. not in transitional state
    // 4. not explicitly disconnected
    // 5. connected flag is true (when available)
    const hasValidJid = jid != null && String(jid).length > 0;
    const isReallyConnected = loggedIn === true && 
                              hasValidJid && 
                              !isConnecting && 
                              !isDisconnected &&
                              (connected === true || connected === undefined); // Accept if connected is true or not reported

    console.log("[uazapi-check-status] Debug:", {
      loggedIn,
      jid: hasValidJid ? String(jid).substring(0, 6) + "..." : null,
      connected,
      instanceStatus,
      isConnecting,
      isDisconnected,
      isReallyConnected,
      nestedStatus: JSON.stringify(nestedStatus).substring(0, 100),
    });

    return new Response(JSON.stringify({ 
      success: isReallyConnected,
      status: isReallyConnected ? "connected" : (isConnecting ? "connecting" : (isDisconnected ? "disconnected" : "waiting")),
      loggedIn: Boolean(loggedIn),
      jid: hasValidJid ? String(jid) : null,
      connected: connected,
      instanceStatus: instanceStatus,
      isConnecting: isConnecting,
      isDisconnected: isDisconnected,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in uazapi-check-status:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      status: "error",
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
