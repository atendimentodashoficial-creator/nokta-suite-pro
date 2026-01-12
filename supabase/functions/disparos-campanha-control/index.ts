/// <reference types="https://esm.sh/@anthropic-ai/sdk@0.30.1/resources/messages.d.ts" />
declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// For short delays (<60s), process multiple contacts per execution
// For long delays (>=60s), process only 1 contact and schedule next via timestamp
const MAX_SHORT_DELAY_SECONDS = 60;
const MAX_EXECUTION_TIME_MS = 120000; // 120 seconds safety margin

interface DisparosInstancia {
  id: string;
  nome: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
}

interface CampanhaVariacao {
  id: string;
  bloco: number;
  tipo_mensagem: string;
  mensagem: string | null;
  media_base64: string | null;
  ordem: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campanha_id, action } = await req.json();
    if (!campanha_id || !action) {
      throw new Error("campanha_id and action are required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // For "continue" action, we use service role key directly (no user auth needed)
    // For "start" and "pause", we verify user auth
    let userId: string;

    if (action === "continue") {
      // Get campaign to find user_id (service role can access any campaign)
      const { data: campanha, error: campanhaError } = await supabase
        .from("disparos_campanhas")
        .select("user_id")
        .eq("id", campanha_id)
        .single();

      if (campanhaError || !campanha) {
        throw new Error("Campanha não encontrada");
      }
      userId = campanha.user_id;
    } else {
      // Verify user auth for start/pause actions
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        throw new Error("Missing authorization header");
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        throw new Error("Unauthorized");
      }
      userId = user.id;
    }

    // Get campaign
    const { data: campanha, error: campanhaError } = await supabase
      .from("disparos_campanhas")
      .select("*")
      .eq("id", campanha_id)
      .eq("user_id", userId)
      .single();

    if (campanhaError || !campanha) {
      throw new Error("Campanha não encontrada");
    }

    // Get campaign variations ordered by block and order
    const { data: variacoes } = await supabase
      .from("disparos_campanha_variacoes")
      .select("*")
      .eq("campanha_id", campanha_id)
      .order("bloco", { ascending: true })
      .order("ordem", { ascending: true });

    // Group variations by block
    const blocosMap = new Map<number, CampanhaVariacao[]>();
    for (const v of (variacoes || [])) {
      const blocoNum = v.bloco ?? 0;
      if (!blocosMap.has(blocoNum)) {
        blocosMap.set(blocoNum, []);
      }
      blocosMap.get(blocoNum)!.push(v);
    }
    
    // Convert to sorted array of blocks
    const blocos = Array.from(blocosMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, variations]) => variations);

    // Get instances - try new multi-instance table first, fallback to old config
    let instancias: DisparosInstancia[] = [];
    
    // Check if campaign has specific instances configured
    if (campanha.instancias_ids && campanha.instancias_ids.length > 0) {
      const { data: instanciasData } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("user_id", userId)
        .in("id", campanha.instancias_ids)
        .eq("is_active", true);
      
      if (instanciasData && instanciasData.length > 0) {
        instancias = instanciasData;
      }
    }

    // Fallback: get all active instances
    if (instancias.length === 0) {
      const { data: allInstancias } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);
      
      if (allInstancias && allInstancias.length > 0) {
        instancias = allInstancias;
      }
    }

    if (instancias.length === 0) {
      throw new Error("Nenhuma instância de disparos configurada");
    }

    console.log(`Campaign ${campanha_id} will use ${instancias.length} instance(s): ${instancias.map(i => i.nome).join(", ")}`);
    console.log(`Campaign has ${blocos.length} block(s) with total ${variacoes?.length || 0} variations`);

    if (action === "start" || action === "continue") {
      // For continue action, check if campaign was paused before continuing
      if (action === "continue") {
        if (campanha.status === "paused") {
          console.log(`Campaign ${campanha_id} is paused, not continuing`);
          return new Response(
            JSON.stringify({ success: true, message: "Campanha pausada, não continuando" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // OPTIMISTIC LOCK: Use atomic update to prevent race conditions
        // Only proceed if next_send_at is null OR has passed
        // Immediately set next_send_at to a future time to "claim" this execution slot
        // NOTE: PostgREST filter values use dot separators, so we MUST avoid milliseconds in ISO strings.
        const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
        const lockTime = new Date(Date.now() + 60000).toISOString(); // 60 seconds lock
        
        const { data: lockResult, error: lockError } = await supabase
          .from("disparos_campanhas")
          .update({ 
            status: "running",
            next_send_at: lockTime // Temporarily set to prevent other calls
          })
          .eq("id", campanha_id)
          .eq("status", "running") // Only if still running
          .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`) // Only if no pending schedule or schedule has passed
          .select("id")
          .maybeSingle();

        if (lockError) {
          console.error(`Campaign ${campanha_id}: Lock acquisition error:`, lockError);
          throw lockError;
        }

        if (!lockResult) {
          // Another process is already handling this campaign
          console.log(`Campaign ${campanha_id}: Could not acquire lock - another process is handling it`);
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Campanha está sendo processada por outra execução",
              skipped: true
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Campaign ${campanha_id}: Lock acquired successfully`);
      }

      // Update campaign status (only set iniciado_em on first start)
      if (action === "start") {
        await supabase
          .from("disparos_campanhas")
          .update({
            status: "running",
            iniciado_em: campanha.iniciado_em || new Date().toISOString(),
            next_send_at: null // Clear any previous scheduling
          })
          .eq("id", campanha_id);
      }

      // Get pending contacts
      const { data: contatos, error: contatosError } = await supabase
        .from("disparos_campanha_contatos")
        .select("*")
        .eq("campanha_id", campanha_id)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (contatosError) throw contatosError;

      const totalPending = contatos?.length || 0;
      console.log(`${action === "continue" ? "Continuing" : "Starting"} campaign ${campanha_id} with ${totalPending} pending contacts, ${instancias.length} instances, and ${blocos.length} blocks`);

      if (totalPending === 0) {
        // No more contacts to process, mark as completed
        await supabase
          .from("disparos_campanhas")
          .update({
            status: "completed",
            finalizado_em: new Date().toISOString(),
            next_send_at: null
          })
          .eq("id", campanha_id);

        console.log(`Campaign ${campanha_id} completed - no pending contacts`);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Campanha finalizada - todos os contatos processados" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process contacts in background
      EdgeRuntime.waitUntil(processCampaign(
        supabase,
        instancias,
        campanha,
        contatos || [],
        blocos
      ));

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: action === "continue" 
            ? `Continuando campanha - ${totalPending} contatos pendentes`
            : `Campanha iniciada com ${instancias.length} instância(s) e ${blocos.length} bloco(s) de mensagem` 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "pause") {
      await supabase
        .from("disparos_campanhas")
        .update({ 
          status: "paused",
          next_send_at: null // Clear scheduling when paused
        })
        .eq("id", campanha_id);

      return new Response(
        JSON.stringify({ success: true, message: "Campanha pausada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Invalid action");
  } catch (error: any) {
    console.error("Error in disparos-campanha-control:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function normalizePhoneNumber(phone: string): Promise<string> {
  return phone.replace(/\D/g, "");
}

/**
 * Process spintax variations in text.
 * Example: "Hello {friend|buddy|pal}" -> "Hello buddy" (randomly selected)
 * Supports nested spintax: "{Hi|Hello} {friend|{dear|valued} customer}"
 */
function processSpintax(text: string): string {
  if (!text) return text;
  
  // Regex to match spintax patterns: {option1|option2|option3}
  const spintaxRegex = /\{([^{}]+)\}/g;
  
  let result = text;
  let match;
  let iterations = 0;
  const maxIterations = 100; // Prevent infinite loops with nested spintax
  
  // Process spintax patterns (may need multiple passes for nested patterns)
  while ((match = spintaxRegex.exec(result)) !== null && iterations < maxIterations) {
    const fullMatch = match[0];
    const options = match[1].split("|");
    const randomOption = options[Math.floor(Math.random() * options.length)];
    
    result = result.replace(fullMatch, randomOption);
    
    // Reset regex to start from beginning after replacement
    spintaxRegex.lastIndex = 0;
    iterations++;
  }
  
  return result;
}

function ensureBrazilCountryCode(digits: string): string {
  // If user provides only DDD+number (10/11 digits), prepend Brazil country code.
  // If already includes country code (e.g., 55...), keep as is.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

// Create lead when campaign sends first message to a contact
async function createLeadFromCampaign(
  supabase: any,
  userId: string,
  numero: string,
  nome: string | null,
  instanciaNome: string
): Promise<void> {
  try {
    const digits = numero.replace(/\D/g, "");
    const normalizedNumber = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
    const last8Digits = normalizedNumber.slice(-8);
    const today = new Date().toISOString().split('T')[0];

    // Check if lead already exists with same phone AND origin=Disparos
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("id, telefone, origem")
      .eq("user_id", userId)
      .eq("origem", "Disparos")
      .is("deleted_at", null);

    // Find by last 8 digits
    const matchingLead = existingLeads?.find((l: any) =>
      String(l.telefone || "").replace(/\D/g, "").slice(-8) === last8Digits
    );

    if (matchingLead) {
      console.log(`Lead already exists for ${numero} with origin Disparos:`, matchingLead.id);
      return;
    }

    // Create new lead with respondeu = false (hasn't responded yet)
    const { data: newLead, error: insertError } = await supabase
      .from("leads")
      .insert({
        user_id: userId,
        nome: nome || `Contato ${normalizedNumber}`,
        telefone: normalizedNumber,
        procedimento_nome: "Contato via Disparos",
        origem: "Disparos",
        observacoes: `Lead criado via campanha de disparos`,
        status: "lead",
        origem_lead: true,
        data_contato: today,
        instancia_nome: instanciaNome,
        respondeu: false,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error creating lead:", insertError);
    } else {
      console.log(`Created new lead for ${numero}:`, newLead?.id);
    }
  } catch (error: any) {
    console.error("Error in createLeadFromCampaign:", error.message);
  }
}

// Create or update chat record for tracking conversation
async function createOrUpdateChat(
  supabase: any,
  userId: string,
  numero: string,
  nome: string | null,
  instancia: DisparosInstancia
): Promise<string> {
  const digits = numero.replace(/\D/g, "");
  const normalizedNumber = ensureBrazilCountryCode(digits);
  const chatId = `${normalizedNumber}@s.whatsapp.net`;

  // Check if chat already exists for this instance
  const { data: existingChat } = await supabase
    .from("disparos_chats")
    .select("id")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .eq("instancia_id", instancia.id)
    .maybeSingle();

  if (existingChat) {
    // Update existing chat
    await supabase
      .from("disparos_chats")
      .update({
        contact_name: nome || `Contato ${normalizedNumber}`,
        updated_at: new Date().toISOString(),
        deleted_at: null, // Restore if was deleted
      })
      .eq("id", existingChat.id);
    return existingChat.id;
  }

  // Create new chat
  const { data: newChat, error } = await supabase
    .from("disparos_chats")
    .insert({
      user_id: userId,
      chat_id: chatId,
      contact_name: nome || `Contato ${normalizedNumber}`,
      contact_number: numero,
      normalized_number: normalizedNumber,
      instancia_id: instancia.id,
      instancia_nome: instancia.nome,
      last_message_time: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating chat:", error);
    throw error;
  }

  return newChat.id;
}

// Save message to chat history
async function saveMessageToChat(
  supabase: any,
  chatDbId: string,
  content: string,
  mediaType: string | null,
  mediaUrl: string | null
): Promise<void> {
  const messageId = `sent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  await supabase.from("disparos_messages").insert({
    chat_id: chatDbId,
    message_id: messageId,
    content: content,
    sender_type: "sent",
    timestamp: new Date().toISOString(),
    media_type: mediaType === "text" ? null : mediaType,
    media_url: mediaUrl,
  });

  // Update chat's last message
  await supabase
    .from("disparos_chats")
    .update({
      last_message: content,
      last_message_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", chatDbId);
}

/**
 * Schedule the next batch of contacts to be processed by self-invoking the function
 */
async function scheduleNextBatch(campanhaId: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  console.log(`Scheduling next batch for campaign ${campanhaId}...`);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/disparos-campanha-control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        campanha_id: campanhaId,
        action: "continue"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to schedule next batch: ${response.status} - ${errorText}`);
    } else {
      console.log(`Next batch scheduled successfully for campaign ${campanhaId}`);
    }
  } catch (error: any) {
    console.error(`Error scheduling next batch for campaign ${campanhaId}:`, error.message);
  }
}

async function processCampaign(
  supabase: any,
  instancias: DisparosInstancia[],
  campanha: any,
  contatos: any[],
  blocos: CampanhaVariacao[][]
) {
  const startTime = Date.now();
  console.log(`Processing ${contatos.length} contacts for campaign ${campanha.id} using ${instancias.length} instances and ${blocos.length} blocks`);

  let enviados = campanha.enviados || 0;
  let falhas = campanha.falhas || 0;
  let processedCount = 0;

  // Determine if we're in "long delay" mode (>=60s between contacts)
  const isLongDelayMode = campanha.delay_min >= MAX_SHORT_DELAY_SECONDS;
  const batchSize = isLongDelayMode ? 1 : 10; // Only 1 contact per execution for long delays
  
  console.log(`Delay mode: ${isLongDelayMode ? 'LONG' : 'SHORT'} (delay_min=${campanha.delay_min}s), batch size: ${batchSize}`);

  // Get block delay config (default to 3-8 seconds if not set)
  const delayBlocoMin = campanha.delay_bloco_min ?? 3;
  const delayBlocoMax = campanha.delay_bloco_max ?? 8;

  // Smart instance rotation tracking - PERSISTED across batches
  const persistedState: Record<string, { sends: number; lastSendAt: number }> = 
    (campanha.instance_rotation_state && typeof campanha.instance_rotation_state === 'object') 
      ? campanha.instance_rotation_state 
      : {};
  
  const instanceStats: Map<string, { sends: number; lastSendTime: number }> = new Map();
  for (const inst of instancias) {
    const saved = persistedState[inst.id];
    instanceStats.set(inst.id, { 
      sends: saved?.sends || 0, 
      lastSendTime: saved?.lastSendAt || 0 
    });
  }
  
  // Track the last used instance
  let lastUsedInstanceId: string | null = campanha.last_instance_id || null;
  
  console.log(`[Rotation State] Loaded: lastUsedInstanceId=${lastUsedInstanceId}, stats=${JSON.stringify(persistedState)}`);

  /**
   * Save rotation state to database for persistence across batches
   */
  async function saveRotationState(): Promise<void> {
    const stateToSave: Record<string, { sends: number; lastSendAt: number }> = {};
    for (const [id, stats] of instanceStats.entries()) {
      stateToSave[id] = { sends: stats.sends, lastSendAt: stats.lastSendTime };
    }
    
    await supabase
      .from("disparos_campanhas")
      .update({
        last_instance_id: lastUsedInstanceId,
        instance_rotation_state: stateToSave
      })
      .eq("id", campanha.id);
  }

  /**
   * Smart instance selection algorithm
   */
  function selectNextInstance(): DisparosInstancia {
    if (instancias.length === 1) {
      const inst = instancias[0];
      const stats = instanceStats.get(inst.id)!;
      stats.sends++;
      stats.lastSendTime = Date.now();
      lastUsedInstanceId = inst.id;
      return inst;
    }

    // Filter out the last used instance to NEVER repeat consecutively
    const availableInstances = instancias.filter(inst => inst.id !== lastUsedInstanceId);
    
    if (availableInstances.length === 0) {
      const inst = instancias[0];
      const stats = instanceStats.get(inst.id)!;
      stats.sends++;
      stats.lastSendTime = Date.now();
      lastUsedInstanceId = inst.id;
      return inst;
    }

    // Score each instance: lower score = better candidate
    const scored = availableInstances.map(inst => {
      const stats = instanceStats.get(inst.id)!;
      const sendScore = stats.sends * 1000;
      const timeScore = stats.lastSendTime > 0 
        ? Math.max(0, 500 - (Date.now() - stats.lastSendTime) / 100)
        : 0;
      const randomFactor = Math.random() * 50;
      
      return {
        instance: inst,
        score: sendScore + timeScore + randomFactor
      };
    });

    scored.sort((a, b) => a.score - b.score);
    
    const selected = scored[0].instance;
    
    const stats = instanceStats.get(selected.id)!;
    stats.sends++;
    stats.lastSendTime = Date.now();
    lastUsedInstanceId = selected.id;
    
    return selected;
  }

  for (const contato of contatos) {
    // Check if we've reached time limit
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > MAX_EXECUTION_TIME_MS) {
      console.log(`Time limit reached (${Math.round(elapsedTime / 1000)}s), saving state and scheduling next batch...`);
      await saveRotationState();
      await scheduleNextBatch(campanha.id);
      return;
    }

    // Check if we've processed enough contacts for this batch
    if (processedCount >= batchSize) {
      console.log(`Batch size limit reached (${processedCount} contacts), saving state...`);
      await saveRotationState();
      
      // For long delays, set next_send_at and DON'T schedule immediately
      if (isLongDelayMode) {
        const delaySeconds = Math.random() * (campanha.delay_max - campanha.delay_min) + campanha.delay_min;
        const nextSendAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
        
        await supabase
          .from("disparos_campanhas")
          .update({ next_send_at: nextSendAt })
          .eq("id", campanha.id);
        
        const delayMinutes = Math.floor(delaySeconds / 60);
        const delayRemainingSecs = Math.round(delaySeconds % 60);
        console.log(`Long delay mode: Next send scheduled at ${nextSendAt} (in ${delayMinutes}min ${delayRemainingSecs}s)`);
        console.log(`Frontend polling will call 'continue' action after delay expires`);
      } else {
        // For short delays, schedule next batch immediately
        await scheduleNextBatch(campanha.id);
      }
      return;
    }

    // Check if campaign was paused
    const { data: currentCampanha } = await supabase
      .from("disparos_campanhas")
      .select("status")
      .eq("id", campanha.id)
      .single();

    if (currentCampanha?.status !== "running") {
      console.log(`Campaign ${campanha.id} was paused/stopped`);
      return;
    }

    // Select instance using smart rotation algorithm
    const currentInstance = selectNextInstance();
    
    console.log(`[Smart Rotation] Selected instance: ${currentInstance.nome} (sends in batch: ${instanceStats.get(currentInstance.id)!.sends})`);

    let chatDbId: string | null = null;
    let allBlocksSuccess = true;
    let lastError = "";
    let atLeastOneSuccess = false;

    // Send all blocks sequentially to this contact
    for (let blocoIndex = 0; blocoIndex < blocos.length; blocoIndex++) {
      const blocoVariacoes = blocos[blocoIndex];
      
      // Select random variation from this block
      const randomVariacao = blocoVariacoes[Math.floor(Math.random() * blocoVariacoes.length)];
      
      console.log(`[${currentInstance.nome}] Contact ${contato.numero}: Sending block ${blocoIndex + 1}/${blocos.length} (variation ${randomVariacao.ordem + 1}/${blocoVariacoes.length}, type: ${randomVariacao.tipo_mensagem})`);

      try {
        // Prepare message with variable substitution
        let mensagem = randomVariacao.mensagem || "";
        
        // First, replace {nome} variable
        if (contato.nome) {
          mensagem = mensagem.replace(/\{nome\}/gi, contato.nome);
        } else {
          mensagem = mensagem.replace(/\{nome\}/gi, "");
        }
        
        // Then, process spintax variations
        mensagem = processSpintax(mensagem);

        // Send message based on type
        const baseUrl = currentInstance.base_url.replace(/\/+$/, "");
        let endpoint = "";
        let body: any = { number: contato.numero };
        let mediaType: string | null = null;

        switch (randomVariacao.tipo_mensagem) {
          case "text":
            endpoint = "/send/text";
            body.text = mensagem;
            mediaType = "text";
            break;
          case "image":
            endpoint = "/send/media";
            body.type = "image";
            body.file = randomVariacao.media_base64;
            if (mensagem) body.caption = mensagem;
            mediaType = "image";
            break;
          case "audio":
            endpoint = "/send/media";
            body.type = "ptt";
            body.file = randomVariacao.media_base64;
            mediaType = "audio";
            break;
          case "video":
            endpoint = "/send/media";
            body.type = "video";
            body.file = randomVariacao.media_base64;
            if (mensagem) body.caption = mensagem;
            mediaType = "video";
            break;
          case "document":
            endpoint = "/send/media";
            body.type = "document";
            body.file = randomVariacao.media_base64;
            if (mensagem) body.caption = mensagem;
            mediaType = "document";
            break;
          default:
            endpoint = "/send/text";
            body.text = mensagem;
            mediaType = "text";
        }

        const apiUrl = `${baseUrl}${endpoint}`;
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": currentInstance.api_key,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        console.log(`[${currentInstance.nome}] Block ${blocoIndex + 1} sent successfully to ${contato.numero}`);
        atLeastOneSuccess = true;

        // Only create chat AFTER first successful message
        if (!chatDbId) {
          chatDbId = await createOrUpdateChat(
            supabase,
            campanha.user_id,
            contato.numero,
            contato.nome,
            currentInstance
          );
          
          // Create lead when first message is sent successfully
          await createLeadFromCampaign(
            supabase,
            campanha.user_id,
            contato.numero,
            contato.nome,
            currentInstance.nome
          );
        }

        // Save message to chat
        if (chatDbId) {
          await saveMessageToChat(
            supabase,
            chatDbId,
            mensagem || (mediaType !== "text" ? `[${mediaType}]` : ""),
            mediaType,
            null
          );
        }

        // Add variable delay between blocks (if not the last block)
        if (blocoIndex < blocos.length - 1) {
          const blocoDelaySeconds = Math.random() * (delayBlocoMax - delayBlocoMin) + delayBlocoMin;
          const blocoDelay = Math.round(blocoDelaySeconds * 1000);
          console.log(`[${currentInstance.nome}] Waiting ${blocoDelaySeconds.toFixed(1)}s before next block...`);
          await new Promise(resolve => setTimeout(resolve, blocoDelay));
        }

      } catch (error: any) {
        console.error(`[${currentInstance.nome}] Error sending block ${blocoIndex + 1} to ${contato.numero}:`, error.message);
        allBlocksSuccess = false;
        lastError = `[${currentInstance.nome}] Block ${blocoIndex + 1}: ${error.message}`;
      }
    }

    // Update contact status based on overall success
    if (allBlocksSuccess) {
      await supabase
        .from("disparos_campanha_contatos")
        .update({
          status: "sent",
          enviado_em: new Date().toISOString()
        })
        .eq("id", contato.id);
      enviados++;
      console.log(`[${currentInstance.nome}] All ${blocos.length} blocks sent to ${contato.numero} (${enviados} total sent)`);
    } else {
      await supabase
        .from("disparos_campanha_contatos")
        .update({
          status: "failed",
          enviado_em: new Date().toISOString(),
          erro: lastError
        })
        .eq("id", contato.id);
      falhas++;
    }

    // Update campaign progress
    await supabase
      .from("disparos_campanhas")
      .update({
        enviados,
        falhas,
        updated_at: new Date().toISOString()
      })
      .eq("id", campanha.id);

    processedCount++;

    // For SHORT delays only: wait between contacts within the same batch
    if (!isLongDelayMode && processedCount < batchSize && contatos.indexOf(contato) < contatos.length - 1) {
      let delaySeconds: number;
      let delayDisplay: string;
      
      if (campanha.delay_min >= 60) {
        delaySeconds = Math.random() * (campanha.delay_max - campanha.delay_min) + campanha.delay_min;
        const delayMinutes = Math.floor(delaySeconds / 60);
        const delayRemainingSecs = Math.round(delaySeconds % 60);
        delayDisplay = `${delayMinutes}min ${delayRemainingSecs}s`;
      } else {
        delaySeconds = Math.floor(Math.random() * (campanha.delay_max - campanha.delay_min + 1) + campanha.delay_min);
        delayDisplay = `${delaySeconds}s`;
      }
      
      const delay = Math.round(delaySeconds * 1000);
      console.log(`[${currentInstance.nome}] Waiting ${delayDisplay} before next contact...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All contacts in this batch processed, save state and check if there are more pending
  await saveRotationState();
  
  const { data: remainingContacts } = await supabase
    .from("disparos_campanha_contatos")
    .select("id")
    .eq("campanha_id", campanha.id)
    .eq("status", "pending")
    .limit(1);

  if (remainingContacts && remainingContacts.length > 0) {
    // More contacts to process
    if (isLongDelayMode) {
      // Set next_send_at for frontend polling
      const delaySeconds = Math.random() * (campanha.delay_max - campanha.delay_min) + campanha.delay_min;
      const nextSendAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
      
      await supabase
        .from("disparos_campanhas")
        .update({ next_send_at: nextSendAt })
        .eq("id", campanha.id);
      
      const delayMinutes = Math.floor(delaySeconds / 60);
      const delayRemainingSecs = Math.round(delaySeconds % 60);
      console.log(`Batch complete. Next send at ${nextSendAt} (in ${delayMinutes}min ${delayRemainingSecs}s)`);
    } else {
      // Short delay mode: schedule next batch immediately
      console.log(`Batch complete, more contacts pending. Scheduling next batch...`);
      await scheduleNextBatch(campanha.id);
    }
  } else {
    // No more contacts, campaign is complete
    const { data: finalCampanha } = await supabase
      .from("disparos_campanhas")
      .select("status")
      .eq("id", campanha.id)
      .single();

    if (finalCampanha?.status === "running") {
      await supabase
        .from("disparos_campanhas")
        .update({
          status: "completed",
          finalizado_em: new Date().toISOString(),
          next_send_at: null
        })
        .eq("id", campanha.id);

      console.log(`Campaign ${campanha.id} completed: ${enviados} sent, ${falhas} failed`);
    }
  }
}
