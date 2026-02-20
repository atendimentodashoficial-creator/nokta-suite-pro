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

/**
 * Check if an instance is truly connected to WhatsApp
 * Uses a lightweight status check to verify actual connectivity
 */
async function checkInstanceConnection(instance: DisparosInstancia): Promise<boolean> {
  try {
    const baseUrl = instance.base_url.replace(/\/+$/, '');
    
    const response = await fetch(`${baseUrl}/instance/status`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": instance.api_key,
      },
    });

    if (!response.ok) {
      console.log(`[Instance Check] ${instance.nome}: Status check failed with ${response.status}`);
      return false;
    }

    const statusData = await response.json();
    
    const nestedStatus = statusData?.status;
    const instanceStatus = statusData?.instance?.status;

    // Some providers return fields at root, others under "status".
    // IMPORTANT: keep `connected` as boolean | undefined (do not coerce to false)
    // so we can treat "not reported" as acceptable.
    const loggedIn = nestedStatus?.loggedIn === true || statusData?.loggedIn === true;
    const jid = nestedStatus?.jid ?? statusData?.jid;
    const connectedRaw: boolean | undefined = (nestedStatus?.connected ?? statusData?.connected) as
      | boolean
      | undefined;

    // Check for transitional states
    const isConnecting = instanceStatus === "connecting" || instanceStatus === "starting";

    // Check for disconnected state
    const isDisconnected =
      instanceStatus === "disconnected" ||
      instanceStatus === "close" ||
      instanceStatus === "DISCONNECTED" ||
      connectedRaw === false;

    const hasValidJid = jid != null && String(jid).length > 0;

    // Only consider truly connected if:
    // 1) loggedIn is true
    // 2) jid exists
    // 3) not connecting
    // 4) not explicitly disconnected
    // 5) connected flag is true OR not provided
    const isReallyConnected =
      loggedIn === true &&
      hasValidJid &&
      !isConnecting &&
      !isDisconnected &&
      (connectedRaw === true || connectedRaw === undefined);

    console.log(
      `[Instance Check] ${instance.nome}: loggedIn=${loggedIn}, jid=${hasValidJid ? "yes" : "no"}, connected=${connectedRaw}, instanceStatus=${instanceStatus}, isReallyConnected=${isReallyConnected}`,
    );

    return isReallyConnected;
  } catch (error: any) {
    console.error(`[Instance Check] ${instance.nome}: Error checking connection:`, error.message);
    return false;
  }
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
    
    // Get disabled instances list for this campaign
    const disabledInstanceIds: string[] = (campanha.disabled_instancias_ids as string[]) || [];
    console.log(`Campaign has ${disabledInstanceIds.length} disabled instance(s): ${disabledInstanceIds.join(", ") || "none"}`);
    
    // Check if campaign has specific instances configured
    if (campanha.instancias_ids && campanha.instancias_ids.length > 0) {
      // Filter out disabled instances from the configured list
      const activeInstanceIds = (campanha.instancias_ids as string[]).filter(
        (id: string) => !disabledInstanceIds.includes(id)
      );
      
      console.log(`Campaign configured instances: ${(campanha.instancias_ids as string[]).join(", ")}`);
      console.log(`Active (non-disabled) instances: ${activeInstanceIds.join(", ") || "none"}`);
      
      if (activeInstanceIds.length > 0) {
        const { data: instanciasData } = await supabase
          .from("disparos_instancias")
          .select("*")
          .eq("user_id", userId)
          .in("id", activeInstanceIds)
          .eq("is_active", true);
        
        if (instanciasData && instanciasData.length > 0) {
          instancias = instanciasData;
        }
      }
    }

    // Fallback: get all active instances (also excluding disabled ones)
    if (instancias.length === 0) {
      const { data: allInstancias } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);
      
      if (allInstancias && allInstancias.length > 0) {
        // Filter out disabled instances
        instancias = allInstancias.filter(inst => !disabledInstanceIds.includes(inst.id));
      }
    }

    if (instancias.length === 0) {
      throw new Error("Nenhuma instância de disparos configurada");
    }

    // CRITICAL: Verify which instances are actually connected before starting campaign
    console.log(`Checking connection status for ${instancias.length} instance(s)...`);
    const connectionChecks = await Promise.all(
      instancias.map(async (inst) => ({
        instance: inst,
        connected: await checkInstanceConnection(inst)
      }))
    );
    
    // Filter to only actually connected instances
    const connectedInstances = connectionChecks
      .filter(check => check.connected)
      .map(check => check.instance);
    
    const disconnectedNames = connectionChecks
      .filter(check => !check.connected)
      .map(check => check.instance.nome);
    
    if (disconnectedNames.length > 0) {
      console.log(`WARNING: ${disconnectedNames.length} instance(s) not connected: ${disconnectedNames.join(", ")}`);
    }
    
    if (connectedInstances.length === 0) {
      throw new Error(`Nenhuma instância está conectada ao WhatsApp. Verifique as conexões: ${instancias.map(i => i.nome).join(", ")}`);
    }
    
    // Use only connected instances
    instancias = connectedInstances;

    console.log(`Campaign ${campanha_id} will use ${instancias.length} connected instance(s): ${instancias.map(i => i.nome).join(", ")}`);
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

        // OPTIMISTIC LOCK (idempotent): ensure only ONE execution can process a campaign at a time.
        // We use a combined approach:
        // 1. Check if next_send_at is in the future (someone already processing)
        // 2. Attempt atomic UPDATE with updated_at match (optimistic lock)
        // 3. Add a small random delay to reduce race conditions
        
        // Add small random delay (0-500ms) to stagger concurrent requests
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
        
        const { data: currentCampaign, error: fetchError } = await supabase
          .from("disparos_campanhas")
          .select("id, status, next_send_at, updated_at")
          .eq("id", campanha_id)
          .single();

        if (fetchError || !currentCampaign) {
          throw new Error("Campanha não encontrada para lock check");
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const nextSendAt = currentCampaign.next_send_at ? new Date(currentCampaign.next_send_at) : null;

        // If next_send_at is in the future (more than 30 seconds from now), someone already claimed this campaign.
        // The 30-second buffer helps avoid edge cases around the exact scheduled time.
        const lockBuffer = 30 * 1000; // 30 seconds
        if (nextSendAt && nextSendAt.getTime() > now.getTime() + lockBuffer) {
          console.log(
            `Campaign ${campanha_id}: Skip - next_send_at is ${nextSendAt.toISOString()}, now is ${nowIso} (buffer: ${lockBuffer}ms)`,
          );
          return new Response(
            JSON.stringify({
              success: true,
              message: "Campanha está sendo processada por outra execução",
              skipped: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Claim lock for enough time to cover the whole execution (blocks + delays).
        // NOTE: we use next_send_at as a lightweight lock so other 'continue' calls will skip.
        const lockUntilIso = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

        // Use FOR UPDATE to ensure atomic lock acquisition
        const { data: lockRows, error: lockError } = await supabase
          .from("disparos_campanhas")
          .update({
            status: "running",
            next_send_at: lockUntilIso,
            updated_at: nowIso,
          })
          .eq("id", campanha_id)
          .eq("status", "running")
          .eq("updated_at", currentCampaign.updated_at)
          .select("id");

        if (lockError) {
          console.error(`Campaign ${campanha_id}: Lock acquisition error:`, lockError);
          throw lockError;
        }

        if (!lockRows || lockRows.length === 0) {
          console.log(
            `Campaign ${campanha_id}: Lock not acquired (row changed). Another execution won the race.`,
          );
          return new Response(
            JSON.stringify({
              success: true,
              message: "Campanha está sendo processada por outra execução",
              skipped: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        console.log(`Campaign ${campanha_id}: Lock acquired successfully until ${lockUntilIso}`);
      }

      // Update campaign status (only set iniciado_em on first start)
      // CRITICAL: For "start" action, also set a lock via next_send_at to prevent
      // the frontend scheduler from calling "continue" immediately after "start"
      if (action === "start") {
        const startLockUntilIso = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes lock
        
        await supabase
          .from("disparos_campanhas")
          .update({
            status: "running",
            iniciado_em: campanha.iniciado_em || new Date().toISOString(),
            next_send_at: startLockUntilIso, // Lock to prevent concurrent executions during start
            updated_at: new Date().toISOString()
          })
          .eq("id", campanha_id);
        
        console.log(`Campaign ${campanha_id}: START action - locked until ${startLockUntilIso} to prevent scheduler race condition`);
      }

      // Reset any "sending" contacts that got stuck (from failed executions)
      // This handles orphaned contacts if a previous execution crashed
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: stuckContacts } = await supabase
        .from("disparos_campanha_contatos")
        .update({ status: "pending" })
        .eq("campanha_id", campanha_id)
        .eq("status", "sending")
        .eq("archived", false)
        .lt("created_at", twoMinutesAgo) // Only reset if stuck for more than 2 minutes
        .select("id");
      
      if (stuckContacts && stuckContacts.length > 0) {
        console.log(`Reset ${stuckContacts.length} stuck "sending" contacts back to pending`);
      }

      // Get pending contacts
      const { data: contatos, error: contatosError } = await supabase
        .from("disparos_campanha_contatos")
        .select("*")
        .eq("campanha_id", campanha_id)
        .eq("status", "pending")
        .eq("archived", false)
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
    sender_type: "agent",
    status: "sent",
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
   * CYCLIC ROUND-ROBIN instance selection algorithm
   * 
   * CRITICAL: This is a TRUE round-robin that cycles through instances in order.
   * It does NOT try to "catch up" instances with lower counts - this was the bug!
   * 
   * Rules:
   * 1. Maintain a fixed order of instances (sorted by ID for consistency)
   * 2. Always pick the NEXT instance in the rotation after the last used one
   * 3. Skip disconnected instances but continue the cycle
   * 4. Never repeat the same instance twice in a row UNLESS it's the only connected one
   */
  async function selectNextInstance(): Promise<DisparosInstancia | null> {
    const candidateInstances = [...instancias];
    
    if (candidateInstances.length === 0) {
      console.error(`[Cyclic Round-Robin] No instances configured!`);
      return null;
    }

    // CRITICAL: Sort by ID for consistent ordering across all executions
    // This ensures the rotation order is always the same
    candidateInstances.sort((a, b) => a.id.localeCompare(b.id));
    
    console.log(`[Cyclic Round-Robin] Instance order: ${candidateInstances.map((i, idx) => `${idx}:${i.nome}`).join(' -> ')}`);
    console.log(`[Cyclic Round-Robin] Last used: ${lastUsedInstanceId ? candidateInstances.find(i => i.id === lastUsedInstanceId)?.nome : 'none'}`);

    // Find the index of the last used instance
    let lastUsedIndex = lastUsedInstanceId 
      ? candidateInstances.findIndex((i) => i.id === lastUsedInstanceId)
      : -1;
    
    // Start from the NEXT instance after the last used one
    const startIndex = (lastUsedIndex + 1) % candidateInstances.length;
    
    console.log(`[Cyclic Round-Robin] Starting search from index ${startIndex} (${candidateInstances[startIndex]?.nome})`);

    // Try each instance in cyclic order starting from startIndex
    for (let offset = 0; offset < candidateInstances.length; offset++) {
      const currentIndex = (startIndex + offset) % candidateInstances.length;
      const instance = candidateInstances[currentIndex];
      
      // Check if this instance is connected
      const isConnected = await checkInstanceConnection(instance);
      
      if (!isConnected) {
        console.log(`[Cyclic Round-Robin] Instance ${instance.nome} (idx=${currentIndex}) is NOT connected, trying next...`);
        await markInstanceAsDisabled(instance.id, instance.nome);
        continue;
      }

      // Found a connected instance!
      const stats = instanceStats.get(instance.id)!;
      const prevSends = stats.sends;
      stats.sends++;
      stats.lastSendTime = Date.now();
      lastUsedInstanceId = instance.id;
      
      console.log(`[Cyclic Round-Robin] SELECTED: ${instance.nome} (idx=${currentIndex}, sends=${prevSends} -> ${stats.sends})`);
      return instance;
    }

    console.error(`[Cyclic Round-Robin] No connected instances available after checking all ${candidateInstances.length}!`);
    return null;
  }

  /**
   * Mark an instance as disabled in the campaign (due to connection issues)
   */
  async function markInstanceAsDisabled(instanceId: string, instanceName: string): Promise<void> {
    try {
      // Get current disabled instances
      const { data: currentCampaign } = await supabase
        .from("disparos_campanhas")
        .select("disabled_instancias_ids")
        .eq("id", campanha.id)
        .single();

      const currentDisabled: string[] = (currentCampaign?.disabled_instancias_ids as string[]) || [];
      
      // Only add if not already in the list
      if (!currentDisabled.includes(instanceId)) {
        const newDisabled = [...currentDisabled, instanceId];
        
        await supabase
          .from("disparos_campanhas")
          .update({ disabled_instancias_ids: newDisabled })
          .eq("id", campanha.id);
        
        console.log(`[Instance Disabled] ${instanceName} (${instanceId}) added to disabled list for campaign ${campanha.id}`);
      }
    } catch (error: any) {
      console.error(`[Instance Disabled] Error marking instance as disabled:`, error.message);
    }
  }

  for (const contato of contatos) {
    // Check if we've reached time limit
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > MAX_EXECUTION_TIME_MS) {
      console.log(`Time limit reached (${Math.round(elapsedTime / 1000)}s), saving state and scheduling next batch...`);
      await saveRotationState();

      // IMPORTANT: for short-delay mode, next_send_at is used only as an execution lock.
      // Clear it before self-scheduling, otherwise the next 'continue' call will be skipped.
      if (!isLongDelayMode) {
        await supabase
          .from("disparos_campanhas")
          .update({ next_send_at: null })
          .eq("id", campanha.id);
      }

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
        // (clear lock before scheduling to avoid skipping)
        await supabase
          .from("disparos_campanhas")
          .update({ next_send_at: null })
          .eq("id", campanha.id);

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

    // Select instance using smart rotation algorithm with real-time connectivity check
    const currentInstance = await selectNextInstance();
    
    if (!currentInstance) {
      // No connected instances available - mark contact as failed and continue
      console.error(`No connected instances available for contact ${contato.numero}`);
      await supabase
        .from("disparos_campanha_contatos")
        .update({
          status: "failed",
          enviado_em: new Date().toISOString(),
          erro: "Nenhuma instância conectada disponível"
        })
        .eq("id", contato.id);
      falhas++;
      processedCount++;
      
      // Update campaign progress
      await supabase
        .from("disparos_campanhas")
        .update({
          enviados,
          falhas,
          updated_at: new Date().toISOString()
        })
        .eq("id", campanha.id);
      
      continue;
    }
    
    console.log(`[Smart Rotation] Selected instance: ${currentInstance.nome} (sends in batch: ${instanceStats.get(currentInstance.id)!.sends})`);

    // CRITICAL: Mark contact as "sending" IMMEDIATELY to prevent duplicate processing
    // This prevents race conditions where another execution could pick up the same contact
    await supabase
      .from("disparos_campanha_contatos")
      .update({ status: "sending" })
      .eq("id", contato.id);

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
        
        // Replace {nome} variable (full name)
        if (contato.nome) {
          mensagem = mensagem.replace(/\{nome\}/gi, contato.nome);
        } else {
          mensagem = mensagem.replace(/\{nome\}/gi, "");
        }
        
        // Replace {primeironome} variable (first name only)
        if (contato.nome) {
          const primeiroNome = contato.nome.split(' ')[0];
          mensagem = mensagem.replace(/\{primeironome\}/gi, primeiroNome);
        } else {
          mensagem = mensagem.replace(/\{primeironome\}/gi, "");
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
          // Detect "not on WhatsApp" errors and throw with a recognizable prefix
          const lowerError = errorText.toLowerCase();
          if (
            lowerError.includes("not on whatsapp") ||
            lowerError.includes("number not exists") ||
            lowerError.includes("não existe no whatsapp") ||
            lowerError.includes("phone not registered") ||
            lowerError.includes("invalid phone") ||
            lowerError.includes("not registered") ||
            (response.status === 400 && lowerError.includes("phone"))
          ) {
            throw new Error(`SEM_WHATSAPP: ${errorText}`);
          }
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
    .eq("archived", false)
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

      // Clear lock before self-scheduling (short-delay campaigns don't use next_send_at as a timer)
      await supabase
        .from("disparos_campanhas")
        .update({ next_send_at: null })
        .eq("id", campanha.id);

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
