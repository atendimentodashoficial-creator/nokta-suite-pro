/// <reference types="https://esm.sh/@anthropic-ai/sdk@0.30.1/resources/messages.d.ts" />
declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Batch processing constants
const BATCH_SIZE = 10; // Process 10 contacts per execution
const MAX_EXECUTION_TIME_MS = 120000; // 120 seconds (2 min safety margin before 150s limit)

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
      }

      // Update campaign status (only set iniciado_em on first start)
      if (action === "start") {
        await supabase
          .from("disparos_campanhas")
          .update({
            status: "running",
            iniciado_em: campanha.iniciado_em || new Date().toISOString()
          })
          .eq("id", campanha_id);
      } else {
        // For continue, just ensure status is running (already verified it's not paused)
        await supabase
          .from("disparos_campanhas")
          .update({ status: "running" })
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
            finalizado_em: new Date().toISOString()
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

      // Process contacts in background with multiple instances
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
        .update({ status: "paused" })
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

async function createOrUpdateChat(
  supabase: any,
  userId: string,
  numero: string,
  nome: string | null,
  instancia: DisparosInstancia
): Promise<string | null> {
  try {
    const digits = await normalizePhoneNumber(numero);
    const normalizedNumber = ensureBrazilCountryCode(digits);
    const last8Digits = normalizedNumber.slice(-8);
    const chatId = `${normalizedNumber}@s.whatsapp.net`;

    // Check if chat already exists for this instance
    const { data: existingChats, error: existingError } = await supabase
      .from("disparos_chats")
      .select("id, normalized_number, deleted_at")
      .eq("user_id", userId)
      .eq("instancia_id", instancia.id)
      .is("deleted_at", null);

    if (existingError) {
      console.error("Error checking existing chats:", existingError);
    }

    // Find by last 8 digits
    const existingChat = existingChats?.find((c: any) =>
      String(c.normalized_number || "").replace(/\D/g, "").slice(-8) === last8Digits
    );

    if (existingChat) {
      return existingChat.id;
    }

    // Create new chat
    const { data: newChat, error } = await supabase
      .from("disparos_chats")
      .insert({
        user_id: userId,
        chat_id: chatId,
        contact_number: normalizedNumber,
        contact_name: nome || normalizedNumber,
        normalized_number: normalizedNumber,
        instancia_id: instancia.id,
        instancia_nome: instancia.nome,
        last_message: null,
        last_message_time: new Date().toISOString(),
        unread_count: 0,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error creating chat:", error);
      return null;
    }

    console.log(`Created new chat ${newChat.id} for ${normalizedNumber} on instance ${instancia.nome}`);
    return newChat.id;
  } catch (error: any) {
    console.error("Error in createOrUpdateChat:", error);
    return null;
  }
}

async function saveMessageToChat(
  supabase: any,
  chatDbId: string,
  content: string,
  mediaType: string | null,
  mediaUrl: string | null
): Promise<void> {
  try {
    const messageId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();
    const mediaTypeToSave = (mediaType || "text") as any;
    const contentToSave = content || (mediaTypeToSave !== "text" ? `[${mediaTypeToSave}]` : "");

    const { error: insertError } = await supabase
      .from("disparos_messages")
      .insert({
        chat_id: chatDbId,
        message_id: messageId,
        content: contentToSave,
        sender_type: "agent",
        media_type: mediaTypeToSave,
        media_url: mediaUrl,
        timestamp: now,
        status: "sent",
        deleted: false,
      });

    if (insertError) {
      console.error("Error inserting disparos_messages:", insertError);
      // Don't return; still try to update the chat card so UI reflects activity.
    }

    const { error: chatUpdateError } = await supabase
      .from("disparos_chats")
      .update({
        last_message: contentToSave,
        last_message_time: now,
        updated_at: now,
      })
      .eq("id", chatDbId);

    if (chatUpdateError) {
      console.error("Error updating disparos_chats last message:", chatUpdateError);
    }
  } catch (error: any) {
    console.error("Error saving message to chat:", error);
  }
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

  // Get block delay config (default to 3-8 seconds if not set)
  const delayBlocoMin = campanha.delay_bloco_min ?? 3;
  const delayBlocoMax = campanha.delay_bloco_max ?? 8;

  // Smart instance rotation tracking - PERSISTED across batches
  // Load previous state from database to continue where we left off
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
  
  // Track the last used instance - loaded from DB to avoid consecutive repeats across batches
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
   * Smart instance selection algorithm:
   * 1. Never pick the same instance twice in a row (if multiple available)
   * 2. Prioritize instances with fewer sends in campaign total
   * 3. Among ties, prioritize the one that sent longest ago
   * 4. Add slight randomness to avoid predictable patterns
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
      // Fallback (shouldn't happen with multiple instances)
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
      const sendScore = stats.sends * 1000; // Heavy weight on total send count
      const timeScore = stats.lastSendTime > 0 
        ? Math.max(0, 500 - (Date.now() - stats.lastSendTime) / 100) // Favor older last sends
        : 0; // Never sent = best time score
      const randomFactor = Math.random() * 50; // Small randomness to break ties unpredictably
      
      return {
        instance: inst,
        score: sendScore + timeScore + randomFactor
      };
    });

    // Sort by score (ascending) and pick the best
    scored.sort((a, b) => a.score - b.score);
    
    const selected = scored[0].instance;
    
    // Update tracking
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
    if (processedCount >= BATCH_SIZE) {
      console.log(`Batch size limit reached (${processedCount} contacts), saving state and scheduling next batch...`);
      await saveRotationState();
      await scheduleNextBatch(campanha.id);
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
      return; // Don't schedule next batch if paused
    }

    // Select instance using smart rotation algorithm
    const currentInstance = selectNextInstance();
    
    console.log(`[Smart Rotation] Selected instance: ${currentInstance.nome} (sends in batch: ${instanceStats.get(currentInstance.id)!.sends})`);


    // Chat will only be created after first successful message
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
        
        // First, replace {nome} variable (case insensitive, before spintax processing)
        if (contato.nome) {
          mensagem = mensagem.replace(/\{nome\}/gi, contato.nome);
        } else {
          mensagem = mensagem.replace(/\{nome\}/gi, "");
        }
        
        // Then, process spintax variations like {option1|option2|option3}
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
        }

        // Save message to chat
        if (chatDbId) {
          await saveMessageToChat(
            supabase,
            chatDbId,
            mensagem || (mediaType !== "text" ? `[${mediaType}]` : ""),
            mediaType,
            null // We don't have media URL from base64, just store as null
          );
        }

        // Add variable delay between blocks (if not the last block)
        if (blocoIndex < blocos.length - 1) {
          // Use continuous random to get any value in the range (e.g., 3.5s, 5.2s, etc.)
          const blocoDelaySeconds = Math.random() * (delayBlocoMax - delayBlocoMin) + delayBlocoMin;
          const blocoDelay = Math.round(blocoDelaySeconds * 1000);
          console.log(`[${currentInstance.nome}] Waiting ${blocoDelaySeconds.toFixed(1)}s before next block...`);
          await new Promise(resolve => setTimeout(resolve, blocoDelay));
        }

      } catch (error: any) {
        console.error(`[${currentInstance.nome}] Error sending block ${blocoIndex + 1} to ${contato.numero}:`, error.message);
        allBlocksSuccess = false;
        lastError = `[${currentInstance.nome}] Block ${blocoIndex + 1}: ${error.message}`;
        // Don't break - try to continue with remaining blocks
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

    // Random delay between contacts (after all blocks are sent)
    // If delay is in minutes (>=60s), use continuous variation for more randomness
    // If delay is in seconds (<60s), use whole seconds
    let delaySeconds: number;
    let delayDisplay: string;
    
    if (campanha.delay_min >= 60) {
      // Minutes range: use continuous random for extra variation (e.g., 2min 30s, 3min 14s)
      delaySeconds = Math.random() * (campanha.delay_max - campanha.delay_min) + campanha.delay_min;
      const delayMinutes = Math.floor(delaySeconds / 60);
      const delayRemainingSecs = Math.round(delaySeconds % 60);
      delayDisplay = `${delayMinutes}min ${delayRemainingSecs}s`;
    } else {
      // Seconds range: use whole seconds (e.g., 35s, 42s, 58s)
      delaySeconds = Math.floor(Math.random() * (campanha.delay_max - campanha.delay_min + 1) + campanha.delay_min);
      delayDisplay = `${delaySeconds}s`;
    }
    
    const delay = Math.round(delaySeconds * 1000);
    console.log(`[${currentInstance.nome}] Waiting ${delayDisplay} before next contact...`);
    await new Promise(resolve => setTimeout(resolve, delay));
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
    // More contacts to process, schedule next batch
    console.log(`Batch complete, more contacts pending. Scheduling next batch...`);
    await scheduleNextBatch(campanha.id);
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
          finalizado_em: new Date().toISOString()
        })
        .eq("id", campanha.id);

      console.log(`Campaign ${campanha.id} completed: ${enviados} sent, ${falhas} failed`);
    }
  }
}
