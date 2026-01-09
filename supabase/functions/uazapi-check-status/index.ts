const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lightweight status check - does NOT call /chat/find to avoid interfering with pairing
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const connected = nestedStatus?.connected;
    
    // Check for transitional states - should NOT be treated as connected
    const isConnecting = instanceStatus === "connecting" || instanceStatus === "starting";
    
    // Only consider truly connected if:
    // 1. loggedIn is true
    // 2. jid is present (has a valid phone number)
    // 3. not in transitional state
    const hasValidJid = jid != null && String(jid).length > 0;
    const isReallyConnected = loggedIn === true && hasValidJid && !isConnecting;
    
    // Check for disconnected state
    const isDisconnected = instanceStatus === "disconnected" || instanceStatus === "close";

    return new Response(JSON.stringify({ 
      success: isReallyConnected,
      status: isReallyConnected ? "connected" : (isConnecting ? "connecting" : (isDisconnected ? "disconnected" : "waiting")),
      loggedIn: Boolean(loggedIn),
      jid: hasValidJid ? String(jid) : null,
      connected: connected,
      instanceStatus: instanceStatus,
      isConnecting: isConnecting,
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
