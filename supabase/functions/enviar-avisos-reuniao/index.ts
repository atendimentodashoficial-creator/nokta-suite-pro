import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface AvisoReuniao {
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
  next_check_at: string | null;
  envio_imediato: boolean;
  tipo_gatilho: string;
  procedimento_id: string | null;
}

interface WhatsAppConfig {
  base_url: string;
  api_key: string;
  instancia_id: string;
  instancia_nome: string;
}

interface PendingAviso {
  userId: string;
  avisoId: string;
  avisoNome: string;
  diasAntes: number;
  intervaloMin: number;
  intervaloMax: number;
  mensagemTemplate: string;
  reuniaoId: string;
  clienteNome: string;
  telefone: string;
  dataReuniao: string;
  titulo: string;
  meetLink: string | null;
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

  return Array.from(candidates).filter((x) => x.length >= 12);
}

// Format date for message
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// Format time for message
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
function replaceVariables(message: string, aviso: PendingAviso): string {
  let result = message;

  const primeiroNome = aviso.clienteNome.split(" ")[0];

  result = result.replace(/\{nome\}/gi, aviso.clienteNome);
  result = result.replace(/\{primeiro_nome\}/gi, primeiroNome);
  result = result.replace(/\{titulo\}/gi, aviso.titulo);
  result = result.replace(/\{data\}/gi, formatDate(aviso.dataReuniao));
  result = result.replace(/\{horario\}/gi, formatTime(aviso.dataReuniao));
  result = result.replace(/\{link_call\}/gi, aviso.meetLink || "[Link não disponível]");

  return processSpintax(result);
}

