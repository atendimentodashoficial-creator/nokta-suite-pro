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
    const payload = await req.json();
    const template_id = payload?.template_id;
    const nome = payload?.nome;
    const email = payload?.email;

    // Normalize phone to digits-only; try to avoid duplicated country code (common issue)
    let telefone = String(payload?.telefone || "");
    telefone = telefone.replace(/\D/g, "");
    if (telefone.startsWith("00")) telefone = telefone.slice(2);
    if (telefone.startsWith("5555")) telefone = telefone.slice(2);

    if (!template_id || !telefone) {
      return new Response(
        JSON.stringify({ success: false, error: "template_id e telefone são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch template with WhatsApp config
    const { data: template, error: templateError } = await supabase
      .from("formularios_templates")
      .select("whatsapp_instancia_id, whatsapp_mensagem_sucesso, whatsapp_notificacao_ativa")
      .eq("id", template_id)
      .single();

    if (templateError || !template) {
      console.error("Template not found:", templateError);
      return new Response(
        JSON.stringify({ success: false, error: "Template não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if notification is enabled
    if (!template.whatsapp_notificacao_ativa || !template.whatsapp_instancia_id || !template.whatsapp_mensagem_sucesso) {
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: "Notificação WhatsApp não configurada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch instance config
    const { data: instancia, error: instanciaError } = await supabase
      .from("disparos_instancias")
      .select("base_url, api_key")
      .eq("id", template.whatsapp_instancia_id)
      .single();

    if (instanciaError || !instancia) {
      console.error("Instance not found:", instanciaError);
      return new Response(
        JSON.stringify({ success: false, error: "Instância WhatsApp não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace placeholders in message
    let mensagem = template.whatsapp_mensagem_sucesso;
    mensagem = mensagem.replace(/\{nome\}/gi, nome || "");
    mensagem = mensagem.replace(/\{email\}/gi, email || "");
    mensagem = mensagem.replace(/\{telefone\}/gi, telefone || "");

    // Send message via UAZapi
    const normalizedUrl = instancia.base_url.replace(/\/+$/, "");
    const apiUrl = `${normalizedUrl}/send/text`;

    console.log(`Sending WhatsApp message to ${telefone} via ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": instancia.api_key,
      },
      body: JSON.stringify({
        number: telefone,
        text: mensagem,
      }),
    });

    const responseData = await response.text();
    console.log("UAZapi response:", response.status, responseData);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao enviar mensagem", details: responseData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, sent: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in formulario-whatsapp-notify:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
