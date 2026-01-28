import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Normalize phone number to WhatsApp format
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith("55") && cleaned.length <= 11) cleaned = "55" + cleaned;
  return cleaned;
}

// Format date for message
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const saoPauloOffset = -3 * 60 * 60 * 1000;
  const saoPauloDate = new Date(utc + saoPauloOffset);
  
  const day = saoPauloDate.getDate().toString().padStart(2, "0");
  const month = (saoPauloDate.getMonth() + 1).toString().padStart(2, "0");
  const year = saoPauloDate.getFullYear();
  
  return `${day}/${month}/${year}`;
}

// Format time for message
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const saoPauloOffset = -3 * 60 * 60 * 1000;
  const saoPauloDate = new Date(utc + saoPauloOffset);
  
  const hours = saoPauloDate.getHours().toString().padStart(2, "0");
  const minutes = saoPauloDate.getMinutes().toString().padStart(2, "0");
  
  return `${hours}:${minutes}`;
}

// Process spintax in message
function processSpintax(text: string): string {
  const regex = /\{([^{}]+)\}/g;
  return text.replace(regex, (_, options) => {
    if (options.includes("|")) {
      const choices = options.split("|");
      return choices[Math.floor(Math.random() * choices.length)];
    }
    return `{${options}}`;
  });
}

// Replace variables in message
function replaceVariables(
  message: string,
  reuniao: { titulo: string; data_reuniao: string; meet_link?: string | null; participantes?: string[] | null },
  clienteNome?: string
): string {
  let result = message;
  
  // Get first participant name or use provided clienteNome
  const nome = clienteNome || (reuniao.participantes && reuniao.participantes[0]) || "Cliente";
  const primeiroNome = nome.split(" ")[0];
  
  result = result.replace(/\{nome\}/gi, nome);
  result = result.replace(/\{primeiro_nome\}/gi, primeiroNome);
  result = result.replace(/\{titulo\}/gi, reuniao.titulo);
  result = result.replace(/\{data\}/gi, formatDate(reuniao.data_reuniao));
  result = result.replace(/\{horario\}/gi, formatTime(reuniao.data_reuniao));
  result = result.replace(/\{link_call\}/gi, reuniao.meet_link || "[Link não disponível]");
  
  return processSpintax(result);
}

// Sleep function for delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { reuniaoId, userId, clienteTelefone, clienteNome } = body;

    console.log(`Starting immediate notification for reuniao ${reuniaoId}, user ${userId}`);

    if (!reuniaoId || !userId) {
      return new Response(
        JSON.stringify({ success: false, error: "reuniaoId and userId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the reuniao
    const { data: reuniao, error: reuniaoError } = await supabase
      .from("reunioes")
      .select("*")
      .eq("id", reuniaoId)
      .single();

    if (reuniaoError || !reuniao) {
      console.error("Reuniao not found:", reuniaoError);
      return new Response(
        JSON.stringify({ success: false, error: "Reunião não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get phone from parameter or reuniao
    const telefone = clienteTelefone || reuniao.cliente_telefone;
    
    if (!telefone) {
      console.log("No phone number available for notification");
      return new Response(
        JSON.stringify({ success: false, error: "Telefone do cliente não informado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get active immediate notifications for this user
    const { data: avisosImediatos, error: avisosError } = await supabase
      .from("avisos_reuniao")
      .select("*")
      .eq("user_id", userId)
      .eq("ativo", true)
      .eq("envio_imediato", true);

    if (avisosError) {
      console.error("Error fetching avisos:", avisosError);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao buscar avisos" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!avisosImediatos || avisosImediatos.length === 0) {
      console.log("No immediate notifications configured");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum aviso imediato configurado", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get active WhatsApp instances for this user
    const { data: instancias, error: instanciasError } = await supabase
      .from("whatsapp_config")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1);

    if (instanciasError || !instancias || instancias.length === 0) {
      console.error("No active WhatsApp instance:", instanciasError);
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma instância WhatsApp ativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instancia = instancias[0];
    const normalizedPhone = normalizePhone(telefone);
    let sentCount = 0;

    for (const aviso of avisosImediatos) {
      try {
        // Calculate random delay within interval
        const delayMs = Math.floor(
          Math.random() * (aviso.intervalo_max - aviso.intervalo_min) + aviso.intervalo_min
        ) * 1000;

        console.log(`Waiting ${delayMs}ms before sending "${aviso.nome}"`);
        await sleep(delayMs);

        // Replace variables in message
        const mensagem = replaceVariables(aviso.mensagem, reuniao, clienteNome);

        // Send WhatsApp message
        const sendUrl = `${instancia.base_url}/sendText/${instancia.instance_name}`;
        const sendResponse = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${instancia.api_key}`,
          },
          body: JSON.stringify({
            phone: normalizedPhone,
            message: mensagem,
          }),
        });

        const sendResult = await sendResponse.json();

        if (!sendResponse.ok) {
          console.error(`Error sending message for aviso "${aviso.nome}":`, sendResult);
          
          // Log the failure
          await supabase.from("avisos_reuniao_log").insert({
            user_id: userId,
            aviso_id: aviso.id,
            aviso_nome: aviso.nome,
            reuniao_id: reuniaoId,
            cliente_nome: clienteNome || reuniao.participantes?.[0] || "Cliente",
            cliente_telefone: telefone,
            dias_antes: 0,
            mensagem_enviada: mensagem,
            status: "erro",
            erro: sendResult.message || "Erro ao enviar mensagem",
          });
          
          continue;
        }

        console.log(`Successfully sent immediate notification "${aviso.nome}" to ${normalizedPhone}`);
        sentCount++;

        // Log the success
        await supabase.from("avisos_reuniao_log").insert({
          user_id: userId,
          aviso_id: aviso.id,
          aviso_nome: aviso.nome,
          reuniao_id: reuniaoId,
          cliente_nome: clienteNome || reuniao.participantes?.[0] || "Cliente",
          cliente_telefone: telefone,
          dias_antes: 0,
          mensagem_enviada: mensagem,
          status: "enviado",
        });

      } catch (err) {
        console.error(`Error processing aviso "${aviso.nome}":`, err);
        
        // Log the error
        await supabase.from("avisos_reuniao_log").insert({
          user_id: userId,
          aviso_id: aviso.id,
          aviso_nome: aviso.nome,
          reuniao_id: reuniaoId,
          cliente_nome: clienteNome || reuniao.participantes?.[0] || "Cliente",
          cliente_telefone: telefone,
          dias_antes: 0,
          mensagem_enviada: aviso.mensagem,
          status: "erro",
          erro: String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${sentCount} aviso(s) imediato(s) enviado(s)`,
        sent: sentCount,
        total: avisosImediatos.length
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
