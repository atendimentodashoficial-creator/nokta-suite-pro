import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const decodeAdminToken = (token: string): string | null => {
  try {
    const decoded = atob(token);
    const [adminId] = decoded.split(":");
    if (adminId && adminId.length === 36 && adminId.includes("-")) return adminId;
    return null;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== Starting admin-notification-create-instance ===");

    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bearer = rawAuth.replace("Bearer ", "");
    const adminId = decodeAdminToken(bearer);
    if (!adminId) {
      return new Response(JSON.stringify({ success: false, error: "Token inválido." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: adminUser, error: adminErr } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", adminId)
      .maybeSingle();

    if (adminErr || !adminUser) {
      return new Response(JSON.stringify({ success: false, error: "Sem permissão." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { instance_name } = body;
    if (!instance_name || !String(instance_name).trim()) {
      return new Response(JSON.stringify({ success: false, error: "Nome da instância é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN");
    const serverUrl = Deno.env.get("UAZAPI_SERVER_URL");
    if (!adminToken || !serverUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Configuração UAZapi não encontrada. Configure UAZAPI_ADMIN_TOKEN e UAZAPI_SERVER_URL.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const normalizedServerUrl = String(serverUrl).replace(/\/+$/, "");
    const endpoints = [
      { url: `${normalizedServerUrl}/admin/instance`, method: "POST" },
      { url: `${normalizedServerUrl}/admin/instances`, method: "POST" },
      { url: `${normalizedServerUrl}/admin/create`, method: "POST" },
      { url: `${normalizedServerUrl}/instance/create`, method: "POST" },
      { url: `${normalizedServerUrl}/instances`, method: "POST" },
    ];

    let createResponse: Response | null = null;
    let lastError = "";

    for (const endpoint of endpoints) {
      console.log(`Trying endpoint: ${endpoint.url}`);
      try {
        const r = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "admintoken": adminToken,
            "Authorization": `Bearer ${adminToken}`,
            "token": adminToken,
          },
          body: JSON.stringify({
            name: String(instance_name).trim(),
            instanceName: String(instance_name).trim(),
            instance_name: String(instance_name).trim(),
          }),
        });

        console.log(`Endpoint ${endpoint.url} status: ${r.status}`);
        if (r.ok || r.status === 201) {
          createResponse = r;
          break;
        }

        if (r.status !== 404 && r.status !== 405) {
          lastError = await r.text().catch(() => "");
        }
      } catch (e: any) {
        lastError = e?.message || String(e);
      }
    }

    if (!createResponse) {
      return new Response(
        JSON.stringify({
          success: false,
          error: lastError || "Não foi possível criar instância na UAZapi.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const createData = await createResponse.json().catch(() => ({}));
    const instanceData = createData.instance || createData;
    const instanceToken = instanceData.token || instanceData.api_key || instanceData.apiKey;
    const instanceUrl = instanceData.url || instanceData.base_url || `${normalizedServerUrl}`;
    const qrCode = createData.qrcode || createData.qr || createData.qr_code;

    const { data: saved, error: saveError } = await supabase
      .from("admin_notification_instances")
      .insert({
        nome: String(instance_name).trim(),
        base_url: String(instanceUrl).replace(/\/+$/, ""),
        api_key: instanceToken || "pending",
        instance_name: instanceData.name || String(instance_name).trim(),
        is_active: true,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving admin_notification_instances:", saveError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Instância criada na UAZapi mas erro ao salvar no banco: " + saveError.message,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Instância criada com sucesso!",
        instance: saved,
        qrcode: qrCode ? (String(qrCode).startsWith("data:image") ? qrCode : `data:image/png;base64,${qrCode}`) : null,
        raw_response: createData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in admin-notification-create-instance:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
