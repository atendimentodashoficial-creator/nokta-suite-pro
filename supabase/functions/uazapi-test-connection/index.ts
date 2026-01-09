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
      // Common patterns: { state: "open" }, { status: "connected" }, { connected: true }
      // UAZapi pattern: { instance: { status: "disconnected" }, status: { connected: false, loggedIn: false } }
      const instanceStatus = statusData?.instance?.status;
      const nestedStatus = statusData?.status;
      const state = statusData?.state || instanceStatus || statusData?.connection_status;
      
      // Check if connected - support both root level and nested status object
      const isConnected = statusData?.connected === true || 
                          nestedStatus?.connected === true ||
                          nestedStatus?.loggedIn === true ||
                          state === "open" || 
                          state === "connected" || 
                          state === "CONNECTED" ||
                          statusData?.loggedIn === true ||
                          statusData?.authenticated === true;
      
      // Check for banned/disconnected states
      const isBanned = state === "BANNED" || 
                       state === "banned" || 
                       statusData?.banned === true ||
                       instanceStatus === "banned";
      const isDisconnected = state === "close" || 
                             state === "disconnected" || 
                             state === "DISCONNECTED" ||
                             state === "UNPAIRED" ||
                             instanceStatus === "disconnected" ||
                             nestedStatus?.connected === false ||
                             statusData?.connected === false;
      
      if (isBanned) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Este número foi banido do WhatsApp. Não é possível utilizar esta instância.",
          details: {
            url_testada: statusEndpoint,
            status: "banned",
            tipo_erro: "whatsapp_banned"
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (isDisconnected) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "WhatsApp desconectado. Reconecte o número escaneando o QR Code na plataforma UAZapi.",
          details: {
            url_testada: statusEndpoint,
            status: state || "disconnected",
            tipo_erro: "whatsapp_disconnected"
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (isConnected) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: "WhatsApp conectado e funcionando!",
          details: {
            url_testada: statusEndpoint,
            status: state || "connected",
            whatsapp_status: "connected"
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fallback: Test with /chat/find endpoint
    let response;
    const chatEndpoint = `${normalizedBaseUrl}/chat/find`;
    
    try {
      response = await fetch(chatEndpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "token": api_key,
        },
        body: JSON.stringify({
          limit: 1,
          offset: 0,
        }),
      });
    } catch (fetchError: any) {
      console.error("Chat fetch error:", fetchError.message);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Erro de conexão: ${fetchError.message}. Verifique se a URL está correta e acessível.`,
        details: {
          url_testada: chatEndpoint,
          tipo_erro: "connection_error"
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Chat response status:", response.status);

    if (response.status === 401 || response.status === 403) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "API Key inválida ou sem permissão. Verifique sua chave.",
        details: {
          url_testada: chatEndpoint,
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
          url_testada: chatEndpoint,
          status: response.status,
          resposta: text.substring(0, 500),
          tipo_erro: "api_error"
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // API is responding, but we couldn't verify WhatsApp status
    return new Response(JSON.stringify({ 
      success: true, 
      message: "API respondendo. Status do WhatsApp não pôde ser verificado.",
      details: {
        url_testada: chatEndpoint,
        status: response.status,
        whatsapp_status: "unknown"
      }
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
