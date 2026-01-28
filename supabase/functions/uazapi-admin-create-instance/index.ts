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
    console.log("=== Starting uazapi-admin-create-instance ===");

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
        error: "Configuração de administração UAZapi não encontrada. Configure UAZAPI_ADMIN_TOKEN e UAZAPI_SERVER_URL." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { instance_name } = body;

    if (!instance_name) {
      return new Response(JSON.stringify({ success: false, error: "Nome da instância é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Creating instance:", instance_name);
    console.log("Server URL:", serverUrl);

    // Normalize server URL
    const normalizedServerUrl = serverUrl.replace(/\/+$/, '');

    // Try multiple endpoint variations for UAZapi Admin API
    const endpoints = [
      { url: `${normalizedServerUrl}/admin/instance`, method: "POST" },
      { url: `${normalizedServerUrl}/admin/instances`, method: "POST" },
      { url: `${normalizedServerUrl}/admin/create`, method: "POST" },
      { url: `${normalizedServerUrl}/instance/create`, method: "POST" },
      { url: `${normalizedServerUrl}/instances`, method: "POST" },
    ];

    let createResponse: Response | null = null;
    let successEndpoint = "";
    let lastError = "";

    for (const endpoint of endpoints) {
      console.log(`Trying endpoint: ${endpoint.url}`);
      
      try {
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "admintoken": adminToken,
            "Authorization": `Bearer ${adminToken}`,
            "token": adminToken,
          },
          body: JSON.stringify({
            name: instance_name,
            instanceName: instance_name,
            instance_name: instance_name,
          }),
        });

        console.log(`Endpoint ${endpoint.url} status: ${response.status}`);

        if (response.ok || response.status === 201) {
          createResponse = response;
          successEndpoint = endpoint.url;
          break;
        } else if (response.status !== 404 && response.status !== 405) {
          // Store error for non-404/405 errors
          const errorText = await response.text().catch(() => "");
          lastError = errorText;
          console.log(`Endpoint error: ${errorText}`);
        }
      } catch (e: any) {
        console.log(`Endpoint ${endpoint.url} failed: ${e.message}`);
      }
    }

    if (!createResponse) {
      console.error("All endpoints failed. Last error:", lastError);
      
      let errorMessage = "Não foi possível criar instância. Verifique as credenciais de administração da UAZapi.";
      try {
        if (lastError) {
          const errorJson = JSON.parse(lastError);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
        }
      } catch {}

      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMessage,
        tried_endpoints: endpoints.map(e => e.url),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Success with endpoint:", successEndpoint);

    const createData = await createResponse.json();
    console.log("Create response data:", JSON.stringify(createData));

    // Extract instance details
    // UAZapi typically returns: { instance: { name, token, ... }, qrcode: "..." }
    const instanceData = createData.instance || createData;
    const instanceToken = instanceData.token || instanceData.api_key || instanceData.apiKey;
    const instanceUrl = instanceData.url || instanceData.base_url || `${normalizedServerUrl}`;
    const qrCode = createData.qrcode || createData.qr || createData.qr_code;

    // Save instance to database
    const { data: savedInstance, error: saveError } = await supabaseClient
      .from("disparos_instancias")
      .insert({
        user_id: user.id,
        nome: instance_name,
        base_url: instanceUrl,
        api_key: instanceToken || "pending",
        instance_name: instanceData.name || instance_name,
        is_active: true,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving instance:", saveError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Instância criada na UAZapi mas erro ao salvar no banco: " + saveError.message 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Instância criada com sucesso!",
      // Return instance data in a format the frontend expects
      instance: {
        id: savedInstance.id,
        nome: savedInstance.nome,
        base_url: savedInstance.base_url,
        api_key: savedInstance.api_key,
        instance_name: savedInstance.instance_name,
      },
      // Also return at root level for backwards compatibility
      id: savedInstance.id,
      base_url: savedInstance.base_url,
      api_key: savedInstance.api_key,
      instance_id: savedInstance.id,
      qrcode: qrCode,
      raw_response: createData,
      // Flag that instance was already saved - frontend should NOT insert again
      already_saved: true,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in uazapi-admin-create-instance:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || "Erro desconhecido ao criar instância"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