// Process a single aviso message
async function processAviso(
  supabase: any,
  aviso: PendingAviso,
  config: WhatsAppConfig
): Promise<{ success: boolean; result: any }> {
  const phoneCandidates = buildPhoneCandidates(aviso.telefone);

  const mensagem = replaceVariables(aviso.mensagemTemplate, aviso);

  console.log(`Sending aviso to ${aviso.telefone} for reuniao ${aviso.reuniaoId}`);

  let deliveredTo: string | null = null;
  let lastError: string | null = null;

  for (const candidate of phoneCandidates) {
    try {
      const response = await fetch(`${config.base_url}/send/text`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          token: config.api_key,
        },
        body: JSON.stringify({
          number: candidate,
          text: mensagem,
        }),
      });

      if (response.ok) {
        const responseData = await response.json();
        if (responseData.status !== "error") {
          deliveredTo = candidate;
          break;
        }
        lastError = responseData.message || "Unknown error";
      } else {
        const errorText = await response.text();
        lastError = errorText || `Error ${response.status}`;
      }
    } catch (sendError: any) {
      lastError = sendError.message;
    }
  }

  if (deliveredTo) {
    console.log(`Message sent successfully to ${deliveredTo}`);

    // Log the sent aviso (with instance info for audit)
    await supabase.from("avisos_reuniao_log").insert({
      user_id: aviso.userId,
      aviso_id: aviso.avisoId,
      reuniao_id: aviso.reuniaoId,
      cliente_nome: aviso.clienteNome,
      cliente_telefone: deliveredTo,
      aviso_nome: aviso.avisoNome,
      dias_antes: aviso.diasAntes,
      mensagem_enviada: mensagem,
      status: "enviado",
      enviado_em: new Date().toISOString(),
      instancia_id: config.instancia_id,
      instancia_nome: config.instancia_nome,
    });

    // Update aviso flags on reuniao
    if (aviso.diasAntes === 0) {
      await supabase.from("reunioes").update({ aviso_dia: true }).eq("id", aviso.reuniaoId);
    } else if (aviso.diasAntes === 1) {
      await supabase.from("reunioes").update({ aviso_dia_anterior: true }).eq("id", aviso.reuniaoId);
    } else if (aviso.diasAntes === 3) {
      await supabase.from("reunioes").update({ aviso_3dias: true }).eq("id", aviso.reuniaoId);
    }

    // For reagendamento type, update ultimo_reagendamento_avisado
    if (aviso.tipoGatilho === 'reagendamento' && aviso.numeroReagendamentos !== undefined) {
      await supabase
        .from("reunioes")
        .update({ ultimo_reagendamento_avisado: aviso.numeroReagendamentos })
        .eq("id", aviso.reuniaoId);
      console.log(`Updated ultimo_reagendamento_avisado to ${aviso.numeroReagendamentos}`);
    }

    return {
      success: true,
      result: {
        reuniao_id: aviso.reuniaoId,
        aviso: aviso.avisoNome,
        phone: deliveredTo,
        status: "sent",
      },
    };
  } else {
    console.error(`Error sending message to ${aviso.telefone}:`, lastError);

    // Log the failed aviso (with instance info for audit)
    await supabase.from("avisos_reuniao_log").insert({
      user_id: aviso.userId,
      aviso_id: aviso.avisoId,
      reuniao_id: aviso.reuniaoId,
      cliente_nome: aviso.clienteNome,
      cliente_telefone: aviso.telefone,
      aviso_nome: aviso.avisoNome,
      dias_antes: aviso.diasAntes,
      mensagem_enviada: mensagem,
      status: "erro",
      erro: lastError || "Unknown error",
      enviado_em: new Date().toISOString(),
      instancia_id: config.instancia_id,
      instancia_nome: config.instancia_nome,
    });

    return {
      success: false,
      result: {
        reuniao_id: aviso.reuniaoId,
        phone: aviso.telefone,
        status: "error",
        error: lastError || "Unknown error",
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
    console.log(`Starting enviar-avisos-reuniao at ${saoPauloNow.toISOString()} (São Paulo time)`);
    console.log(`Request type: ${isCronRequest ? 'CRON' : 'User'}`);

    // Parse request body
    let filterAvisoId: string | null = null;
    let requestedUserId: string | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        filterAvisoId = body.aviso_id || null;
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

    // Get the aviso configuration - only "dias_antes" type (not envio_imediato)
    let avisosQuery = supabase
      .from("avisos_reuniao")
      .select("*")
      .eq("ativo", true)
      .eq("envio_imediato", false)
      .eq("tipo_gatilho", "dias_antes");

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
      console.log("No active avisos reuniao found");
      return new Response(JSON.stringify({ success: true, message: "No active avisos", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${avisos.length} active avisos reuniao`);

    const results: any[] = [];
    let totalSent = 0;

    // Process each aviso
    for (const aviso of avisos as AvisoReuniao[]) {
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

      // Get reunioes for next 7 days
      const hojeSP = new Date(saoPauloNow);
      hojeSP.setHours(0, 0, 0, 0);

      const em7Dias = new Date(hojeSP);
      em7Dias.setDate(em7Dias.getDate() + 7);
      em7Dias.setHours(23, 59, 59, 999);

      const { data: reunioes, error: reunioesError } = await supabase
        .from("reunioes")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["agendado", "confirmado"])
        .gte("data_reuniao", hojeSP.toISOString())
        .lte("data_reuniao", em7Dias.toISOString());

      if (reunioesError || !reunioes || reunioes.length === 0) {
        console.log(`No upcoming reunioes for user ${userId}`);
        continue;
      }

      console.log(`Found ${reunioes.length} upcoming reunioes for user ${userId}`);

      // Build pending list for this aviso
      const pendingAvisos: PendingAviso[] = [];

      // Filter by dias_antes
      const matchingReunioes = (reunioes as any[]).filter(reuniao => {
        const dataReuniao = new Date(reuniao.data_reuniao);
        const dataReuniaoSP = new Date(dataReuniao.getTime());
        dataReuniaoSP.setHours(0, 0, 0, 0);

        const hojeDateSP = new Date(saoPauloNow);
        hojeDateSP.setHours(0, 0, 0, 0);

        const diffDays = Math.round((dataReuniaoSP.getTime() - hojeDateSP.getTime()) / (1000 * 60 * 60 * 24));

        return diffDays === aviso.dias_antes;
      });

      if (matchingReunioes.length === 0) {
        console.log(`No matching reunioes for aviso "${aviso.nome}" (dias_antes=${aviso.dias_antes})`);
        // Update timestamps
        const nextCheckAt = calculateNextCheckAt(aviso.horario_envio);
        await supabase
          .from("avisos_reuniao")
          .update({ next_check_at: nextCheckAt, last_check_at: new Date().toISOString() })
          .eq("id", aviso.id);
        continue;
      }

      console.log(`Found ${matchingReunioes.length} matching reunioes for aviso "${aviso.nome}"`);

      for (const reuniao of matchingReunioes) {
        // Get telefone from cliente_telefone or participantes
        const telefone = reuniao.cliente_telefone;
        if (!telefone) {
          console.log(`Skipping reuniao ${reuniao.id} - no phone number`);
          continue;
        }

        // Check if already sent for this specific reuniao+aviso combination
        const { data: alreadySent } = await supabase
          .from("avisos_reuniao_log")
          .select("id")
          .eq("reuniao_id", reuniao.id)
          .eq("aviso_id", aviso.id)
          .eq("status", "enviado")
          .limit(1);

        if (alreadySent && alreadySent.length > 0) {
          console.log(`Skipping reuniao ${reuniao.id} - already sent for this aviso`);
          continue;
        }

        // Check flag fields based on dias_antes
        if (aviso.dias_antes === 0 && reuniao.aviso_dia) continue;
        if (aviso.dias_antes === 1 && reuniao.aviso_dia_anterior) continue;
        if (aviso.dias_antes === 3 && reuniao.aviso_3dias) continue;

        // Get cliente name from participantes or leads
        let clienteNome = "Cliente";
        if (reuniao.participantes && reuniao.participantes.length > 0) {
          clienteNome = reuniao.participantes[0];
        } else if (reuniao.cliente_id) {
          const { data: lead } = await supabase
            .from("leads")
            .select("nome")
            .eq("id", reuniao.cliente_id)
            .single();
          if (lead?.nome) clienteNome = lead.nome;
        }

        pendingAvisos.push({
          userId,
          avisoId: aviso.id,
          avisoNome: aviso.nome,
          diasAntes: aviso.dias_antes,
          intervaloMin: aviso.intervalo_min || 15,
          intervaloMax: aviso.intervalo_max || 33,
          mensagemTemplate: aviso.mensagem,
          reuniaoId: reuniao.id,
          clienteNome,
          telefone,
          dataReuniao: reuniao.data_reuniao,
          titulo: reuniao.titulo || "Reunião",
          meetLink: reuniao.meet_link || null,
          tipoGatilho: aviso.tipo_gatilho || 'dias_antes',
          numeroReagendamentos: reuniao.numero_reagendamentos || 0,
        });
      }

      if (pendingAvisos.length === 0) {
        console.log(`No pending messages for aviso "${aviso.nome}"`);
        // Update next_check_at to tomorrow
        const nextCheckAt = calculateNextCheckAt(aviso.horario_envio);
        await supabase
          .from("avisos_reuniao")
          .update({ next_check_at: nextCheckAt, last_check_at: new Date().toISOString() })
          .eq("id", aviso.id);
        continue;
      }

      console.log(`${pendingAvisos.length} messages to send for aviso "${aviso.nome}"`);

      // Load ALL Disparos instances for this user (to match by chat)
      const { data: disparosInstances } = await supabase
        .from("disparos_instancias")
        .select("id, nome, base_url, api_key")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (!disparosInstances || disparosInstances.length === 0) {
        console.log(`No active Disparos instance for user ${userId}, skipping aviso`);
        continue;
      }

      // Process messages (up to MAX_MESSAGES_PER_EXECUTION to avoid timeout)
      let processedInThisAviso = 0;
      for (const pending of pendingAvisos) {
        if (processedInThisAviso >= MAX_MESSAGES_PER_EXECUTION) {
          // Schedule next check in 30 seconds to continue
          const nextCheckAt = new Date(Date.now() + 30 * 1000).toISOString();
          await supabase
            .from("avisos_reuniao")
            .update({ next_check_at: nextCheckAt, last_check_at: new Date().toISOString() })
            .eq("id", aviso.id);
          console.log(`Reached message limit, scheduled next check at ${nextCheckAt}`);
          break;
        }

        // Find the correct instance for this contact by looking up their chat.
        // IMPORTANT: match using phone candidates (with/without 9th digit) to avoid missing the real chat,
        // and prefer conversation continuity (instancia_original_id or the oldest chat).
        const phoneCandidates = buildPhoneCandidates(pending.telefone);
        const lookupCandidatesSet = new Set<string>();
        for (const c of phoneCandidates) {
          lookupCandidatesSet.add(c);
          if (c.startsWith("55")) lookupCandidatesSet.add(c.slice(2));
        }

        const lookupCandidates = Array.from(lookupCandidatesSet);

        const { data: existingChats, error: chatLookupError } = await supabase
          .from("disparos_chats")
          .select("id, instancia_id, instancia_original_id, created_at, updated_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .in("normalized_number", lookupCandidates);

        if (chatLookupError) {
          console.error("Error looking up existing chats for instance routing:", chatLookupError);
        }

        let config: WhatsAppConfig;

        // If aviso has a fixed instancia_id configured, use it directly
        const avisoInstanciaId: string | null = (aviso as any).instancia_id ?? null;
        if (avisoInstanciaId) {
          const forcedInstance = disparosInstances.find((inst) => inst.id === avisoInstanciaId);
          if (forcedInstance) {
            console.log(`Using forced instancia "${forcedInstance.nome}" from aviso config for ${pending.telefone}`);
            config = {
              base_url: forcedInstance.base_url.replace(/\/+$/, ""),
              api_key: forcedInstance.api_key,
              instancia_id: forcedInstance.id,
              instancia_nome: forcedInstance.nome,
            };
          } else {
            console.log(`Forced instancia ${avisoInstanciaId} not active/found, falling back to chat routing`);
            // Fall through to chat-based routing below
            config = null as any;
          }
        } else {
          config = null as any;
        }

        if (!config) {
          const chatsWithInstance = (existingChats || []).filter((c: any) => c?.instancia_id);

          if (chatsWithInstance.length > 0) {
            let selectedInstanceId: string | null = null;

            // Prefer migrated chats: use the original instance for continuity.
            const chatWithOriginal = chatsWithInstance.find((c: any) => c?.instancia_original_id);
            if (chatWithOriginal?.instancia_original_id) {
              selectedInstanceId = chatWithOriginal.instancia_original_id;
              console.log(`Using instancia_original_id for ${pending.telefone}: ${selectedInstanceId}`);
            } else {
              const oldestChat = [...chatsWithInstance].sort(
                (a: any, b: any) =>
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              )[0];
              selectedInstanceId = oldestChat?.instancia_id ?? null;
              console.log(`Using oldest chat instance for ${pending.telefone}: ${selectedInstanceId}`);
            }

          // Try the preferred instance (original or oldest)
            let matchedInstance = selectedInstanceId
              ? disparosInstances.find((inst) => inst.id === selectedInstanceId)
              : null;

            // If preferred instance not active, try the current instancia_id of the chat as fallback
            if (!matchedInstance && chatWithOriginal) {
              const currentInstId = chatWithOriginal.instancia_id;
              if (currentInstId) {
                matchedInstance = disparosInstances.find((inst) => inst.id === currentInstId) ?? null;
                if (matchedInstance) {
                  console.log(`Original instance not active, using current chat instance "${matchedInstance.nome}" for ${pending.telefone}`);
                }
              }
            }

            if (!matchedInstance) {
              // Last resort: try the instancia_id of the oldest chat
              const oldestChatInstId = chatsWithInstance[0]?.instancia_id;
              if (oldestChatInstId) {
                matchedInstance = disparosInstances.find((inst) => inst.id === oldestChatInstId) ?? null;
                if (matchedInstance) {
                  console.log(`Using oldest chat current instance "${matchedInstance.nome}" for ${pending.telefone}`);
                }
              }
            }

            if (matchedInstance) {
              console.log(`Using chat's instance "${matchedInstance.nome}" for ${pending.telefone}`);
              config = {
                base_url: matchedInstance.base_url.replace(/\/+$/, ""),
                api_key: matchedInstance.api_key,
                instancia_id: matchedInstance.id,
                instancia_nome: matchedInstance.nome,
              };
            } else {
              console.log(`No chat instance active, using first active instance for ${pending.telefone}`);
              config = {
                base_url: disparosInstances[0].base_url.replace(/\/+$/, ""),
                api_key: disparosInstances[0].api_key,
                instancia_id: disparosInstances[0].id,
                instancia_nome: disparosInstances[0].nome,
              };
            }
          } else {
            console.log(`No existing chat found, using first instance for ${pending.telefone}`);
            config = {
              base_url: disparosInstances[0].base_url.replace(/\/+$/, ""),
              api_key: disparosInstances[0].api_key,
              instancia_id: disparosInstances[0].id,
              instancia_nome: disparosInstances[0].nome,
            };
          }
        }

        const { success, result } = await processAviso(supabase, pending, config);
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
          .from("avisos_reuniao")
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
    console.error("Error in enviar-avisos-reuniao:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
