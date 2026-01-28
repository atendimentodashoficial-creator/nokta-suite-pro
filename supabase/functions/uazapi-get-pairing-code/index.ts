import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== Starting uazapi-get-pairing-code ===");

    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");

    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { base_url, api_key, phone_number } = body;

    if (!base_url) {
      return new Response(JSON.stringify({ success: false, error: "URL Base é obrigatória." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!phone_number) {
      return new Response(JSON.stringify({ success: false, error: "Número de telefone é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Getting pairing code for:", base_url, "phone:", phone_number);

    const normalizedBaseUrl = base_url.replace(/\/+$/, '');

    // Build auth headers
    const tokenHeader: Record<string, string> = api_key 
      ? { 
          "token": api_key,
          "Authorization": `Bearer ${api_key}`,
        }
      : {};

    // Clean phone number (remove non-digits)
    const cleanPhone = phone_number.replace(/\D/g, '');

    // First check if already connected
    try {
      const statusResp = await fetch(`${normalizedBaseUrl}/instance/status`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          ...tokenHeader,
        },
      });

      if (statusResp.ok) {
        const statusData = await statusResp.json().catch(() => null);
        const nested = statusData?.status;
        const loggedInFlag = nested?.loggedIn === true || statusData?.loggedIn === true;
        const jid = nested?.jid ?? statusData?.jid;
        
        if (loggedInFlag && jid) {
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

    // Try to get pairing code via different UAZAPI endpoints
    let pairingCode: string | null = null;
    let lastError = "";

    // Method 1: POST /instance/connect with number in body (Evolution API style)
    try {
      console.log("Trying POST /instance/connect with phone number");
      
      const connectResponse = await fetch(`${normalizedBaseUrl}/instance/connect`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          ...tokenHeader,
        },
        body: JSON.stringify({ 
          number: cleanPhone,
          phoneNumber: cleanPhone,
        }),
      });

      console.log("Connect response status:", connectResponse.status);

      if (connectResponse.ok) {
        const connectData = await connectResponse.json().catch(() => ({}));
        console.log("Connect response:", JSON.stringify(connectData));

        pairingCode =
          connectData.pairingCode ||
          connectData.pairing_code ||
          connectData.code ||
          connectData.paircode ||
          connectData?.instance?.paircode ||
          connectData?.instance?.pairingCode;

        if (pairingCode) {
          // Format pairing code with dash for readability (XXXX-XXXX)
          const formattedCode = pairingCode.length === 8
            ? `${pairingCode.substring(0, 4)}-${pairingCode.substring(4)}`
            : pairingCode;

          return new Response(
            JSON.stringify({
              success: true,
              pairingCode: formattedCode,
              rawCode: pairingCode,
              connected: false,
              message: "Use este código no WhatsApp para conectar",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Some servers don't support pairing codes and only return a QR.
        const qrFromConnect = connectData?.qrcode || connectData?.qr || connectData?.qr_code || connectData?.instance?.qrcode;
        const providerMsg = connectData?.message || connectData?.response || connectData?.error || "";
        if (qrFromConnect) {
          lastError = "Este servidor não retornou código de pareamento (apenas QR Code). Use a opção 'QR Code'.";
        } else if (providerMsg) {
          lastError = String(providerMsg);
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

    // Method 2: Try /instance/paircode (UAZAPI specific)
    try {
      console.log("Trying POST /instance/paircode (UAZAPI)");
      
      const pairingResponse = await fetch(`${normalizedBaseUrl}/instance/paircode`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          ...tokenHeader,
        },
        body: JSON.stringify({ 
          number: cleanPhone,
          phone: cleanPhone,
          phoneNumber: cleanPhone,
        }),
      });

      console.log("Paircode response status:", pairingResponse.status);

      if (pairingResponse.ok) {
        const pairingData = await pairingResponse.json().catch(() => ({}));
        console.log("Paircode response:", JSON.stringify(pairingData));

        pairingCode = pairingData.pairingCode || pairingData.pairing_code || pairingData.code || pairingData.paircode;
        
        if (pairingCode) {
          const formattedCode = pairingCode.length === 8 
            ? `${pairingCode.substring(0, 4)}-${pairingCode.substring(4)}`
            : pairingCode;

          return new Response(JSON.stringify({ 
            success: true, 
            pairingCode: formattedCode,
            rawCode: pairingCode,
            connected: false,
            message: "Use este código no WhatsApp para conectar"
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const errorText = await pairingResponse.text().catch(() => "");
        console.error("Paircode error:", errorText);
      }
    } catch (e: any) {
      console.error("Error calling /instance/paircode:", e.message);
    }

    // Method 3: Try GET /instance/paircode/{phone} (alternative UAZAPI format)
    try {
      console.log("Trying GET /instance/paircode/" + cleanPhone);
      
      const pairingResponse = await fetch(`${normalizedBaseUrl}/instance/paircode/${cleanPhone}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          ...tokenHeader,
        },
      });

      console.log("GET Paircode response status:", pairingResponse.status);

      if (pairingResponse.ok) {
        const pairingData = await pairingResponse.json().catch(() => ({}));
        console.log("GET Paircode response:", JSON.stringify(pairingData));

        pairingCode = pairingData.pairingCode || pairingData.pairing_code || pairingData.code || pairingData.paircode;
        
        if (pairingCode) {
          const formattedCode = pairingCode.length === 8 
            ? `${pairingCode.substring(0, 4)}-${pairingCode.substring(4)}`
            : pairingCode;

          return new Response(JSON.stringify({ 
            success: true, 
            pairingCode: formattedCode,
            rawCode: pairingCode,
            connected: false,
            message: "Use este código no WhatsApp para conectar"
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (e: any) {
      console.error("Error with GET /instance/paircode:", e.message);
    }

    // Method 4: Try GET /instance/connect?paircode=true&phone={number}
    try {
      console.log("Trying GET /instance/connect with paircode param");
      
      const connectResponse = await fetch(`${normalizedBaseUrl}/instance/connect?paircode=true&number=${cleanPhone}&phone=${cleanPhone}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          ...tokenHeader,
        },
      });

      console.log("GET connect paircode response status:", connectResponse.status);

      if (connectResponse.ok) {
        const connectData = await connectResponse.json().catch(() => ({}));
        console.log("GET Connect paircode response:", JSON.stringify(connectData));

        pairingCode = connectData.pairingCode || connectData.pairing_code || connectData.code || connectData.paircode;
        
        if (pairingCode) {
          const formattedCode = pairingCode.length === 8 
            ? `${pairingCode.substring(0, 4)}-${pairingCode.substring(4)}`
            : pairingCode;

          return new Response(JSON.stringify({ 
            success: true, 
            pairingCode: formattedCode,
            rawCode: pairingCode,
            connected: false,
            message: "Use este código no WhatsApp para conectar"
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (e: any) {
      console.error("Error with GET /instance/connect paircode:", e.message);
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: `Não foi possível obter o código de pareamento. ${lastError}`,
      connected: false
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in uazapi-get-pairing-code:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || "Erro desconhecido"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
