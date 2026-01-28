import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AvisoAgendamento {
  id: string;
  user_id: string;
  nome: string;
  mensagem: string;
  dias_antes: number;
  horario_envio: string;
  ativo: boolean;
  intervalo_min: number;
  intervalo_max: number;
  last_check_at: string | null;
  procedimento_id: string | null;
  tipo_gatilho: string; // 'dias_antes' | 'reagendamento'
}

interface WhatsAppConfig {
  base_url: string;
  api_key: string;
}

interface PendingAviso {
  userId: string;
  avisoId: string;
  avisoNome: string;
  diasAntes: number;
  intervaloMin: number;
  intervaloMax: number;
  mensagemTemplate: string;
  agendamentoId: string;
  flagField: string;
  clienteId: string;
  clienteNome: string;
  telefone: string;
  dataAgendamento: string;
  procedimentoNome: string;
  profissionalNome: string;
  leadOrigem: string | null;
  leadInstanciaNome: string | null;
  agendamentoInstanciaNome: string | null;
  tipoGatilho: string;
  numeroReagendamentos?: number;
}

// Configuration
const MAX_MESSAGES_PER_EXECUTION = 5;

// Get current time in São Paulo timezone
function getSaoPauloTime(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const saoPauloOffset = -3 * 60 * 60 * 1000;
  return new Date(utc + saoPauloOffset);
}

// Helper to delay between sends
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getRandomInterval = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Calculate next check time for an aviso (next day at horario_envio)
function calculateNextCheckAt(horarioEnvio: string): string {
  const saoPauloNow = getSaoPauloTime();
  const [hora, minuto] = horarioEnvio.split(":").map(Number);

  // Today at the scheduled time
  const todayScheduled = new Date(saoPauloNow);
  todayScheduled.setHours(hora, minuto, 0, 0);

  // If we're past today's scheduled time, schedule for tomorrow
  if (saoPauloNow >= todayScheduled) {
    todayScheduled.setDate(todayScheduled.getDate() + 1);
  }

  return todayScheduled.toISOString();
}

// Ensure WhatsApp chat and lead exist when sending via default WhatsApp instance
async function ensureWhatsAppChatAndLead(
  supabase: any,
  userId: string,
  formattedPhone: string,
  contactName: string,
  mensagem: string,
  messageId: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const last8 = formattedPhone.slice(-8);

  try {
    // Check if WhatsApp chat exists for this phone
    const { data: existingChats } = await supabase
      .from("whatsapp_chats")
      .select("id, normalized_number")
      .eq("user_id", userId)
      .is("deleted_at", null);

    const matchingChat = existingChats?.find((c: any) =>
      String(c.normalized_number || "").slice(-8) === last8
    );

    let chatDbId: string | null = null;

    if (matchingChat) {
      // Update existing chat with last message
      chatDbId = matchingChat.id;
      await supabase
        .from("whatsapp_chats")
        .update({
          last_message: mensagem,
          last_message_time: nowIso,
          updated_at: nowIso,
        })
        .eq("id", chatDbId);
      console.log(`Updated existing WhatsApp chat ${chatDbId} for ${formattedPhone}`);
    } else {
      // Create new WhatsApp chat
      const { data: newChat, error: chatError } = await supabase
        .from("whatsapp_chats")
        .insert({
          user_id: userId,
          chat_id: `aviso_${formattedPhone}_${Date.now()}`,
          contact_name: contactName || "Contato",
          contact_number: formattedPhone,
          normalized_number: formattedPhone,
          last_message: mensagem,
          last_message_time: nowIso,
        })
        .select("id")
        .single();

      if (chatError) {
        console.error("Error creating WhatsApp chat:", chatError);
      } else if (newChat) {
        chatDbId = newChat.id;
        console.log(`Created new WhatsApp chat ${chatDbId} for ${formattedPhone}`);
      }
    }

    // Save the message to whatsapp_messages
    if (chatDbId) {
      const { error: msgError } = await supabase.from("whatsapp_messages").insert({
        chat_id: chatDbId,
        message_id: messageId,
        sender_type: "agent",
        content: mensagem,
        media_type: "text",
        timestamp: nowIso,
        status: "sent",
      });
      if (msgError) {
        console.error("Error saving message to whatsapp_messages:", msgError);
      } else {
        console.log(`Saved aviso message to whatsapp_messages for chat ${chatDbId}`);
      }
    }

    // Ensure a WhatsApp lead exists for this phone
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("id, telefone")
      .eq("user_id", userId)
      .eq("origem", "WhatsApp")
      .is("deleted_at", null);

    const matchingLead = existingLeads?.find((l: any) => {
      const leadPhone = String(l.telefone || "").replace(/\D/g, "");
      return leadPhone.slice(-8) === last8;
    });

    if (!matchingLead) {
      // Create WhatsApp lead
      const today = new Date().toISOString().split("T")[0];
      const { error: leadError } = await supabase.from("leads").insert({
        user_id: userId,
        nome: contactName || `Contato ${formattedPhone}`,
        telefone: formattedPhone,
        procedimento_nome: "Contato via WhatsApp",
        origem: "WhatsApp",
        status: "lead",
        origem_lead: true,
        data_contato: today,
      });

      if (leadError) {
        console.error("Error creating WhatsApp lead:", leadError);
      } else {
        console.log(`Created WhatsApp lead for ${formattedPhone}`);
      }
    } else {
      console.log(`WhatsApp lead already exists for ${formattedPhone}`);
    }
  } catch (error: any) {
    console.error("Error in ensureWhatsAppChatAndLead:", error.message);
  }
}

