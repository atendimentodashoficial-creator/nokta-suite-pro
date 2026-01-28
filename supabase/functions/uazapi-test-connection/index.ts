import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    console.log("=== Starting uazapi-test-connection ===");

    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");

    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado. Faça login novamente." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = rawAuth.replace("Bearer ", "");

    // Parse request body for base_url and api_key
    const body = await req.json().catch(() => ({}));
    const { base_url, api_key } = body;

    if (!base_url || !api_key) {
      return new Response(JSON.stringify({ success: false, error: "URL Base e API Key são obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Testing connection to:", base_url);
    console.log("API Key length:", api_key?.length || 0);

    // Normalize base_url by removing trailing slash
    const normalizedBaseUrl = base_url.replace(/\/+$/, '');
    
    // First, check instance status to see if WhatsApp is actually connected
    let statusResponse;
    const statusEndpoint = `${normalizedBaseUrl}/instance/status`;
    
    try {
      statusResponse = await fetch(statusEndpoint, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "token": api_key,
        },
      });
    } catch (fetchError: any) {
      console.error("Status fetch error:", fetchError.message);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Erro de conexão: ${fetchError.message}. Verifique se a URL está correta e acessível.`,
        details: {
          url_testada: statusEndpoint,
          tipo_erro: "connection_error"
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Status response:", statusResponse.status);

    // Check response
    if (statusResponse.status === 401 || statusResponse.status === 403) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "API Key inválida ou sem permissão. Verifique sua chave.",
        details: {
          url_testada: statusEndpoint,
          status: statusResponse.status,
          tipo_erro: "auth_error"
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (statusResponse.status === 404) {
      // Fallback to /chat/find if /instance/status doesn't exist
      console.log("Status endpoint not found, falling back to chat/find");
    } else if (statusResponse.ok) {
      const statusData = await statusResponse.json().catch(() => null);
      console.log("Status data:", JSON.stringify(statusData));
      
      // Check various status field patterns
      // UAZapi pattern (observed):
      // {
      //   instance: { status: "connected" },
      //   status: { connected: true, loggedIn: true, jid: "553497102989:13@s.whatsapp.net" }
      // }
      const instanceStatus = statusData?.instance?.status;
      const nestedStatus = statusData?.status;
      const state = statusData?.state || instanceStatus || statusData?.connection_status;

      // FIRST: Check if currently connected - this takes priority over lastDisconnectReason
      // The loggedIn and connected flags in status object represent the CURRENT state
      const loggedInFlag = nestedStatus?.loggedIn === true || statusData?.loggedIn === true;
      const jid = nestedStatus?.jid ?? statusData?.jid;
      const connectedFlag = nestedStatus?.connected;

      const stateLower = String(state || "").toLowerCase();
      const instanceStatusLower = String(instanceStatus || "").toLowerCase();

      const isTransitional =
        stateLower === "connecting" ||
        stateLower === "starting" ||
        instanceStatusLower === "connecting" ||
        instanceStatusLower === "starting";

      const hasJid = jid != null && String(jid).length > 0;
      
      // For connected check: if connectedFlag is explicitly true, trust it
      // If undefined but loggedIn is true and jid exists, consider connected
      const connectedIsOk = connectedFlag === true || (connectedFlag === undefined && loggedInFlag && hasJid);

      // Also check instance.status === "connected" as a primary indicator
      const instanceShowsConnected = instanceStatusLower === "connected";

      const isReallyConnected = (loggedInFlag === true && hasJid && connectedIsOk && !isTransitional) || 
                                 (instanceShowsConnected && loggedInFlag === true && hasJid);

      console.log("Connection check:", { 
        instanceStatus, 
        loggedInFlag, 
        hasJid, 
        connectedFlag, 
        isReallyConnected,
        instanceShowsConnected
      });

      // If currently connected, return success immediately - don't check lastDisconnectReason
      if (isReallyConnected) {
        return new Response(JSON.stringify({
          success: true,
          message: "WhatsApp conectado e funcionando!",
          details: {
            url_testada: statusEndpoint,
            status: state || "connected",
            whatsapp_status: "connected",
            loggedIn: true,
            jid: String(jid),
            connected: true,
            instance_status: instanceStatus,
            raw_state: state,
          },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only check lastDisconnectReason if NOT currently connected
      const lastDisconnectReason = statusData?.instance?.lastDisconnectReason;
      const lastDisconnectAt = statusData?.instance?.lastDisconnect;

      // Some providers report "connected" in the panel, but WhatsApp rejects the pairing.
      // When that happens, UAZapi often records a lastDisconnectReason like "connection attempt canceled".
      // But we ONLY check this if the instance is NOT currently connected
      if (
        typeof lastDisconnectReason === "string" &&
        /canceled|cancelled|não foi possivel|nao foi possivel|not possible|pairing failed/i.test(lastDisconnectReason)
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "O WhatsApp recusou a conexão no celular (pareamento cancelado). Tente gerar um novo QR Code e conectar novamente.",
            details: {
              url_testada: statusEndpoint,
              status: state || instanceStatus || "unknown",
              whatsapp_status: "pairing_failed",
              last_disconnect_reason: lastDisconnectReason,
              last_disconnect_at: lastDisconnectAt ?? null,
              instance_status: instanceStatus,
              raw_state: state,
              tipo_erro: "pairing_rejected",
            },
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check for banned/disconnected states
      const isBanned =
        state === "BANNED" ||
        state === "banned" ||
        statusData?.banned === true ||
        instanceStatus === "banned";

      const isDisconnected =
        state === "close" ||
        state === "disconnected" ||
        state === "DISCONNECTED" ||
        state === "UNPAIRED" ||
        instanceStatusLower === "disconnected" ||
        instanceStatusLower === "close";

      if (isBanned) {
        return new Response(JSON.stringify({
          success: false,
          error: "Este número foi banido do WhatsApp. Não é possível utilizar esta instância.",
          details: {
            url_testada: statusEndpoint,
            status: "banned",
            whatsapp_status: "banned",
            tipo_erro: "whatsapp_banned",
          },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isDisconnected) {
        return new Response(JSON.stringify({
          success: false,
          error: "WhatsApp desconectado. Escaneie o QR Code para conectar.",
          details: {
            url_testada: statusEndpoint,
            status: state || "disconnected",
            whatsapp_status: "disconnected",
            tipo_erro: "whatsapp_disconnected",
          },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Not connected yet (waiting for QR scan / pairing)
      return new Response(JSON.stringify({
        success: false,
        error: "WhatsApp ainda não autenticado. Escaneie o QR Code para conectar.",
        details: {
          url_testada: statusEndpoint,
          status: state || "connecting",
          whatsapp_status: isTransitional ? "connecting" : "not_logged_in",
          loggedIn: Boolean(loggedInFlag),
          jid: hasJid ? String(jid) : null,
          connected: connectedFlag === undefined ? null : Boolean(connectedFlag),
          instance_status: instanceStatus,
          raw_state: state,
          tipo_erro: "waiting_qr_scan",
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: /instance/status returned 404, API might be using a different structure
    // Just verify that the base URL and API key are valid by making a simple authenticated request
    // IMPORTANT: Do NOT use /chat/find as it can interfere with WhatsApp connection
    let response;
    const infoEndpoint = `${normalizedBaseUrl}/instance/info`;
    
    try {
      response = await fetch(infoEndpoint, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "token": api_key,
        },
      });
    } catch (fetchError: any) {
      console.error("Info fetch error:", fetchError.message);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Erro de conexão: ${fetchError.message}. Verifique se a URL está correta e acessível.`,
        details: {
          url_testada: infoEndpoint,
          tipo_erro: "connection_error"
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Info response status:", response.status);

    if (response.status === 401 || response.status === 403) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "API Key inválida ou sem permissão. Verifique sua chave.",
        details: {
          url_testada: infoEndpoint,
          status: response.status,
          tipo_erro: "auth_error"
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Erro na API (${response.status}): ${text || response.statusText}`,
        details: {
          url_testada: infoEndpoint,
          status: response.status,
          resposta: text.substring(0, 500),
          tipo_erro: "api_error"
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // API is responding, credentials are valid
    // We couldn't determine WhatsApp status from /instance/status, so report as needing QR
    return new Response(JSON.stringify({
      success: false,
      error: "Credenciais válidas, mas não foi possível verificar o status do WhatsApp. Escaneie o QR Code.",
      details: {
        url_testada: infoEndpoint,
        status: response.status,
        whatsapp_status: "unknown",
        tipo_erro: "waiting_qr_scan",
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in uazapi-test-connection:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || "Erro desconhecido ao testar conexão"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
