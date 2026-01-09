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
    console.log("=== Starting uazapi-admin-list-instances ===");

    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");

    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin credentials from secrets
    const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN");
    const serverUrl = Deno.env.get("UAZAPI_SERVER_URL");

    if (!adminToken || !serverUrl) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Configuração de administração UAZapi não encontrada.",
        admin_configured: false
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Listing instances from:", serverUrl);

    const normalizedServerUrl = serverUrl.replace(/\/+$/, '');

    // List instances via UAZapi Admin API
    const listResponse = await fetch(`${normalizedServerUrl}/admin/instance/list`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "admintoken": adminToken,
      },
    });

    console.log("List response status:", listResponse.status);

    if (!listResponse.ok) {
      const errorText = await listResponse.text().catch(() => "");
      console.error("List instances error:", errorText);
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Erro ao listar instâncias: " + (errorText || listResponse.statusText),
        admin_configured: true
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const listData = await listResponse.json();
    console.log("List response data:", JSON.stringify(listData));

    // Extract instances array
    const instances = listData.instances || listData.data || listData || [];

    return new Response(JSON.stringify({ 
      success: true, 
      instances: Array.isArray(instances) ? instances : [],
      admin_configured: true,
      server_url: normalizedServerUrl
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in uazapi-admin-list-instances:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || "Erro desconhecido",
      admin_configured: false
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
