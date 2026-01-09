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

    // Fetch chats from ALL instances in parallel
    const instancePromises = configs.map(async (config) => {
      const baseUrl = config.base_url.replace(/\/+$/, '');
      const endpoint = `${baseUrl}/chat/find`;
      
      console.log(`Fetching chats from instance ${config.nome}:`, endpoint);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": config.api_key,
          },
          body: JSON.stringify({
            sort: "-wa_lastMsgTimestamp",
            limit: 1000000,
            offset: 0,
          }),
        });

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
        console.error(`Error fetching instance ${config.nome}:`, instanceError);
        return { config, chats: [], error: instanceError.message };
      }
    });

    // Wait for ALL instances to complete
    const instanceResults = await Promise.all(instancePromises);

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
        
        // Determine contact name: only use provider name if it's a REAL name (not just phone number)
        const providerName = chat.name || chat.pushName || null;
        const isProviderNameJustPhone = providerName && providerName.replace(/\D/g, '').length >= 8 && 
          normalizedNumber.includes(providerName.replace(/\D/g, '').slice(-8));
        
        // Use instance-specific key for deduplication (need to check existing chat first)
        const instanciaId = config.id === "legacy_config" ? null : config.id;
        const dedupeKey = `${config.id}:${last8}`;
        
        // Get existing chat to preserve name if needed
        const existingChatForName = existingByInstanciaLast8.get(dedupeKey);
        
        // Priority: real provider name > existing DB name > phone number fallback
        let contactName: string;
        if (providerName && !isProviderNameJustPhone) {
          // Provider has a real name (not just phone), use it
          contactName = providerName;
        } else if (existingChatForName?.contact_name && existingChatForName.contact_name !== contactNumber) {
          // Preserve existing name from DB (e.g., from campaign list)
          contactName = existingChatForName.contact_name;
        } else {
          // Fallback to phone number
          contactName = contactNumber;
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

        // Check if this chat (instance+phone) was deleted
        const deletedAt = deletedByInstanciaLast8.get(dedupeKey);
        const hasNewMessage = lastMsgTime && deletedAt && lastMsgTime > deletedAt;
        
        // If deleted and NO new message after deletion, skip entirely
        if (deletedAt && !hasNewMessage) {
          continue;
        }

        // IMPORTANT: If chat doesn't exist and last message is before instance connection,
        // skip it - don't create new chats for old conversations
        if (!existingChat && lastMsgTime && lastMsgTime < instanceConnectedDate) {
          console.log(`[SYNC] Skipping NEW chat ${chat.phone} - last message before instance connection (${lastMsgTime.toISOString()} < ${instanceConnectedDate.toISOString()})`);
          continue;
        }

        // If there's a new message after deletion, create a NEW chat (don't restore old one)
        // The old chat stays deleted with its old messages
        const isNewChatAfterDeletion = hasNewMessage && existingChat?.deleted_at;

        if (isNewChatAfterDeletion) {
          // Insert a brand new chat record (not updating the old deleted one)
          chatsToUpsert.push({
            user_id: user.id,
            chat_id: chatId,
            contact_name: contactName,
            contact_number: contactNumber,
            normalized_number: normalizedNumber,
            profile_pic_url: chat.imagePreview || null,
            last_message: lastMessage || null,
            last_message_time: lastMsgTime ? lastMsgTime.toISOString() : null,
            unread_count: 1,
            provider_unread_count: providerUnread,
            provider_unread_baseline: 0,
            instancia_id: instanciaId,
            instancia_nome: config.nome,
            created_at: lastMsgTime ? lastMsgTime.toISOString() : new Date().toISOString(),
            updated_at: lastMsgTime ? lastMsgTime.toISOString() : new Date().toISOString(),
            deleted_at: null,
            // Use a unique identifier to avoid conflict with deleted chat
            id: crypto.randomUUID(),
          });
        } else {
          // Normal upsert for non-deleted or existing active chats
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
    }

    console.log(`Total chats to upsert: ${chatsToUpsert.length}`);

    // Single batch upsert for all chats from all instances
    if (chatsToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from("disparos_chats")
        .upsert(chatsToUpsert, {
          onConflict: "user_id,normalized_number,instancia_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error("Error upserting chats:", upsertError);
        // Try individual upserts if batch fails (fallback for constraint issues)
        console.log("Falling back to individual upserts...");
        for (const chat of chatsToUpsert) {
          const last8 = getLast8(chat.normalized_number || chat.contact_number);
          const instId = chat.instancia_id || "legacy_config";
          const key = `${instId}:${last8}`;
          const existing = existingByInstanciaLast8.get(key);
          
          if (existing) {
          // If existing chat was deleted and this is a new one, insert instead of update
          if (existing.deleted_at && chat.id) {
            // This is a new chat after deletion, insert it
            await supabase.from("disparos_chats").insert(chat);
          } else if (!existing.deleted_at) {
            // Normal update for active chat
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
          // If existing is deleted and chat has no id, skip (don't restore)
        } else {
          await supabase.from("disparos_chats").insert(chat);
        }
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

    // === Lead creation for Disparos ===
    // Criar leads separados para Disparos (mesmo que exista lead de WhatsApp)
    // IMPORTANTE: Usar todos os chats ATIVOS (não apenas chatsToUpsert)
    try {
      // Buscar todos os chats ativos de Disparos para este usuário
      const { data: allActiveDisparosChats } = await supabase
        .from("disparos_chats")
        .select("*")
        .eq("user_id", user.id)
        .is("deleted_at", null);

      console.log(`[LEADS] Processing ${allActiveDisparosChats?.length || 0} active Disparos chats for lead creation`);

      // Buscar todos os leads do user para checar por last8 + origem
      const { data: allLeads } = await supabase
        .from("leads")
        .select("id, telefone, origem, instancia_nome, deleted_at")
        .eq("user_id", user.id);

      const today = new Date().toISOString().split("T")[0];

      // Map por chave: last8 + origem (Disparos)
      const existingDisparosLeads = new Map<string, any>();
      for (const lead of allLeads || []) {
        if ((lead.origem || "").toLowerCase() !== "disparos") continue;
        const k = getLast8(lead.telefone);
        if (k && !existingDisparosLeads.has(k)) {
          existingDisparosLeads.set(k, lead);
        }
      }

      // Processar TODOS os chats ativos de Disparos e criar/restaurar leads
      for (const chat of allActiveDisparosChats || []) {
        const phone = chat.normalized_number || (chat.contact_number ? chat.contact_number.replace(/\D/g, "") : "");
        const k = getLast8(phone);
        if (!phone || !k) continue;

        const instanciaNome = chat.instancia_nome || "Instância";
        const existingLead = existingDisparosLeads.get(k);

        if (existingLead) {
          // Se estava deletado, restaurar
          if (existingLead.deleted_at) {
            await supabase
              .from("leads")
              .update({
                deleted_at: null,
                created_at: new Date().toISOString(),
                status: "lead",
                data_contato: today,
                instancia_nome: instanciaNome,
              })
              .eq("id", existingLead.id);
            console.log(`[LEADS] Restored Disparos lead ${existingLead.id} for ${phone}`);
          }
        } else {
          // Criar novo lead de Disparos
          const { error: insertError } = await supabase
            .from("leads")
            .insert({
              user_id: user.id,
              nome: chat.contact_name || "Contato Disparos",
              telefone: phone,
              procedimento_nome: "Contato via Disparos",
              origem: "Disparos",
              status: "lead",
              origem_lead: true,
              data_contato: today,
              instancia_nome: instanciaNome,
              observacoes: chat.last_message ? `Primeira mensagem: ${chat.last_message}` : null,
            });

          if (insertError) {
            // Ignora duplicação (pode ser por variação de telefone ou race condition)
            if (!insertError.message?.includes("duplicate") && !insertError.message?.includes("unique")) {
              console.error("[LEADS] Error inserting Disparos lead:", insertError);
            }
          } else {
            console.log(`[LEADS] Created Disparos lead for ${phone} (instancia: ${instanciaNome})`);
            // Atualiza cache para não tentar criar de novo
            existingDisparosLeads.set(k, { telefone: phone, origem: "Disparos" });
          }
        }
      }
    } catch (leadError) {
      console.error("[LEADS] Error in Disparos lead creation:", leadError);
    }

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
