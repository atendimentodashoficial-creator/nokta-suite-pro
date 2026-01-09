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

    // Create instance via UAZapi Admin API
    const createResponse = await fetch(`${normalizedServerUrl}/admin/instance/create`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "admintoken": adminToken,
      },
      body: JSON.stringify({
        name: instance_name,
        // Additional options can be added here
      }),
    });

    console.log("Create response status:", createResponse.status);

    if (!createResponse.ok) {
      const errorText = await createResponse.text().catch(() => "");
      console.error("Create instance error:", errorText);
      
      // Try to parse error message
      let errorMessage = "Erro ao criar instância na UAZapi.";
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorMessage;
      } catch {
        if (errorText) errorMessage = errorText;
      }

      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMessage,
        status: createResponse.status
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      instance: {
        id: savedInstance.id,
        nome: savedInstance.nome,
        base_url: savedInstance.base_url,
        api_key: savedInstance.api_key,
        instance_name: savedInstance.instance_name,
      },
      qrcode: qrCode,
      raw_response: createData,
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
