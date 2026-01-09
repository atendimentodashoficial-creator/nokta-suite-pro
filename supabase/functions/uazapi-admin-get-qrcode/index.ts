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
    console.log("=== Starting uazapi-admin-get-qrcode ===");

    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");

    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = rawAuth.replace("Bearer ", "");

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { base_url, api_key, use_admin } = body;

    if (!base_url) {
      return new Response(JSON.stringify({ success: false, error: "URL Base é obrigatória." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Getting QR code for:", base_url);

    const normalizedBaseUrl = base_url.replace(/\/+$/, '');

    // Determine which token to use
    let tokenHeader: Record<string, string> = {};
    
    if (use_admin) {
      const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN");
      if (!adminToken) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Admin token não configurado." 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tokenHeader = { "admintoken": adminToken };
    } else if (api_key) {
      // UAZapi uses "token" header for instance authentication
      tokenHeader = { 
        "token": api_key,
        "Authorization": `Bearer ${api_key}`,
      };
      console.log("Using api_key for auth, length:", api_key.length);
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "API Key ou modo admin é necessário." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // First, call POST /instance/connect to initiate connection and get QR code
    // According to UAZapi docs: POST /instance/connect without phone param generates QR code
    let qrCode: string | null = null;
    let lastError = "";
    let pairingCode: string | null = null;

    try {
      console.log("Calling POST /instance/connect to generate QR code");
      
      const connectResponse = await fetch(`${normalizedBaseUrl}/instance/connect`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          ...tokenHeader,
        },
        body: JSON.stringify({}), // Empty body = generate QR code (no phone = QR mode)
      });

      console.log("Connect response status:", connectResponse.status);

      if (connectResponse.ok) {
        const connectData = await connectResponse.json();
        console.log("Connect response data keys:", Object.keys(connectData));
        console.log("Connect response:", JSON.stringify(connectData));
        
        // Extract QR code from response
        qrCode = connectData.qrcode || connectData.qr || connectData.qr_code || 
                 connectData.base64 || connectData.data?.qrcode || connectData.data?.base64 ||
                 connectData.code;
        
        // Also check for pairing code
        pairingCode = connectData.pairingCode || connectData.pairing_code || connectData.code;
        
        if (qrCode && !qrCode.startsWith("data:image")) {
          qrCode = `data:image/png;base64,${qrCode}`;
        }
      } else {
        const errorText = await connectResponse.text().catch(() => "");
        console.error("Connect error:", errorText);
        lastError = errorText || `Status ${connectResponse.status}`;
      }
    } catch (e: any) {
      console.error("Error calling /instance/connect:", e.message);
      lastError = e.message;
    }

    // If /instance/connect didn't return QR, try GET endpoints as fallback
    if (!qrCode) {
      const qrEndpoints = [
        `${normalizedBaseUrl}/instance/qrcode`,
        `${normalizedBaseUrl}/instance/qr`,
        `${normalizedBaseUrl}/qrcode`,
      ];

      for (const endpoint of qrEndpoints) {
        try {
          console.log("Trying GET endpoint:", endpoint);
          
          const response = await fetch(endpoint, {
            method: "GET",
            headers: {
              "Accept": "application/json",
              ...tokenHeader,
            },
          });

          console.log("Response status:", response.status);

          if (response.ok) {
            const data = await response.json();
            console.log("QR response data keys:", Object.keys(data));
            
            qrCode = data.qrcode || data.qr || data.qr_code || data.base64 || data.data?.qrcode || data.data?.base64;
            
            if (qrCode) {
              if (!qrCode.startsWith("data:image")) {
                qrCode = `data:image/png;base64,${qrCode}`;
              }
              break;
            }
          } else {
            const text = await response.text().catch(() => "");
            if (!lastError) lastError = text || `Status ${response.status}`;
          }
        } catch (e: any) {
          if (!lastError) lastError = e.message;
          console.error("Error fetching QR from", endpoint, e.message);
        }
      }
    }

    // Also check instance status to see if already connected
    try {
      const statusResponse = await fetch(`${normalizedBaseUrl}/instance/status`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          ...tokenHeader,
        },
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log("Status data:", JSON.stringify(statusData));
        
        const nestedStatus = statusData?.status;
        const isConnected = statusData?.connected === true || 
                           nestedStatus?.connected === true ||
                           nestedStatus?.loggedIn === true ||
                           statusData?.state === "open" ||
                           statusData?.state === "connected";

        if (isConnected) {
          return new Response(JSON.stringify({ 
            success: true, 
            connected: true,
            message: "WhatsApp já está conectado!"
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (e) {
      console.error("Error checking status:", e);
    }

    if (qrCode) {
      return new Response(JSON.stringify({ 
        success: true, 
        qrcode: qrCode,
        connected: false,
        message: "Escaneie o QR Code com seu WhatsApp"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: `Não foi possível obter o QR Code. ${lastError}`,
      connected: false
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in uazapi-admin-get-qrcode:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || "Erro desconhecido"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
