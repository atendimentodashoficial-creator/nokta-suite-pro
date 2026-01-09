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

    // Helper: fetch QR from /instance/status (different UAZapi versions expose it in different fields)
    const fetchQrFromStatusOnce = async (): Promise<string | null> => {
      const statusResp = await fetch(`${normalizedBaseUrl}/instance/status`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          ...tokenHeader,
        },
      });

      if (!statusResp.ok) return null;

      const statusData = await statusResp.json().catch(() => null);
      if (!statusData) return null;

      const candidates = [
        statusData?.qrcode,
        statusData?.qr,
        statusData?.qr_code,
        statusData?.base64,
        statusData?.data?.qrcode,
        statusData?.data?.base64,
        statusData?.instance?.qrcode,
        statusData?.instance?.qr,
        statusData?.instance?.base64,
        statusData?.status?.qrcode,
        statusData?.status?.qr,
        statusData?.status?.base64,
      ].filter(Boolean);

      const found = candidates.length ? String(candidates[0]) : null;
      if (!found) return null;

      return found.startsWith("data:image") ? found : `data:image/png;base64,${found}`;
    };

    const waitForQrFromStatus = async (timeoutMs = 30000, intervalMs = 2000): Promise<string | null> => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const qr = await fetchQrFromStatusOnce();
        if (qr) return qr;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return null;
    };

    // First, try POST /instance/connect to initiate connection and (sometimes) return QR code
    // Some UAZapi deployments return 404 or "use /instance/status"; in those cases we fall back to polling /instance/status.
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
        body: JSON.stringify({}),
      });

      console.log("Connect response status:", connectResponse.status);

      if (connectResponse.ok) {
        const connectData = await connectResponse.json().catch(() => ({}));
        console.log("Connect response data keys:", Object.keys(connectData || {}));
        console.log("Connect response:", JSON.stringify(connectData));

        qrCode = connectData.qrcode ||
          connectData.qr ||
          connectData.qr_code ||
          connectData.base64 ||
          connectData.data?.qrcode ||
          connectData.data?.base64 ||
          connectData.code;

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

    // If connect didn't return QR, poll /instance/status to retrieve it (recommended by some UAZapi responses)
    if (!qrCode) {
      console.log("QR not returned by /instance/connect. Polling /instance/status for QR...");
      qrCode = await waitForQrFromStatus(30000, 2000);
    }

    // If still no QR, try legacy GET endpoints as last resort
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
            const data = await response.json().catch(() => ({}));
            console.log("QR response data keys:", Object.keys(data || {}));

            const raw = data.qrcode || data.qr || data.qr_code || data.base64 || data.data?.qrcode || data.data?.base64;
            if (raw) {
              qrCode = String(raw);
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
        const instanceData = statusData?.instance;
        
        // Check if actually logged in (avoid false positives while still connecting)
        const nested = statusData?.status;
        const instanceStatus = statusData?.instance?.status;
        const state = statusData?.state || instanceStatus || statusData?.connection_status;
        const stateLower = String(state || "").toLowerCase();
        const instanceStatusLower = String(instanceStatus || "").toLowerCase();
        const isTransitional =
          stateLower === "connecting" ||
          stateLower === "starting" ||
          instanceStatusLower === "connecting" ||
          instanceStatusLower === "starting";

        const loggedInFlag = nested?.loggedIn === true || statusData?.loggedIn === true;
        const jid = nested?.jid ?? statusData?.jid;
        const isLoggedIn = loggedInFlag === true && jid != null && String(jid).length > 0 && !isTransitional;
        
        // Also check instance QR code from status response
        if (!qrCode && instanceData?.qrcode) {
          qrCode = instanceData.qrcode;
          if (qrCode && !qrCode.startsWith("data:image")) {
            qrCode = `data:image/png;base64,${qrCode}`;
          }
        }

        if (isLoggedIn) {
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
