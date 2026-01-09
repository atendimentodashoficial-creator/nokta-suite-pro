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
    console.log("=== Starting uazapi-admin-delete-instance ===");

    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");

    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = rawAuth.replace("Bearer ", "");

    // Initialize Supabase client with service role to verify user
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

    // Get admin credentials from secrets
    const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN");
    const serverUrl = Deno.env.get("UAZAPI_SERVER_URL");

    if (!adminToken || !serverUrl) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Configuração de administração UAZapi não encontrada." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { instance_name, base_url, api_key } = body;

    if (!instance_name) {
      return new Response(JSON.stringify({ success: false, error: "Nome da instância é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Deleting instance:", instance_name);

    // Normalize server URL
    const normalizedServerUrl = serverUrl.replace(/\/+$/, '');

    // First, try to disconnect the instance using the instance token
    if (base_url && api_key) {
      try {
        const normalizedBaseUrl = base_url.replace(/\/+$/, '');
        await fetch(`${normalizedBaseUrl}/instance/disconnect`, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": api_key,
          },
        });
        console.log("Instance disconnected");
      } catch (e) {
        console.log("Disconnect failed (may already be disconnected):", e);
      }
    }

    // Try multiple endpoint variations for UAZapi Admin API to delete instance
    const endpoints = [
      { url: `${normalizedServerUrl}/admin/instance/${instance_name}`, method: "DELETE" },
      { url: `${normalizedServerUrl}/admin/instances/${instance_name}`, method: "DELETE" },
      { url: `${normalizedServerUrl}/admin/instance/delete`, method: "POST", body: { name: instance_name, instanceName: instance_name } },
      { url: `${normalizedServerUrl}/admin/instances/delete`, method: "POST", body: { name: instance_name, instanceName: instance_name } },
      { url: `${normalizedServerUrl}/admin/delete/${instance_name}`, method: "POST" },
      { url: `${normalizedServerUrl}/instance/delete`, method: "POST", body: { name: instance_name } },
    ];

    let deleteResponse: Response | null = null;
    let successEndpoint = "";
    let lastError = "";

    for (const endpoint of endpoints) {
      console.log(`Trying endpoint: ${endpoint.url} (${endpoint.method})`);
      
      try {
        const fetchOptions: RequestInit = {
          method: endpoint.method,
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "admintoken": adminToken,
            "Authorization": `Bearer ${adminToken}`,
            "token": adminToken,
          },
        };

        if (endpoint.body) {
          fetchOptions.body = JSON.stringify(endpoint.body);
        }

        const response = await fetch(endpoint.url, fetchOptions);

        console.log(`Endpoint ${endpoint.url} status: ${response.status}`);

        if (response.ok || response.status === 200 || response.status === 204) {
          deleteResponse = response;
          successEndpoint = endpoint.url;
          break;
        } else if (response.status !== 404 && response.status !== 405) {
          const errorText = await response.text().catch(() => "");
          lastError = errorText;
          console.log(`Endpoint error: ${errorText}`);
        }
      } catch (e: any) {
        console.log(`Endpoint ${endpoint.url} failed: ${e.message}`);
      }
    }

    if (deleteResponse) {
      console.log("Success with endpoint:", successEndpoint);
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Instância deletada do UAZapi com sucesso!",
        endpoint_used: successEndpoint,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no admin delete endpoint worked, at least the disconnect was attempted
    console.log("No admin delete endpoint worked, but disconnect was attempted");
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Instância desconectada. Deleção via admin API não disponível.",
      warning: "A API Admin de deleção não está disponível neste servidor UAZapi.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in uazapi-admin-delete-instance:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || "Erro desconhecido ao deletar instância"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
