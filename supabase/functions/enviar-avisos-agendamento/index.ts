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
}

interface Agendamento {
  id: string;
  data_agendamento: string;
  aviso_3dias: boolean;
  aviso_dia_anterior: boolean;
  aviso_dia: boolean;
  user_id: string;
  leads: {
    id: string;
    nome: string;
    telefone: string;
    origem: string | null;
    instancia_nome: string | null;
  };
  procedimentos: {
    nome: string;
  } | null;
  profissionais: {
    nome: string;
  } | null;
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
  agendamentoInstanciaNome: string | null; // Prioritário para roteamento
}

// Configuration
const BATCH_SIZE = 10;
const MAX_EXECUTION_TIME_MS = 90000; // 90 seconds (Edge Function limit is ~120s)

// Get current time in São Paulo timezone
function getSaoPauloTime(): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const saoPauloOffset = -3 * 60 * 60 * 1000;
  return new Date(utc + saoPauloOffset);
}

// Helper to delay between sends
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Self-invoke to continue processing
async function selfInvokeContinue(pendingAvisos: PendingAviso[], processedCount: number) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  console.log(`Self-invoking to continue processing ${pendingAvisos.length} remaining avisos...`);
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/enviar-avisos-agendamento`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        action: "continue",
        pendingAvisos,
        processedCount,
      }),
    });
    
    if (!response.ok) {
      console.error(`Self-invoke failed: ${response.status} ${response.statusText}`);
    } else {
      console.log(`Self-invoke successful, continuing in background`);
    }
  } catch (error) {
    console.error("Self-invoke error:", error);
  }
}

// Process a single aviso
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
  // Priority: 1) agendamentoInstanciaNome, 2) leadInstanciaNome, 3) default
  let config: WhatsAppConfig | null = null;
  let instanceUsed = "default";

  // First check if agendamento has a specific instance (from Disparos scheduling)
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
    console.log(`No suitable WhatsApp config for ${aviso.clienteNome} (origem=${aviso.leadOrigem}, instancia=${instanciaParaUsar})`);
    return { success: false, result: { error: "No config available" } };
  }

  // Clean phone number
  const cleanPhone = aviso.telefone.replace(/\D/g, "");
  const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

  // Prepare message with variables
  const dataFormatada = new Date(aviso.dataAgendamento).toLocaleDateString("pt-BR");
  const horarioFormatado = new Date(aviso.dataAgendamento).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
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
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": config.api_key,
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

        const { error: updateError } = await supabase
          .from("agendamentos")
          .update(updateData)
          .eq("id", aviso.agendamentoId);

        if (updateError) {
          console.error(`Error updating flag ${aviso.flagField}:`, updateError);
        }
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
          aviso: aviso.avisoNome,
          phone: formattedPhone,
          instance: instanceUsed,
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
        aviso: aviso.avisoNome,
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

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing backend env vars");
    return new Response(
      JSON.stringify({ success: false, error: "Missing backend env vars" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const startTime = Date.now();

  try {
    const saoPauloNow = getSaoPauloTime();
    console.log(`Starting enviar-avisos-agendamento at ${saoPauloNow.toISOString()} (São Paulo time)`);

    // Check if this is a continuation request
    let pendingAvisos: PendingAviso[] = [];
    let previousProcessedCount = 0;
    let isContinuation = false;
    let filterAvisoId: string | null = null;
    let skipHorarioCheck = false;
    let requestedUserIdFromBody: string | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();

        if (body.action === "continue" && body.pendingAvisos) {
          // This is a continuation request
          isContinuation = true;
          pendingAvisos = body.pendingAvisos;
          previousProcessedCount = body.processedCount || 0;
          console.log(
            `Continuation request: ${pendingAvisos.length} pending avisos, ${previousProcessedCount} already processed`
          );
        } else {
          filterAvisoId = body.aviso_id || null;
          requestedUserIdFromBody = body.user_id || null;
          skipHorarioCheck = !!filterAvisoId;
          if (filterAvisoId) {
            console.log(`Manual test mode: aviso_id=${filterAvisoId}`);
          }
        }
      } catch {
        // No body or invalid JSON, continue normally
      }
    }

    // Resolve user scope (default: authenticated user)
    let effectiveUserId: string | null = null;
    if (!isContinuation && SUPABASE_ANON_KEY && authHeader) {
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

    // If caller provided a user_id, only accept it when it matches the authenticated user.
    if (requestedUserIdFromBody) {
      if (effectiveUserId && requestedUserIdFromBody !== effectiveUserId) {
        console.warn(
          `Ignoring mismatched user_id from body (body=${requestedUserIdFromBody}, auth=${effectiveUserId})`
        );
      } else if (!effectiveUserId) {
        effectiveUserId = requestedUserIdFromBody;
      }
    }

    // If not a continuation, build the pending avisos list
    if (!isContinuation) {
      // Get active avisos
      let avisosQuery = supabase
        .from("avisos_agendamento")
        .select("*")
        .eq("ativo", true);

      // If we know the user, only process their avisos (avoids cross-tenant sends)
      if (effectiveUserId) {
        avisosQuery = avisosQuery.eq("user_id", effectiveUserId);
      }

      if (filterAvisoId) {
        avisosQuery = avisosQuery.eq("id", filterAvisoId);
      }

      const { data: avisos, error: avisosError } = await avisosQuery;

      if (avisosError) {
        throw new Error(`Error fetching avisos: ${avisosError.message}`);
      }

      if (!avisos || avisos.length === 0) {
        console.log("No active avisos found");
        return new Response(
          JSON.stringify({ success: true, message: "No active avisos", sent: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Found ${avisos.length} active avisos`);

      // Group avisos by user_id
      const avisosByUser: Record<string, AvisoAgendamento[]> = {};
      for (const aviso of avisos) {
        if (!avisosByUser[aviso.user_id]) {
          avisosByUser[aviso.user_id] = [];
        }
        avisosByUser[aviso.user_id].push(aviso);
      }

      // Build pending avisos list
      for (const [userId, userAvisos] of Object.entries(avisosByUser)) {
        console.log(`Processing user ${userId} with ${userAvisos.length} avisos`);

        // Get appointments for next 7 days
        const hojeSP = new Date(saoPauloNow);
        hojeSP.setHours(0, 0, 0, 0);

        const em7Dias = new Date(hojeSP);
        em7Dias.setDate(em7Dias.getDate() + 7);
        em7Dias.setHours(23, 59, 59, 999);

        const { data: agendamentos, error: agendamentosError } = await supabase
          .from("agendamentos")
          .select(`
            id,
            data_agendamento,
            aviso_3dias,
            aviso_dia_anterior,
            aviso_dia,
            user_id,
            origem_agendamento,
            origem_instancia_nome,
            leads!inner(id, nome, telefone, origem, instancia_nome),
            procedimentos(nome),
            profissionais(nome)
          `)
          .eq("user_id", userId)
          .in("status", ["agendado", "confirmado"])
          .gte("data_agendamento", hojeSP.toISOString())
          .lte("data_agendamento", em7Dias.toISOString());

        if (agendamentosError || !agendamentos || agendamentos.length === 0) {
          console.log(`No upcoming appointments for user ${userId}`);
          continue;
        }

        console.log(`Found ${agendamentos.length} upcoming appointments for user ${userId}`);

        // Process each aviso for this user
        for (const aviso of userAvisos) {
          console.log(`Checking aviso "${aviso.nome}" (${aviso.dias_antes} dias antes, horario: ${aviso.horario_envio})`);

          // Check current time vs horario_envio
          // If the scheduled time has already passed and it wasn't sent yet, we still send (catch-up).
          if (!skipHorarioCheck) {
            const [envioHora, envioMinuto] = aviso.horario_envio.split(":").map(Number);
            const currentHour = saoPauloNow.getHours();
            const currentMinute = saoPauloNow.getMinutes();

            const currentTotal = currentHour * 60 + currentMinute;
            const envioTotal = envioHora * 60 + envioMinuto;

            // Too early -> skip. Past the scheduled time -> allow sending.
            if (currentTotal < envioTotal) {
              console.log(`Skipping aviso "${aviso.nome}" - too early (now=${currentTotal}, scheduled=${envioTotal})`);
              continue;
            }

            console.log(`Aviso "${aviso.nome}" is past scheduled time (catch-up enabled)`);
          }

          // Find matching agendamentos
          for (const ag of agendamentos as any[]) {
            const dataAgendamento = new Date(ag.data_agendamento);
            const dataAgendamentoSP = new Date(dataAgendamento.getTime());
            dataAgendamentoSP.setHours(0, 0, 0, 0);

            const hojeDateSP = new Date(saoPauloNow);
            hojeDateSP.setHours(0, 0, 0, 0);

            const diffDays = Math.round((dataAgendamentoSP.getTime() - hojeDateSP.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays !== aviso.dias_antes) {
              continue;
            }

            // Determine flag field
            let flagField = "";
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

            const telefone = ag.leads?.telefone;
            if (!telefone) continue;

            // Add to pending list
            // Prioriza origem_instancia_nome do agendamento, depois instancia_nome do lead
            const instanciaNomeParaUsar = ag.origem_instancia_nome || ag.leads?.instancia_nome || null;
            
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
            });
          }
        }
      }

      console.log(`Built pending avisos list: ${pendingAvisos.length} avisos to send`);
    }

    if (pendingAvisos.length === 0) {
      console.log("No avisos to send");
      return new Response(
        JSON.stringify({ success: true, message: "No avisos to send", sent: previousProcessedCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group pending avisos by user to load configs once
    const userIds = [...new Set(pendingAvisos.map(a => a.userId))];
    const userConfigs: Record<string, { defaultConfig: WhatsAppConfig | null; instanceConfigMap: Record<string, WhatsAppConfig> }> = {};

    for (const userId of userIds) {
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

      userConfigs[userId] = {
        defaultConfig: defaultConfig || null,
        instanceConfigMap,
      };
    }

    // Process avisos in batches
    let processedCount = previousProcessedCount;
    const results: any[] = [];
    let batchCount = 0;

    while (pendingAvisos.length > 0) {
      // Check if we're running out of time
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime >= MAX_EXECUTION_TIME_MS) {
        console.log(`Approaching time limit (${elapsedTime}ms). Self-invoking to continue...`);
        
        // Fire and forget - self-invoke to continue
        selfInvokeContinue(pendingAvisos, processedCount);
        
        return new Response(
          JSON.stringify({
            success: true,
            message: "Processing continued in background",
            sent: processedCount,
            remaining: pendingAvisos.length,
            results,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if we've processed enough for this batch
      if (batchCount >= BATCH_SIZE && pendingAvisos.length > 0) {
        console.log(`Batch limit reached (${BATCH_SIZE}). Self-invoking to continue...`);
        
        // Fire and forget - self-invoke to continue
        selfInvokeContinue(pendingAvisos, processedCount);
        
        return new Response(
          JSON.stringify({
            success: true,
            message: "Processing continued in background",
            sent: processedCount,
            remaining: pendingAvisos.length,
            results,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get next aviso
      const aviso = pendingAvisos.shift()!;
      const configs = userConfigs[aviso.userId];

      if (!configs || (!configs.defaultConfig && Object.keys(configs.instanceConfigMap).length === 0)) {
        console.log(`No config for user ${aviso.userId}, skipping aviso`);
        continue;
      }

      // Process this aviso
      const { success, result } = await processAviso(supabase, aviso, configs);
      results.push(result);
      
      if (success) {
        processedCount++;
      }
      batchCount++;

      // Wait between messages using the aviso's interval config
      if (pendingAvisos.length > 0) {
        const randomInterval = getRandomInterval(aviso.intervaloMin, aviso.intervaloMax);
        console.log(`Waiting ${randomInterval}s before next message...`);
        await delay(randomInterval * 1000);
      }
    }

    console.log(`Finished processing. Total sent: ${processedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: processedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in enviar-avisos-agendamento:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
