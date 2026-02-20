import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InstanciaConfig = {
  id: string;
  user_id: string;
  base_url: string;
  api_key: string;
  nome?: string | null;
  instance_name?: string | null;
  is_active?: boolean | null;
};

// Normalize phone number to WhatsApp format
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith("55") && cleaned.length <= 11) cleaned = "55" + cleaned;
  return cleaned;
}

// Generate candidates with/without 9th digit to maximize deliverability
function buildPhoneCandidates(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, "");
  const candidates = new Set<string>();

  const base = normalizePhone(cleaned);
  candidates.add(base);

  // 55 + DDD + 8 digits -> try adding 9 after DDD
  if (base.startsWith("55") && base.length === 12) {
    candidates.add(base.slice(0, 4) + "9" + base.slice(4));
  }

  // 55 + DDD + 9 digits -> try removing 9 after DDD
  if (base.startsWith("55") && base.length === 13) {
    candidates.add(base.slice(0, 4) + base.slice(5));
  }

  // Local 10 digits (DDD + 8)
  if (!cleaned.startsWith("55") && cleaned.length === 10) {
    const with9 = cleaned.slice(0, 2) + "9" + cleaned.slice(2);
    candidates.add("55" + cleaned);
    candidates.add("55" + with9);
  }

  // Local 11 digits (DDD + 9)
  if (!cleaned.startsWith("55") && cleaned.length === 11) {
    candidates.add("55" + cleaned);
  }

  return Array.from(candidates).filter((x) => x.length >= 12);
}

async function checkInstanceConnected(baseUrl: string, apiKey: string): Promise<{ ok: boolean; status: string }> {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const statusResponse = await fetch(`${normalizedBaseUrl}/instance/status`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "token": apiKey,
    },
  });

  if (!statusResponse.ok) {
    await statusResponse.text().catch(() => null);
    return { ok: false, status: `unknown (${statusResponse.status})` };
  }

  const statusData = await statusResponse.json().catch(() => null);
  if (!statusData) return { ok: false, status: "unknown" };

  const nestedStatus = statusData?.status;
  const instanceStatus = statusData?.instance?.status;
  const loggedIn = nestedStatus?.loggedIn === true || statusData?.loggedIn === true;
  const jid = nestedStatus?.jid ?? statusData?.jid;
  const connected = nestedStatus?.connected === true || statusData?.connected === true;

  const isConnecting = instanceStatus === "connecting" || instanceStatus === "starting";
  const isDisconnected = instanceStatus === "disconnected" ||
    instanceStatus === "close" ||
    instanceStatus === "DISCONNECTED" ||
    nestedStatus?.connected === false ||
    statusData?.connected === false;

  const hasValidJid = jid != null && String(jid).length > 0;
  const isReallyConnected = loggedIn === true &&
    hasValidJid &&
    !isConnecting &&
    !isDisconnected &&
    (connected === true || connected === undefined);

  return {
    ok: isReallyConnected,
    status: isReallyConnected ? "connected" : (isConnecting ? "connecting" : (isDisconnected ? "disconnected" : "waiting")),
  };
}

