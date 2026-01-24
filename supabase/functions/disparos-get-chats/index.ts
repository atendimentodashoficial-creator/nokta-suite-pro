import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    console.log("=== Starting disparos-get-chats ===");
    console.log("User:", user.id);

    // Get active instances from disparos_instancias
    const { data: instancias, error: instanciasError } = await supabase
      .from("disparos_instancias")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (instanciasError) {
      console.error("Error fetching instancias:", instanciasError);
      throw new Error("Erro ao buscar instâncias");
    }

    // Get WhatsApp main instance ID to exclude it from Disparos sync
    const { data: uazapiConfig } = await supabase
      .from("uazapi_config")
      .select("whatsapp_instancia_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const whatsappMainInstanceId = uazapiConfig?.whatsapp_instancia_id;

    // Only use disparos_instancias, excluding the WhatsApp main instance
    let configs: Array<{ id: string; base_url: string; api_key: string; nome: string; created_at: Date }> = [];
    
    if (instancias && instancias.length > 0) {
      // Filter out the WhatsApp main instance (it belongs to the WhatsApp tab, not Disparos)
      const disparosOnlyInstancias = instancias.filter(inst => inst.id !== whatsappMainInstanceId);
      
      if (disparosOnlyInstancias.length > 0) {
        configs = disparosOnlyInstancias.map(inst => ({
          id: inst.id,
          base_url: inst.base_url,
          api_key: inst.api_key,
          nome: inst.nome || "Instância",
          created_at: new Date(inst.created_at || Date.now()),
        }));
      } else {
        throw new Error("Nenhuma instância de Disparos configurada. Configure em Conexões → Disparos.");
      }
    } else {
      throw new Error("Nenhuma instância de Disparos configurada. Configure em Conexões → Disparos.");
    }

    console.log(`Found ${configs.length} active Disparos instance(s) (excluded WhatsApp main: ${whatsappMainInstanceId || 'none'})`);

    // Helper to normalize phone
    const normalizePhone = (phone: string): string => {
      if (!phone) return "";
      let clean = phone.replace(/\D/g, "").replace(/@.*$/, "");
      if (clean.length === 13 && clean.startsWith("55")) {
        const ddd1 = clean.slice(2, 4);
        const ddd2 = clean.slice(4, 6);
        if (ddd1 === ddd2) {
          clean = "55" + clean.slice(4);
        }
      }
      if (clean.length === 10 || clean.length === 11) {
        clean = "55" + clean;
      }
      return clean;
    };

    const getLast8 = (phone: string): string => {
      const digits = phone.replace(/\D/g, "");
      return digits.slice(-8);
    };

    // Get ALL existing chats for this user (including soft-deleted)
    const { data: existingChats } = await supabase
      .from("disparos_chats")
      .select("*")
      .eq("user_id", user.id);

    // Build map: instancia_id:last8 -> chat (for matching existing chats)
    const existingByInstanciaLast8 = new Map<string, any>();
    // Track deleted chats by instancia_id:last8 -> deleted_at timestamp (to allow recreation per instance)
    const deletedByInstanciaLast8 = new Map<string, Date>();
    
    for (const chat of existingChats || []) {
      const last8 = getLast8(chat.normalized_number || chat.contact_number || chat.chat_id);
      const instId = chat.instancia_id || "legacy_config";
      const key = `${instId}:${last8}`;
      if (last8) {
        existingByInstanciaLast8.set(key, chat);
        // Track when this phone was deleted (use the most recent deletion per instance+phone)
        if (chat.deleted_at) {
          const existingDeleted = deletedByInstanciaLast8.get(key);
          const thisDeleted = new Date(chat.deleted_at);
          if (!existingDeleted || thisDeleted > existingDeleted) {
            deletedByInstanciaLast8.set(key, thisDeleted);
          }
        }
      }
    }

    // Fetch chats from ALL instances in parallel with timeout protection
    const FETCH_TIMEOUT_MS = 15000; // 15 seconds per instance
    
    const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    };
    
    const instancePromises = configs.map(async (config) => {
      const baseUrl = config.base_url.replace(/\/+$/, '');
      const endpoint = `${baseUrl}/chat/find`;
      
      console.log(`Fetching chats from instance ${config.nome}:`, endpoint);

      try {
        // Use a reasonable limit to prevent timeouts (UAZapi may have many old chats)
        // Sync focuses on recent conversations - old chats arrive via webhook when they have new messages
        const response = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": config.api_key,
          },
          body: JSON.stringify({
            sort: "-wa_lastMsgTimestamp",
            limit: 300, // Reduced to prevent timeouts
            offset: 0,
          }),
        }, FETCH_TIMEOUT_MS);

        if (!response.ok) {
          const text = await response.text();
          console.error(`UAZapi error for instance ${config.nome}:`, text);
          return { config, chats: [], error: text };
        }

        const raw = await response.json();
        
        // Parse response - handle different response formats
        let chats: any[] = [];
        if (Array.isArray(raw)) chats = raw;
        else if (raw && Array.isArray(raw.data)) chats = raw.data;
        else if (raw && Array.isArray(raw.result)) chats = raw.result;
        else if (raw && Array.isArray(raw.chats)) chats = raw.chats;
        else if (raw && raw.items && Array.isArray(raw.items)) chats = raw.items;

        console.log(`Found ${chats.length} chats from instance ${config.nome}`);
        return { config, chats, error: null };
      } catch (instanceError: any) {
        // Handle abort (timeout) differently
        if (instanceError.name === 'AbortError') {
          console.error(`Timeout fetching instance ${config.nome} after ${FETCH_TIMEOUT_MS}ms`);
          return { config, chats: [], error: `Timeout after ${FETCH_TIMEOUT_MS / 1000}s` };
        }
        console.error(`Error fetching instance ${config.nome}:`, instanceError);
        return { config, chats: [], error: instanceError.message };
      }
    });

    // Wait for ALL instances to complete (with individual timeouts, all will finish)
    const instanceResults = await Promise.all(instancePromises);
    
    // Log any errors but continue with successful results
    const failedInstances = instanceResults.filter(r => r.error);
    if (failedInstances.length > 0) {
      console.warn(`${failedInstances.length} instance(s) had errors:`, failedInstances.map(f => `${f.config.nome}: ${f.error}`));
    }

    // Collect all chats to upsert in a single batch
    const chatsToUpsert: any[] = [];
    const processedKeys = new Set<string>();

    // When provider doesn't send wa_lastMessageTextVote for media, derive a placeholder.
    const guessLastMessagePlaceholder = (c: any): string | null => {
      const candidates = [
        c?.wa_lastMessageTypeVote,
        c?.wa_lastMessageType,
        c?.wa_lastMessageTypeName,
        c?.wa_lastMessageTypeText,
        c?.lastMessageType,
        c?.last_message_type,
        c?.wa_lastMessageMime,
        c?.wa_lastMessageMimetype,
      ].filter(Boolean);

      const typeStr = candidates.map((v: any) => String(v).toLowerCase()).join(" ");
      if (!typeStr) return null;

      if (typeStr.includes("audio") || typeStr.includes("ptt") || typeStr.includes("voice")) return "[audio]";
      if (typeStr.includes("image") || typeStr.includes("photo") || typeStr.includes("picture")) return "[image]";
      if (typeStr.includes("video")) return "[video]";
      if (typeStr.includes("document") || typeStr.includes("file") || typeStr.includes("pdf")) return "[document]";
      if (typeStr.includes("sticker") || typeStr.includes("figurinha")) return "[sticker]";

      return null;
    };

    const getLastMessageText = (c: any): string | null => {
      const text = c?.wa_lastMessageTextVote ?? c?.wa_lastMessageText ?? c?.lastMessage ?? c?.last_message;
      const cleaned = typeof text === "string" ? text.trim() : "";
      if (cleaned) return cleaned;

      const placeholder = guessLastMessagePlaceholder(c);
      if (placeholder) return placeholder;

      // Provider sometimes omits both lastMessageText and message type for media.
      // If we have *any* last message timestamp, show a generic media placeholder instead of keeping stale text.
      if (c?.wa_lastMsgTimestamp) return "[media]";

      return null;
    };

    for (const { config, chats } of instanceResults) {
      // Instance connection date - only sync chats with messages AFTER this
      const instanceConnectedDate = config.created_at;
      console.log(`Instance ${config.nome} connected at: ${instanceConnectedDate.toISOString()}`);

      for (const chat of chats) {
        // Skip groups
        if (chat.wa_isGroup || !chat.phone) continue;

        const contactNumber = chat.phone;
        const normalizedNumber = normalizePhone(contactNumber);
        const last8 = getLast8(contactNumber);
        const chatId = chat.wa_chatid || chat.id || `${normalizedNumber}@s.whatsapp.net`;
        
        // Determine contact name: PRESERVE user-edited name, otherwise use provider name
        // Provider may return: wa_name (contact name in address book), name, pushName, wa_contactName
        const providerName = chat.wa_name || chat.name || chat.pushName || chat.wa_contactName || null;
        
        // Check if the provider name is just the phone number formatted
        const isProviderNameJustPhone = providerName && (
          providerName.replace(/\D/g, '').length >= 8 && 
          getLast8(providerName) === last8
        );
        
        // Format phone number for display when no name is available
        const formattedPhone = chat.phone || contactNumber;
        
        // Use instance-specific key for deduplication
        // CRITICAL: instancia_id must NEVER be null for Disparos chats
        // If config.id is "legacy_config" (which shouldn't happen now), skip this chat
        if (config.id === "legacy_config") {
          console.log(`[SYNC] Skipping ${contactNumber} - legacy config without instance ID`);
          continue;
        }
        const instanciaId = config.id;
        const dedupeKey = `${config.id}:${last8}`;
        
        // Get existing chat to preserve name if needed
        const existingChatForName = existingByInstanciaLast8.get(dedupeKey);
        
        // Get provider-derived name (may be used for new chats or as fallback)
        let providerDerivedName: string;
        if (providerName && !isProviderNameJustPhone && providerName.trim() !== '') {
          providerDerivedName = providerName.trim();
        } else {
          providerDerivedName = formattedPhone;
        }
        
        // Priority: existing user-edited name > provider name > phone number
        // Check if the existing name differs from provider name (user edited it)
        let contactName: string;
        if (existingChatForName?.contact_name) {
          // Check if the existing name is different from both the current provider name AND the phone number
          // If it's different, the user likely edited it - preserve it
          const existingName = existingChatForName.contact_name.trim();
          const existingIsPhone = existingName.replace(/\D/g, '').length >= 8 && 
            getLast8(existingName) === last8;
          
          if (!existingIsPhone && existingName !== providerDerivedName) {
            // User has customized the name - preserve it
            contactName = existingName;
            console.log(`[SYNC] Preserving user-edited name "${existingName}" for ${chat.phone} (provider: "${providerDerivedName}")`);
          } else {
            // Use provider name (user hasn't customized or it matches)
            contactName = providerDerivedName;
          }
        } else {
          // New chat - use provider-derived name
          contactName = providerDerivedName;
        }

        // Skip if already processed in this sync
        if (processedKeys.has(dedupeKey)) continue;
        processedKeys.add(dedupeKey);

        const existingChat = existingChatForName;

        // Prepare last message data
        const lastMsgTime = chat.wa_lastMsgTimestamp ? new Date(chat.wa_lastMsgTimestamp) : null;
        const lastMessage = getLastMessageText(chat);
        const incomingLastTime = lastMsgTime ? lastMsgTime.getTime() : 0;

        // Use last_read_at + provider baseline for unread logic (same as WhatsApp)
        const lastReadAt = existingChat?.last_read_at
          ? new Date(existingChat.last_read_at).getTime()
          : 0;

        const providerUnread = chat.wa_unreadCount || 0;
        const providerBaseline = existingChat?.provider_unread_baseline ?? 0;
        const providerDelta = Math.max(0, providerUnread - providerBaseline);

        let finalUnread = existingChat?.unread_count || 0;
        let nextProviderBaseline = providerBaseline;

        if (incomingLastTime > lastReadAt && providerDelta > 0) {
          finalUnread = providerDelta;
        } else {
          // Chat was read or no real delta: lock baseline to prevent badge from reappearing
          nextProviderBaseline = providerUnread;
        }

        // Check if this chat was previously deleted (tombstone exists)
        const { data: tombstone } = await supabase
          .from("disparos_chat_deletions")
          .select("deleted_at")
          .eq("user_id", user.id)
          .eq("instancia_id", instanciaId)
          .eq("phone_last8", last8)
          .maybeSingle();

        // If chat doesn't exist, create it (unless there's a tombstone with no new messages after deletion)
        if (!existingChat) {
          // If there's a tombstone, only create if last message is AFTER deletion
          if (tombstone) {
            const deletedAt = new Date(tombstone.deleted_at);
            if (!lastMsgTime || lastMsgTime <= deletedAt) {
              console.log(`[SYNC] Skipping ${contactNumber} - deleted at ${deletedAt.toISOString()}, last msg at ${lastMsgTime?.toISOString() || 'none'}`);
              continue;
            }
            console.log(`[SYNC] Creating chat ${contactNumber} - new message after deletion`);
          } else {
            // No tombstone and no existing chat - this is a new conversation from the phone
            // Only create if it has a message timestamp (to avoid empty chats)
            if (!lastMsgTime) {
              console.log(`[SYNC] Skipping ${contactNumber} - no last message timestamp`);
              continue;
            }
            // Also check if the message is recent (within last 30 days) to avoid old history
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            if (lastMsgTime < thirtyDaysAgo) {
              console.log(`[SYNC] Skipping ${contactNumber} - last message too old (${lastMsgTime.toISOString()})`);
              continue;
            }
            console.log(`[SYNC] Creating new chat ${contactNumber} from phone sync`);
          }
          
          // Create the new chat with history_cleared_at if it was deleted
          // CRITICAL: Never create a chat without instancia_id
          if (!instanciaId) {
            console.error(`[SYNC] CRITICAL: Attempted to create chat without instancia_id for ${contactNumber}`);
            continue;
          }
          
          const { error: insertError } = await supabase
            .from("disparos_chats")
            .insert({
              user_id: user.id,
              chat_id: chatId,
              contact_name: contactName,
              contact_number: contactNumber,
              normalized_number: normalizedNumber,
              profile_pic_url: chat.imagePreview || null,
              last_message: lastMessage || null,
              last_message_time: lastMsgTime ? lastMsgTime.toISOString() : null,
              unread_count: providerUnread,
              provider_unread_count: providerUnread,
              provider_unread_baseline: 0,
              instancia_id: instanciaId,
              instancia_nome: config.nome,
              history_cleared_at: tombstone ? tombstone.deleted_at : null,
            });
          
          if (insertError) {
            console.error(`[SYNC] Error creating chat ${contactNumber}:`, insertError);
          } else {
            // Remove tombstone after successful creation
            if (tombstone) {
              await supabase
                .from("disparos_chat_deletions")
                .delete()
                .eq("user_id", user.id)
                .eq("instancia_id", instanciaId)
                .eq("phone_last8", last8);
            }
          }
          continue;
        }

        // Normal update for existing active chats
        chatsToUpsert.push({
          user_id: user.id,
          chat_id: chatId,
          contact_name: contactName,
          contact_number: contactNumber,
          normalized_number: normalizedNumber,
          profile_pic_url: chat.imagePreview || existingChat?.profile_pic_url || null,
          last_message: lastMessage || existingChat?.last_message || null,
          last_message_time: lastMsgTime ? lastMsgTime.toISOString() : existingChat?.last_message_time || null,
          unread_count: finalUnread,
          provider_unread_count: providerUnread,
          provider_unread_baseline: nextProviderBaseline,
          instancia_id: instanciaId,
          instancia_nome: config.nome,
          updated_at: new Date().toISOString(),
        });
      }
    }

    console.log(`Total chats to upsert: ${chatsToUpsert.length}`);

    // Single batch upsert for all chats from all instances
    if (chatsToUpsert.length > 0) {
      // With hard delete, only update existing chats (never insert)
      for (const chat of chatsToUpsert) {
        const last8 = getLast8(chat.normalized_number || chat.contact_number);
        const instId = chat.instancia_id || null;
        const key = `${instId}:${last8}`;
        const existing = existingByInstanciaLast8.get(key);
        
        if (existing) {
          await supabase
            .from("disparos_chats")
            .update({
              chat_id: chat.chat_id,
              contact_name: chat.contact_name,
              normalized_number: chat.normalized_number,
              profile_pic_url: chat.profile_pic_url,
              last_message: chat.last_message,
              last_message_time: chat.last_message_time,
              unread_count: chat.unread_count,
              provider_unread_count: chat.provider_unread_count,
              provider_unread_baseline: chat.provider_unread_baseline,
              instancia_id: chat.instancia_id,
              instancia_nome: chat.instancia_nome,
              updated_at: chat.updated_at,
            })
            .eq("id", existing.id);
        }
      }
    }

    // Update last_sync_at for all active instances
    for (const config of configs) {
      if (config.id !== "legacy_config") {
        await supabase
          .from("disparos_instancias")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", config.id);
      }
    }

    // NOTE: Lead creation is now handled ONLY by webhook for new incoming messages
    // Old conversations synced here should NOT create leads
    console.log("[SYNC] Lead creation skipped - leads are created only via webhook for new messages");

    return new Response(JSON.stringify({ success: true, count: chatsToUpsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in disparos-get-chats:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