// Process a single aviso message
async function processAviso(
  supabase: any,
  aviso: PendingAviso,
  configs: {
    defaultConfig: WhatsAppConfig | null;
    instanceConfigMap: Record<string, WhatsAppConfig>;
  }
): Promise<{ success: boolean; result: any }> {
  const { defaultConfig, instanceConfigMap } = configs;

  // Determine which instance to use
  let config: WhatsAppConfig | null = null;
  let instanceUsed = "default";

  const instanciaParaUsar = aviso.agendamentoInstanciaNome || aviso.leadInstanciaNome;
  const isFromDisparos = aviso.leadOrigem === "Disparos" || !!aviso.agendamentoInstanciaNome;

  if (isFromDisparos && instanciaParaUsar && instanceConfigMap[instanciaParaUsar]) {
    config = instanceConfigMap[instanciaParaUsar];
    instanceUsed = instanciaParaUsar;
    console.log(`Aviso for ${aviso.clienteNome} using Disparos instance "${instanciaParaUsar}"`);
  } else if (defaultConfig) {
    config = defaultConfig;
    instanceUsed = "WhatsApp (default)";
    console.log(`Aviso for ${aviso.clienteNome} using default WhatsApp instance`);
  } else {
    console.log(`No suitable WhatsApp config for ${aviso.clienteNome}`);
    return { success: false, result: { error: "No config available" } };
  }

  // Clean phone number
  const cleanPhone = aviso.telefone.replace(/\D/g, "");
  const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

  // Prepare message with variables (use São Paulo timezone to match user expectations)
  const dataFormatada = new Date(aviso.dataAgendamento).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const horarioFormatado = new Date(aviso.dataAgendamento).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const mensagem = aviso.mensagemTemplate
    .replace(/{nome}/g, aviso.clienteNome || "")
    .replace(/{data}/g, dataFormatada)
    .replace(/{horario}/g, horarioFormatado)
    .replace(/{procedimento}/g, aviso.procedimentoNome || "Consulta")
    .replace(/{profissional}/g, aviso.profissionalNome || "");

  console.log(`Sending aviso to ${formattedPhone} for agendamento ${aviso.agendamentoId} via ${instanceUsed}`);

  try {
    const response = await fetch(`${config.base_url}/send/text`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token: config.api_key,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: mensagem,
      }),
    });

    const responseData = await response.json();

    if (response.ok && responseData.status !== "error") {
      console.log(`Message sent successfully to ${formattedPhone} via ${instanceUsed}`);

      // Update the flag on the agendamento
      if (aviso.flagField) {
        const updateData: Record<string, boolean> = {};
        updateData[aviso.flagField] = true;

        await supabase.from("agendamentos").update(updateData).eq("id", aviso.agendamentoId);
      }

      // For reagendamento type, update ultimo_reagendamento_avisado
      if (aviso.tipoGatilho === 'reagendamento' && aviso.numeroReagendamentos !== undefined) {
        await supabase
          .from("agendamentos")
          .update({ ultimo_reagendamento_avisado: aviso.numeroReagendamentos })
          .eq("id", aviso.agendamentoId);
        console.log(`Updated ultimo_reagendamento_avisado to ${aviso.numeroReagendamentos} for agendamento ${aviso.agendamentoId}`);
      }

      // Log the sent aviso
      await supabase.from("avisos_enviados_log").insert({
        user_id: aviso.userId,
        aviso_id: aviso.avisoId,
        agendamento_id: aviso.agendamentoId,
        cliente_id: aviso.clienteId || null,
        cliente_nome: aviso.clienteNome || "Desconhecido",
        cliente_telefone: formattedPhone,
        aviso_nome: aviso.avisoNome,
        dias_antes: aviso.diasAntes,
        mensagem_enviada: mensagem,
        status: "enviado",
        enviado_em: new Date().toISOString(),
      });

      // If sent via default WhatsApp instance, create/update chat, message, and lead
      if (instanceUsed === "WhatsApp (default)") {
        const messageId = responseData.id || `aviso_${Date.now()}`;
        await ensureWhatsAppChatAndLead(
          supabase,
          aviso.userId,
          formattedPhone,
          aviso.clienteNome,
          mensagem,
          messageId
        );
      }

      return {
        success: true,
        result: {
          agendamento_id: aviso.agendamentoId,
          aviso: aviso.avisoNome,
          phone: formattedPhone,
          instance: instanceUsed,
          status: "sent",
        },
      };
    } else {
      console.error(`Error sending message to ${formattedPhone}:`, responseData);

      // Mark flag to prevent retry
      if (aviso.flagField) {
        const updateData: Record<string, boolean> = {};
        updateData[aviso.flagField] = true;
        await supabase.from("agendamentos").update(updateData).eq("id", aviso.agendamentoId);
      }

      // Log the failed aviso
      await supabase.from("avisos_enviados_log").insert({
        user_id: aviso.userId,
        aviso_id: aviso.avisoId,
        agendamento_id: aviso.agendamentoId,
        cliente_id: aviso.clienteId || null,
        cliente_nome: aviso.clienteNome || "Desconhecido",
        cliente_telefone: formattedPhone,
        aviso_nome: aviso.avisoNome,
        dias_antes: aviso.diasAntes,
        mensagem_enviada: mensagem,
        status: "erro",
        erro: responseData.message || "Unknown error",
        enviado_em: new Date().toISOString(),
      });

      return {
        success: false,
        result: {
          agendamento_id: aviso.agendamentoId,
          phone: formattedPhone,
          status: "error",
          error: responseData.message || "Unknown error",
        },
      };
    }
  } catch (sendError: any) {
    console.error(`Exception sending message to ${formattedPhone}:`, sendError);

    // Mark flag to prevent retry
    if (aviso.flagField) {
      const updateData: Record<string, boolean> = {};
      updateData[aviso.flagField] = true;
      await supabase.from("agendamentos").update(updateData).eq("id", aviso.agendamentoId);
    }

    // Log the exception
    await supabase.from("avisos_enviados_log").insert({
      user_id: aviso.userId,
      aviso_id: aviso.avisoId,
      agendamento_id: aviso.agendamentoId,
      cliente_id: aviso.clienteId || null,
      cliente_nome: aviso.clienteNome || "Desconhecido",
      cliente_telefone: formattedPhone,
      aviso_nome: aviso.avisoNome,
      dias_antes: aviso.diasAntes,
      mensagem_enviada: aviso.mensagemTemplate,
      status: "erro",
      erro: sendError.message,
      enviado_em: new Date().toISOString(),
    });

    return {
      success: false,
      result: {
        agendamento_id: aviso.agendamentoId,
        phone: formattedPhone,
        status: "error",
        error: sendError.message,
      },
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing backend env vars");
    return new Response(JSON.stringify({ success: false, error: "Missing backend env vars" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const cronHeader = req.headers.get("X-Cron-Secret") ?? "";
  const isCronRequest = CRON_SECRET && cronHeader === CRON_SECRET;
  
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const saoPauloNow = getSaoPauloTime();
    console.log(`Starting enviar-avisos-agendamento at ${saoPauloNow.toISOString()} (São Paulo time)`);
    console.log(`Request type: ${isCronRequest ? 'CRON' : 'User'}`);

    // Parse request body
    let filterAvisoId: string | null = null;
    let action: string | null = null;
    let requestedUserId: string | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        filterAvisoId = body.aviso_id || null;
        action = body.action || null;
        requestedUserId = body.user_id || null;
      } catch {
        // No body or invalid JSON
      }
    }

    // For cron requests, process ALL users
    let effectiveUserId: string | null = null;
    
    if (isCronRequest) {
      console.log("Cron request - processing all active avisos for all users");
      effectiveUserId = null; // Will process all users
    } else if (SUPABASE_ANON_KEY && authHeader) {
      // Resolve user from auth header
      try {
        const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await authed.auth.getUser();
        if (userData?.user?.id) {
          effectiveUserId = userData.user.id;
        }
      } catch {
        // ignore
      }
    }

    // Validate user_id from body matches auth (only for non-cron requests)
    if (!isCronRequest && requestedUserId) {
      if (effectiveUserId && requestedUserId !== effectiveUserId) {
        console.warn(`Ignoring mismatched user_id from body`);
      } else if (!effectiveUserId) {
        effectiveUserId = requestedUserId;
      }
    }

    // Get the aviso configuration
    let avisosQuery = supabase.from("avisos_agendamento").select("*").eq("ativo", true);

    if (filterAvisoId) {
      avisosQuery = avisosQuery.eq("id", filterAvisoId);
    } else if (effectiveUserId) {
      avisosQuery = avisosQuery.eq("user_id", effectiveUserId);
    }

    const { data: avisos, error: avisosError } = await avisosQuery;

    if (avisosError) {
      throw new Error(`Error fetching avisos: ${avisosError.message}`);
    }

    if (!avisos || avisos.length === 0) {
      console.log("No active avisos found");
      return new Response(JSON.stringify({ success: true, message: "No active avisos", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${avisos.length} active avisos`);

    const results: any[] = [];
    let totalSent = 0;

    // Process each aviso
    for (const aviso of avisos as AvisoAgendamento[]) {
      const userId = aviso.user_id;
      console.log(`Processing aviso "${aviso.nome}" for user ${userId}`);

      // Check if it's time to send (or past time)
      const [envioHora, envioMinuto] = aviso.horario_envio.split(":").map(Number);
      const currentHour = saoPauloNow.getHours();
      const currentMinute = saoPauloNow.getMinutes();
      const currentTotal = currentHour * 60 + currentMinute;
      const envioTotal = envioHora * 60 + envioMinuto;

      // Skip if too early (unless manual test)
      if (!filterAvisoId && currentTotal < envioTotal) {
        console.log(`Skipping aviso "${aviso.nome}" - too early (now=${currentTotal}, scheduled=${envioTotal})`);
        continue;
      }

      // NOTE: We no longer skip based on last_check_at here.
      // Instead, we'll check for pending messages later and only skip if there are none.
      // This ensures new agendamentos added after the initial check are still processed.

      // Get appointments for next 7 days
      const hojeSP = new Date(saoPauloNow);
      hojeSP.setHours(0, 0, 0, 0);

      const em7Dias = new Date(hojeSP);
      em7Dias.setDate(em7Dias.getDate() + 7);
      em7Dias.setHours(23, 59, 59, 999);

      const { data: agendamentos, error: agendamentosError } = await supabase
        .from("agendamentos")
        .select(
          `
          id,
          data_agendamento,
          aviso_3dias,
          aviso_dia_anterior,
          aviso_dia,
          user_id,
          origem_agendamento,
          origem_instancia_nome,
          procedimento_id,
          numero_reagendamentos,
          ultimo_reagendamento_avisado,
          leads!inner(id, nome, telefone, origem, instancia_nome),
          procedimentos(nome),
          profissionais(nome)
        `
        )
        .eq("user_id", userId)
        .in("status", ["agendado", "confirmado"])
        .gte("data_agendamento", hojeSP.toISOString())
        .lte("data_agendamento", em7Dias.toISOString());

      if (agendamentosError || !agendamentos || agendamentos.length === 0) {
        console.log(`No upcoming appointments for user ${userId}`);
        continue;
      }

      console.log(`Found ${agendamentos.length} upcoming appointments for user ${userId}`);

      // Build pending list for this aviso
      const pendingAvisos: PendingAviso[] = [];
      
      // Different filtering logic based on tipo_gatilho
      let matchingAgendamentos: any[] = [];
      
      if (aviso.tipo_gatilho === 'reagendamento') {
        // For reagendamento type: find appointments that have been rescheduled but not yet notified
        matchingAgendamentos = (agendamentos as any[]).filter(ag => {
          // Check if this appointment has been rescheduled since last notification
          const numReagendamentos = ag.numero_reagendamentos || 0;
          const ultimoAvisado = ag.ultimo_reagendamento_avisado || 0;
          
          if (numReagendamentos <= ultimoAvisado) return false;
          
          // If aviso has a specific procedimento_id, filter by it
          if (aviso.procedimento_id && ag.procedimento_id !== aviso.procedimento_id) {
            return false;
          }
          
          return true;
        });
        
        console.log(`Found ${matchingAgendamentos.length} rescheduled appointments for aviso "${aviso.nome}"`);
      } else {
        // Default: dias_antes behavior
        matchingAgendamentos = (agendamentos as any[]).filter(ag => {
          const dataAgendamento = new Date(ag.data_agendamento);
          const dataAgendamentoSP = new Date(dataAgendamento.getTime());
          dataAgendamentoSP.setHours(0, 0, 0, 0);

          const hojeDateSP = new Date(saoPauloNow);
          hojeDateSP.setHours(0, 0, 0, 0);

          const diffDays = Math.round((dataAgendamentoSP.getTime() - hojeDateSP.getTime()) / (1000 * 60 * 60 * 24));
          
          // Check if dias_antes matches
          if (diffDays !== aviso.dias_antes) return false;
          
          // If aviso has a specific procedimento_id, filter by it
          if (aviso.procedimento_id && ag.procedimento_id !== aviso.procedimento_id) {
            return false;
          }
          
          return true;
        });
      }

      if (matchingAgendamentos.length === 0) {
        console.log(`No matching appointments for aviso "${aviso.nome}" (dias_antes=${aviso.dias_antes})`);
        // Update timestamps - no matching appointments today
        const nextCheckAt = calculateNextCheckAt(aviso.horario_envio);
        await supabase
          .from("avisos_agendamento")
          .update({ next_check_at: nextCheckAt, last_check_at: new Date().toISOString() })
          .eq("id", aviso.id);
        continue;
      }
      
      console.log(`Found ${matchingAgendamentos.length} matching appointments for aviso "${aviso.nome}"`);

      for (const ag of matchingAgendamentos) {
        // Check if already sent for this specific agendamento+aviso combination
        const { data: alreadySent } = await supabase
          .from("avisos_enviados_log")
          .select("id")
          .eq("agendamento_id", ag.id)
          .eq("aviso_id", aviso.id)
          .eq("status", "enviado")
          .limit(1);

        if (alreadySent && alreadySent.length > 0) {
          console.log(`Skipping agendamento ${ag.id} - already sent for this aviso`);
          continue;
        }

        // Determine flag field (only for dias_antes type)
        let flagField = "";
        if (aviso.tipo_gatilho !== 'reagendamento') {
          if (aviso.dias_antes === 0) {
            flagField = "aviso_dia";
            if (ag.aviso_dia) continue;
          } else if (aviso.dias_antes === 1) {
            flagField = "aviso_dia_anterior";
            if (ag.aviso_dia_anterior) continue;
          } else if (aviso.dias_antes === 3) {
            flagField = "aviso_3dias";
            if (ag.aviso_3dias) continue;
          }
        }

        const telefone = ag.leads?.telefone;
        if (!telefone) continue;

        pendingAvisos.push({
          userId,
          avisoId: aviso.id,
          avisoNome: aviso.nome,
          diasAntes: aviso.dias_antes,
          intervaloMin: aviso.intervalo_min || 15,
          intervaloMax: aviso.intervalo_max || 33,
          mensagemTemplate: aviso.mensagem,
          agendamentoId: ag.id,
          flagField,
          clienteId: ag.leads?.id || "",
          clienteNome: ag.leads?.nome || "Desconhecido",
          telefone,
          dataAgendamento: ag.data_agendamento,
          procedimentoNome: ag.procedimentos?.nome || "Consulta",
          profissionalNome: ag.profissionais?.nome || "",
          leadOrigem: ag.origem_agendamento || ag.leads?.origem || null,
          leadInstanciaNome: ag.leads?.instancia_nome || null,
          agendamentoInstanciaNome: ag.origem_instancia_nome || null,
          tipoGatilho: aviso.tipo_gatilho || 'dias_antes',
          numeroReagendamentos: ag.numero_reagendamentos || 0,
        });
      }

      if (pendingAvisos.length === 0) {
        console.log(`No pending messages for aviso "${aviso.nome}"`);
        // Update next_check_at to tomorrow
        const nextCheckAt = calculateNextCheckAt(aviso.horario_envio);
        await supabase
          .from("avisos_agendamento")
          .update({ next_check_at: nextCheckAt, last_check_at: new Date().toISOString() })
          .eq("id", aviso.id);
        continue;
      }

      console.log(`${pendingAvisos.length} messages to send for aviso "${aviso.nome}"`);

      // Load configs for this user
      const { data: defaultConfig } = await supabase
        .from("uazapi_config")
        .select("base_url, api_key")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      const { data: disparosInstances } = await supabase
        .from("disparos_instancias")
        .select("nome, base_url, api_key")
        .eq("user_id", userId)
        .eq("is_active", true);

      const instanceConfigMap: Record<string, WhatsAppConfig> = {};
      if (disparosInstances) {
        for (const inst of disparosInstances) {
          instanceConfigMap[inst.nome] = {
            base_url: inst.base_url,
            api_key: inst.api_key,
          };
        }
      }

      const configs = { defaultConfig: defaultConfig || null, instanceConfigMap };

      if (!configs.defaultConfig && Object.keys(configs.instanceConfigMap).length === 0) {
        console.log(`No WhatsApp config for user ${userId}, skipping aviso`);
        continue;
      }

      // Process messages (up to MAX_MESSAGES_PER_EXECUTION to avoid timeout)
      let processedInThisAviso = 0;
      for (const pending of pendingAvisos) {
        if (processedInThisAviso >= MAX_MESSAGES_PER_EXECUTION) {
          // Schedule next check in 30 seconds to continue
          const nextCheckAt = new Date(Date.now() + 30 * 1000).toISOString();
          await supabase
            .from("avisos_agendamento")
            .update({ next_check_at: nextCheckAt, last_check_at: new Date().toISOString() })
            .eq("id", aviso.id);
          console.log(`Reached message limit, scheduled next check at ${nextCheckAt}`);
          break;
        }

        const { success, result } = await processAviso(supabase, pending, configs);
        results.push(result);

        if (success) {
          totalSent++;
        }
        processedInThisAviso++;

        // Wait between messages
        if (processedInThisAviso < pendingAvisos.length && processedInThisAviso < MAX_MESSAGES_PER_EXECUTION) {
          const randomInterval = getRandomInterval(pending.intervaloMin, pending.intervaloMax);
          console.log(`Waiting ${randomInterval}s before next message...`);
          await delay(randomInterval * 1000);
        }
      }

      // If we processed all messages for this aviso, schedule for tomorrow
      if (processedInThisAviso >= pendingAvisos.length || processedInThisAviso < MAX_MESSAGES_PER_EXECUTION) {
        const nextCheckAt = calculateNextCheckAt(aviso.horario_envio);
        await supabase
          .from("avisos_agendamento")
          .update({ next_check_at: nextCheckAt, last_check_at: new Date().toISOString() })
          .eq("id", aviso.id);
        console.log(`Aviso "${aviso.nome}" completed, next check at ${nextCheckAt}`);
      }
    }

    console.log(`Finished processing. Total sent: ${totalSent}`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in enviar-avisos-agendamento:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