// Format date for message (only day/month) - using native timezone support
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// Format time for message - using native timezone support
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
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
    const { reuniaoId, userId: userIdFromBody, clienteTelefone, clienteNome, instanciaId, instanciaNome, tipo = "imediato" } = body;

    // Auth: allow either a real user JWT (from the app) OR an internal call using the service role key.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const isInternalServiceCall = token === supabaseKey;

    let resolvedUserId: string | null = null;
    if (isInternalServiceCall) {
      resolvedUserId = userIdFromBody || null;
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Não autenticado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      resolvedUserId = user.id;
    }

    const isReagendamento = tipo === "reagendamento";
    console.log(`Starting ${isReagendamento ? 'rescheduling' : 'immediate'} notification for reuniao ${reuniaoId}, user ${resolvedUserId}`);

    if (!reuniaoId || !resolvedUserId) {
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

    // Get active notifications for this user based on type
    let avisosQuery = supabase
      .from("avisos_reuniao")
      .select("*")
      .eq("user_id", resolvedUserId)
      .eq("ativo", true);

    if (isReagendamento) {
      // For rescheduling, get avisos with tipo_gatilho = 'reagendamento'
      avisosQuery = avisosQuery.eq("tipo_gatilho", "reagendamento");
    } else {
      // For immediate, get avisos with envio_imediato = true
      avisosQuery = avisosQuery.eq("envio_imediato", true);
    }

    const { data: avisos, error: avisosError } = await avisosQuery;

    if (avisosError) {
      console.error("Error fetching avisos:", avisosError);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao buscar avisos" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!avisos || avisos.length === 0) {
      console.log(`No ${isReagendamento ? 'rescheduling' : 'immediate'} notifications configured`);
      return new Response(
        JSON.stringify({ success: true, message: `Nenhum aviso ${isReagendamento ? 'de reagendamento' : 'imediato'} configurado`, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pick instance: prefer the one from the client's chat history (same instance they were chatting with)
    let instancia: InstanciaConfig | null = null;
    
    // First, try to find the instance from the client's existing chat
    // Priority: instancia_original (where chat was created) > most messages > latest message
    const phoneLast8 = telefone.replace(/\D/g, "").slice(-8);
    console.log(`Looking for chat with phone last8: ${phoneLast8}`);
    
    // Get all chats for this phone number to analyze
    const { data: existingChats, error: chatError } = await supabase
      .from("disparos_chats")
      .select("id, instancia_id, instancia_nome, instancia_original_id, instancia_original_nome, last_message_time, created_at")
      .eq("user_id", resolvedUserId)
      .is("deleted_at", null)
      .like("normalized_number", `%${phoneLast8}`);
    
    if (chatError) {
      console.error("Error fetching existing chats:", chatError);
    }
    
    let selectedChat: { instancia_id: string; instancia_nome: string | null } | null = null;
    
    if (existingChats && existingChats.length > 0) {
      console.log(`Found ${existingChats.length} chat(s) for phone ${phoneLast8}`);
      
      // If there's only one chat, use it
      if (existingChats.length === 1) {
        selectedChat = existingChats[0];
        console.log(`Single chat found, using instance: ${selectedChat.instancia_nome}`);
      } else {
        // Multiple chats - prioritize the one that has instancia_original_id set (migrated chat)
        // or the oldest chat (original conversation)
        const chatWithOriginal = existingChats.find(c => c.instancia_original_id);
        if (chatWithOriginal) {
          // This chat was migrated, use the original instance for continuity
          selectedChat = {
            instancia_id: chatWithOriginal.instancia_original_id!,
            instancia_nome: chatWithOriginal.instancia_original_nome
          };
          console.log(`Found migrated chat, using original instance: ${selectedChat.instancia_nome}`);
        } else {
          // Use the oldest chat (the original conversation)
          const oldestChat = existingChats.sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )[0];
          selectedChat = oldestChat;
          console.log(`Multiple chats found, using oldest (original): ${selectedChat.instancia_nome} created at ${oldestChat.created_at}`);
        }
      }
    }
    
    if (selectedChat?.instancia_id) {
      console.log(`Selected chat instance: ${selectedChat.instancia_id} (${selectedChat.instancia_nome})`);
      const { data: chatInstance } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("id", selectedChat.instancia_id)
        .eq("user_id", resolvedUserId)
        .eq("is_active", true)
        .maybeSingle();
      
      if (chatInstance) {
        instancia = chatInstance as any;
        console.log(`Using instance from chat history: ${chatInstance.nome}`);
      } else {
        console.log(`Instance ${selectedChat.instancia_id} not active, will try fallbacks`);
      }
    }

    // If no chat found, try the one passed from parameters (instanciaId / instanciaNome)
    if (!instancia && instanciaId) {
      const { data: byId } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("id", String(instanciaId))
        .eq("user_id", resolvedUserId)
        .eq("is_active", true)
        .maybeSingle();
      if (byId) instancia = byId as any;
    }

    if (!instancia && instanciaNome) {
      const escaped = String(instanciaNome).replace(/,/g, "");
      const { data: byName, error: byNameError } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("user_id", resolvedUserId)
        .eq("is_active", true)
        .or(`nome.eq.${escaped},instance_name.eq.${escaped}`)
        .limit(1);

      if (byNameError) {
        console.error("Error fetching instance by name:", byNameError);
      }

      if (byName && byName.length > 0) instancia = byName[0] as any;
    }

    // Last resort: use the first active instance
    if (!instancia) {
      console.log("No chat history or parameter instance found, using first active instance");
      const { data: instancias, error: instanciasError } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("user_id", resolvedUserId)
        .eq("is_active", true)
        .limit(1);

      if (instanciasError || !instancias || instancias.length === 0) {
        console.error("No active WhatsApp instance:", instanciasError);
        return new Response(
          JSON.stringify({ success: false, error: "Nenhuma instância WhatsApp ativa configurada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      instancia = instancias[0] as any;
    }

    if (!instancia) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma instância WhatsApp ativa configurada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Final instance selected: ${instancia.nome} (${instancia.id})`)

    const baseUrl = String(instancia.base_url || "").replace(/\/+$/, "");
    const apiKey = String(instancia.api_key || "");

    // Ensure connectivity before sending
    const status = await checkInstanceConnected(baseUrl, apiKey);
    if (!status.ok) {
      const msg = "WhatsApp disconnected";

      await supabase.from("avisos_reuniao_log").insert({
        user_id: resolvedUserId,
        aviso_id: null,
        aviso_nome: "(envio_imediato)",
        reuniao_id: reuniaoId,
        cliente_nome: clienteNome || reuniao.participantes?.[0] || "Cliente",
        cliente_telefone: telefone,
        dias_antes: 0,
        mensagem_enviada: "",
        status: "erro",
        erro: msg,
        instancia_id: instancia.id,
        instancia_nome: instancia.nome,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Instância WhatsApp desconectada. Reconecte em Conexões → Disparos (QR Code).",
          sent: 0,
          total: avisos.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phoneCandidates = buildPhoneCandidates(telefone);
    let sentCount = 0;

    // Fetch all active instances for this user (needed to resolve per-aviso instancia_id)
    const { data: allInstancias } = await supabase
      .from("disparos_instancias")
      .select("id, nome, base_url, api_key")
      .eq("user_id", resolvedUserId)
      .eq("is_active", true);

    for (const aviso of avisos) {
      try {
        // Resolve instance: use aviso's fixed instancia_id if set, otherwise use the one from chat history
        let avisoBaseUrl = baseUrl;
        let avisoApiKey = apiKey;
        let avisoInstanciaId = instancia.id;
        let avisoInstanciaNome = instancia.nome;

        const avisoFixedInstanciaId: string | null = (aviso as any).instancia_id ?? null;
        if (avisoFixedInstanciaId && allInstancias) {
          const forced = allInstancias.find((i) => i.id === avisoFixedInstanciaId);
          if (forced) {
            console.log(`Aviso "${aviso.nome}" using forced instancia "${forced.nome}"`);
            avisoBaseUrl = String(forced.base_url || "").replace(/\/+$/, "");
            avisoApiKey = String(forced.api_key || "");
            avisoInstanciaId = forced.id;
            avisoInstanciaNome = forced.nome;
          }
        }

        // Calculate random delay within interval
        const delayMs = Math.floor(
          Math.random() * (aviso.intervalo_max - aviso.intervalo_min) + aviso.intervalo_min
        ) * 1000;

        console.log(`Waiting ${delayMs}ms before sending "${aviso.nome}"`);
        await sleep(delayMs);

        // Replace variables in message
        const mensagem = replaceVariables(aviso.mensagem, reuniao, clienteNome);

        // Send WhatsApp message (UAZapi padrão usado em Disparos)
        const sendUrl = `${avisoBaseUrl}/send/text`;

        let deliveredTo: string | null = null;
        let lastError: string | null = null;

        for (const candidate of phoneCandidates) {
          const sendResponse = await fetch(sendUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              token: avisoApiKey,
            },
            body: JSON.stringify({
              number: candidate,
              text: mensagem,
            }),
          });

          const responseText = await sendResponse.text();
          let sendResult: any = null;
          try {
            sendResult = responseText ? JSON.parse(responseText) : null;
          } catch {
            sendResult = { raw: responseText };
          }

          if (sendResponse.ok) {
            deliveredTo = candidate;
            break;
          }

          lastError =
            sendResult?.message ||
            sendResult?.error ||
            (typeof sendResult?.raw === "string" && sendResult.raw) ||
            responseText ||
            `Erro ao enviar mensagem (${sendResponse.status})`;

          console.error(`Error sending message for aviso "${aviso.nome}" to ${candidate}:`, {
            status: sendResponse.status,
            body: sendResult,
          });
        }

        if (!deliveredTo) {
          await supabase.from("avisos_reuniao_log").insert({
            user_id: resolvedUserId,
            aviso_id: aviso.id,
            aviso_nome: aviso.nome,
            reuniao_id: reuniaoId,
            cliente_nome: clienteNome || reuniao.participantes?.[0] || "Cliente",
            cliente_telefone: telefone,
            dias_antes: 0,
            mensagem_enviada: mensagem,
            status: "erro",
            erro: lastError || "Erro ao enviar mensagem",
            instancia_id: avisoInstanciaId,
            instancia_nome: avisoInstanciaNome,
          });
          continue;
        }

        console.log(`Successfully sent ${isReagendamento ? 'rescheduling' : 'immediate'} notification "${aviso.nome}" to ${deliveredTo}`);
        sentCount++;

        // Log the success (with instance info for audit)
        await supabase.from("avisos_reuniao_log").insert({
          user_id: resolvedUserId,
          aviso_id: aviso.id,
          aviso_nome: aviso.nome,
          reuniao_id: reuniaoId,
          cliente_nome: clienteNome || reuniao.participantes?.[0] || "Cliente",
          cliente_telefone: telefone,
          dias_antes: 0,
          mensagem_enviada: mensagem,
          status: "enviado",
          instancia_id: avisoInstanciaId,
          instancia_nome: avisoInstanciaNome,
        });

        // For rescheduling type, update ultimo_reagendamento_avisado after sending
        if (isReagendamento && reuniao.numero_reagendamentos !== undefined) {
          await supabase
            .from("reunioes")
            .update({ ultimo_reagendamento_avisado: reuniao.numero_reagendamentos })
            .eq("id", reuniaoId);
          console.log(`Updated ultimo_reagendamento_avisado to ${reuniao.numero_reagendamentos} for reuniao ${reuniaoId}`);
        }

      } catch (err) {
        console.error(`Error processing aviso "${aviso.nome}":`, err);
        
        // Log the error (with instance info for audit)
        await supabase.from("avisos_reuniao_log").insert({
          user_id: resolvedUserId,
          aviso_id: aviso.id,
          aviso_nome: aviso.nome,
          reuniao_id: reuniaoId,
          cliente_nome: clienteNome || reuniao.participantes?.[0] || "Cliente",
          cliente_telefone: telefone,
          dias_antes: 0,
          mensagem_enviada: aviso.mensagem,
          status: "erro",
          erro: String(err),
          instancia_id: instancia.id,
          instancia_nome: instancia.nome,
        });
      }
    }

    const tipoMsg = isReagendamento ? 'de reagendamento' : 'imediato(s)';
    return new Response(
      JSON.stringify({ 
        success: sentCount > 0, 
        message: `${sentCount} aviso(s) ${tipoMsg} enviado(s)`,
        sent: sentCount,
        total: avisos.length
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
