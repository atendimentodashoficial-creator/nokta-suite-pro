import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

interface Chat {
  id: string;
  name: string;
  number: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount?: number;
  profilePicUrl?: string;
  isGroup?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== Starting uazapi-get-chats ===");

    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");
    console.log("Authorization header present:", !!rawAuth);

    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      console.error("Missing or invalid authorization header");
      return new Response(JSON.stringify({ error: "Não autenticado. Faça login novamente e tente sincronizar." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = rawAuth.replace("Bearer ", "");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Backend não configurado corretamente (SUPABASE_URL / SUPABASE_ANON_KEY)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    // Client privilegiado (para restaurar leads soft-deleted mesmo quando RLS impede)
    const admin = SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

    console.log("Attempting to get user...");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError) {
      console.error("User error:", userError);
      throw userError;
    }

    if (!user) {
      console.error("No user found");
      throw new Error("Unauthorized");
    }

    console.log("User authenticated:", user.id);

    // Get user creation date to filter old conversations
    // Try to get from profiles first, fallback to user.created_at from auth
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("created_at")
      .eq("id", user.id)
      .maybeSingle();

    // Use profile created_at if available, otherwise use auth user created_at
    const userCreatedDate = userProfile?.created_at 
      ? new Date(userProfile.created_at) 
      : new Date(user.created_at || Date.now());
    console.log("User created at:", userCreatedDate.toISOString());

    // Get user's UAZapi configuration
    const { data: config, error: configError } = await supabase
      .from("uazapi_config")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

     if (configError || !config) {
       console.error("UAZapi config not found:", configError);
       throw new HttpError(400, "UAZapi não configurado. Configure suas credenciais primeiro.");
     }

    // Use the LATEST of updated_at (last config save) as the filter for old conversations
    // This ensures that when reconnecting an instance, old chats are not imported
    // We use updated_at because it changes every time the user saves/reconnects
    const instanceConnectedDate = config.updated_at 
      ? new Date(config.updated_at) 
      : (config.created_at ? new Date(config.created_at) : userCreatedDate);
    console.log("Instance last connected/updated at:", instanceConnectedDate.toISOString());

    console.log("Fetching chats from UAZapi...");
    console.log("Base URL:", config.base_url);
    console.log("API Key length:", config.api_key?.length || 0);

    // Normalizar base_url removendo barra final se houver
    const baseUrl = config.base_url.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/find`;
    console.log("Full endpoint:", endpoint);

    // Fetch chats from UAZapi with correct parameters
    // Use a reasonable limit to prevent timeouts - old chats arrive via webhook when they have new messages
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "token": config.api_key,
        },
        body: JSON.stringify({
          sort: "-wa_lastMsgTimestamp",
          limit: 500,
          offset: 0,
        }),
      });
    } catch (fetchError: any) {
      console.error("Fetch error:", fetchError.message);
      throw new Error(`Erro de conexão com UAZapi: ${fetchError.message}. Verifique se a URL base está correta.`);
    }

    console.log("UAZapi response status:", response.status);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("UAZapi error response:", text);
      
       if (response.status === 401 || response.status === 403) {
         throw new HttpError(401, "API Key inválida ou sem permissão. Verifique sua chave da UAZapi.");
       }
       if (response.status === 404) {
         throw new HttpError(400, "Endpoint não encontrado. Verifique se a URL base está correta (ex: https://sua-instancia.uazapi.com)");
       }
      
       throw new HttpError(502, `Erro UAZapi (${response.status}): ${text || response.statusText}`);
    }

    const raw = await response.json().catch(async () => {
      const text = await response.text();
      console.log('UAZapi non-JSON response:', text);
      return {} as any;
    });

    let chats: any[] = [];
    if (Array.isArray(raw)) chats = raw;
    else if (raw && Array.isArray(raw.data)) chats = raw.data;
    else if (raw && Array.isArray(raw.result)) chats = raw.result;
    else if (raw && Array.isArray(raw.chats)) chats = raw.chats;
    else if (raw && raw.items && Array.isArray(raw.items)) chats = raw.items;

    console.log(`Found ${chats.length} chats`);

    // Filter out groups and chats without phone numbers
    // Note: We don't filter by date here anymore - we'll check against existing chats
    // to only CREATE new chats if they have messages after instance connection
    const validChats = chats.filter((chat: any) => {
      if (chat.wa_isGroup || !chat.phone) return false;
      // Skip WhatsApp Business @lid identifiers - these are internal IDs, not real phone numbers
      if (chat.phone.includes("@lid")) return false;
      return true;
    });

    console.log(`Valid chats after filtering: ${validChats.length}`);

    const normalizePhone = (phone: string) => {
      if (!phone) return "";
      const clean = phone.replace(/[^\d]/g, "");
      
      // Se já começa com 55 e tem tamanho adequado (12-13 dígitos), não adicionar novamente
      if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) {
        return clean;
      }
      
      // Se começa com 55 mas tem tamanho estranho (ex: 555...), verificar se é 55 duplicado
      if (clean.startsWith("555") && clean.length >= 13) {
        // Provavelmente 55 duplicado, remover o primeiro 55
        const withoutFirst55 = clean.slice(2);
        if (withoutFirst55.startsWith("55") && (withoutFirst55.length === 12 || withoutFirst55.length === 13)) {
          return withoutFirst55;
        }
      }
      
      // Se tem 10 ou 11 dígitos (DDD + número), adiciona 55 na frente
      if (clean.length === 10 || clean.length === 11) {
        return "55" + clean;
      }
      
      return clean;
    };

    // Helper to get last 8 digits for matching (ignores country code, DDD, and 9th digit variations)
    const getLast8Digits = (phone: string) => {
      if (!phone) return "";
      const clean = phone.replace(/[^\d]/g, "").replace(/@.*$/, "");
      return clean.slice(-8);
    };

    // Buscar TODOS os chats existentes (ativos) para preservar unread_count, contact_name e verificar duplicatas por últimos 8 dígitos
    const { data: existingChats } = await supabase
      .from("whatsapp_chats")
      .select(
        "id, normalized_number, contact_number, chat_id, contact_name, unread_count, deleted_at, last_message_time, last_read_at, provider_unread_count, provider_unread_baseline",
      )
      .eq("user_id", user.id)
      .is("deleted_at", null);

    // Criar mapa usando últimos 8 dígitos para identificar chats existentes
    const existingByLast8 = new Map<string, any>();
    const duplicateIds: string[] = [];

    for (const chat of existingChats || []) {
      const last8 = getLast8Digits(chat.normalized_number || chat.contact_number || chat.chat_id);
      if (!last8) continue;
      
      if (existingByLast8.has(last8)) {
        // Duplicata encontrada - manter o mais recente
        const existing = existingByLast8.get(last8);
        const existingTime = existing.last_message_time ? new Date(existing.last_message_time).getTime() : 0;
        const currentTime = chat.last_message_time ? new Date(chat.last_message_time).getTime() : 0;
        
        if (currentTime > existingTime) {
          // O atual é mais recente, marcar o antigo como duplicata
          duplicateIds.push(existing.id);
          existingByLast8.set(last8, chat);
        } else {
          // O existente é mais recente, marcar o atual como duplicata
          duplicateIds.push(chat.id);
        }
      } else {
        existingByLast8.set(last8, chat);
      }
    }

    // Remover duplicatas
    if (duplicateIds.length > 0) {
      console.log(`Removing ${duplicateIds.length} duplicate chats`);
      await supabase
        .from("whatsapp_chats")
        .delete()
        .in("id", duplicateIds);
    }

    // ===== Load deletion tombstones to prevent re-importing deleted chats =====
    const { data: deletionTombstones } = await supabase
      .from("whatsapp_chat_deletions")
      .select("phone_last8, deleted_at")
      .eq("user_id", user.id);

    const tombstoneMap = new Map<string, number>();
    for (const t of deletionTombstones || []) {
      if (t.phone_last8 && t.deleted_at) {
        tombstoneMap.set(t.phone_last8, new Date(t.deleted_at).getTime());
      }
    }
    console.log(`[SYNC] Loaded ${tombstoneMap.size} deletion tombstones`);

    // Processar chats do WhatsApp - verificando por últimos 8 dígitos
    const chatsToUpsert: any[] = [];
    const processedLast8 = new Set<string>();

    // Best-effort: when provider doesn't send wa_lastMessageTextVote for media,
    // derive a placeholder from any available "type" fields.
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
      return guessLastMessagePlaceholder(c);
    };

    // Log once to help diagnose provider payload differences
    let loggedMissingLastMessage = false;

    for (const chat of validChats) {
      const normalized = normalizePhone(chat.phone);
      const last8 = getLast8Digits(chat.phone);

      if (!last8 || processedLast8.has(last8)) continue;
      processedLast8.add(last8);

      // ===== Check tombstone: skip if this phone was deleted =====
      const tombstoneDeletedAt = tombstoneMap.get(last8);
      if (tombstoneDeletedAt) {
        // Chat was deleted - skip import entirely during sync
        console.log(`[SYNC] Skipping chat ${chat.phone} because tombstone exists (deleted at ${new Date(tombstoneDeletedAt).toISOString()})`);
        continue;
      }

      const existingChat = existingByLast8.get(last8);
      
      // Determine contact name: PRESERVE user-edited name, otherwise use provider name
      // Provider may return: wa_name (contact name in address book), name (contact name), wa_contactName
      const providerName = chat.wa_name || chat.name || chat.wa_contactName || null;
      
      // Check if the provider name is just the phone number formatted
      const isProviderNameJustPhone = providerName && (
        providerName.replace(/\D/g, '').length >= 8 && 
        getLast8Digits(providerName) === last8
      );
      
      // Format phone number for display when no name is available
      const formattedPhone = chat.phone || normalized;
      
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
      if (existingChat?.contact_name) {
        // Check if the existing name is different from both the current provider name AND the phone number
        // If it's different, the user likely edited it - preserve it
        const existingName = existingChat.contact_name.trim();
        const existingIsPhone = existingName.replace(/\D/g, '').length >= 8 && 
          getLast8Digits(existingName) === last8;
        
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
      
      // Última mensagem vinda do provedor
      const lastMsgTime = chat.wa_lastMsgTimestamp ? new Date(chat.wa_lastMsgTimestamp) : null;
      const incomingLastTime = lastMsgTime ? lastMsgTime.getTime() : 0;

      const lastMessage = getLastMessageText(chat);
      if (!loggedMissingLastMessage && !lastMessage && lastMsgTime) {
        loggedMissingLastMessage = true;
        const keys = Object.keys(chat || {}).slice(0, 80);
        console.log("[SYNC][debug] last_message missing for chat with timestamp. Available keys:", keys);
      }

      // With hard delete, we don't need to check for deleted_at anymore
      // If the chat doesn't exist in the DB, it will be created fresh
      // If it exists, it will be updated
      // The chat only "comes back" when the contact sends a NEW message via webhook

      // Usar last_read_at + contador do provedor com baseline para determinar a quantidade de mensagens novas
      const lastReadAt = existingChat?.last_read_at
        ? new Date(existingChat.last_read_at).getTime()
        : 0;

      const providerUnread = chat.wa_unreadCount || 0;
      const providerBaseline = existingChat?.provider_unread_baseline ?? 0;
      const providerDelta = Math.max(0, providerUnread - providerBaseline);

      let finalUnread = 0;
      let nextProviderBaseline = providerBaseline;

      if (incomingLastTime > lastReadAt && providerDelta > 0) {
        finalUnread = providerDelta;
        console.log(
          `[SYNC] New messages for ${chat.phone}: lastMsg=${incomingLastTime}, lastRead=${lastReadAt}, providerUnread=${providerUnread}, baseline=${providerBaseline}, unread=${finalUnread}`,
        );
      } else {
        nextProviderBaseline = providerUnread;
      }

      // Importar SOMENTE chats que já existem na base (e atualizá-los).
      // Novos chats serão criados via webhook quando houver uma nova mensagem.

      // Neste ponto, o chat não está deletado (ou não existe ainda mas tem mensagem recente)
      chatsToUpsert.push({
        user_id: user.id,
        chat_id: chat.wa_chatid || chat.id,
        contact_name: contactName,
        contact_number: chat.phone,
        normalized_number: normalized,
        last_message: lastMessage,
        last_message_time: lastMsgTime ? lastMsgTime.toISOString() : null,
        unread_count: finalUnread,
        provider_unread_count: providerUnread,
        provider_unread_baseline: nextProviderBaseline,
        profile_pic_url: chat.imagePreview || null,
        updated_at: new Date().toISOString(),
        isExisting: !!existingChat, // flag to track if this is an existing chat
      });
    }

    // Note: chats are now hard deleted, so no need for chatsToInsertNew logic

    // OBS: não usamos mais upsert com onConflict aqui porque agora o índice único é parcial (deleted_at IS NULL)
    // e o Postgres não consegue resolver ON CONFLICT sem a cláusula WHERE.
    const syncedChats: any[] = [];

    for (const row of chatsToUpsert) {
      const { data: updatedRows, error: updateError } = await supabase
        .from("whatsapp_chats")
        .update({
          chat_id: row.chat_id,
          contact_name: row.contact_name,
          contact_number: row.contact_number,
          last_message: row.last_message,
          last_message_time: row.last_message_time,
          unread_count: row.unread_count,
          provider_unread_count: row.provider_unread_count,
          provider_unread_baseline: row.provider_unread_baseline,
          profile_pic_url: row.profile_pic_url,
          updated_at: row.updated_at,
        })
        .eq("user_id", user.id)
        .eq("normalized_number", row.normalized_number)
        .is("deleted_at", null)
        .select();

      if (updateError) {
        console.error("Error updating chat:", updateError);
        throw updateError;
      }

      if (updatedRows && updatedRows.length > 0) {
        syncedChats.push(updatedRows[0]);
        continue;
      }

      // Chat doesn't exist in DB - DON'T create it during sync.
      // New chats should only be created via webhook when a new message arrives.
      // This prevents importing old conversations and avoids resurrecting deleted chats.
      if (!row.isExisting) {
        console.log(`[SYNC] Skipping insert for ${row.normalized_number} - new chats only created via webhook`);
        continue;
      }

      // Fallback insert for existing chats that failed to update (shouldn't happen)

      // Fallback insert for existing chats that failed to update (shouldn't happen)
      const createdAt = row.last_message_time || new Date().toISOString();
      const { isExisting, ...rowWithoutFlag } = row;
      const { data: insertedRows, error: insertError } = await supabase
        .from("whatsapp_chats")
        .insert({
          ...rowWithoutFlag,
          created_at: createdAt,
          deleted_at: null,
        })
        .select();

      if (insertError) {
        const errAny: any = insertError;
        console.error("Error inserting chat:", insertError);

        if (errAny?.code === "23505") {
          console.warn(
            `[SYNC] Duplicate key on insert for ${row.normalized_number}. Fetching existing active row instead of failing.`,
          );

          const { data: existingRow, error: existingRowError } = await supabase
            .from("whatsapp_chats")
            .select("*")
            .eq("user_id", user.id)
            .eq("normalized_number", row.normalized_number)
            .is("deleted_at", null)
            .maybeSingle();

          if (existingRowError) {
            throw new Error(existingRowError.message);
          }

          if (existingRow) {
            syncedChats.push(existingRow);
            continue;
          }
        }

        throw new Error(errAny?.message ?? "Erro ao inserir chat");
      }

      if (insertedRows && insertedRows.length > 0) syncedChats.push(insertedRows[0]);
    }

    // Note: With hard delete, chats are fully removed and only come back via webhook when contact sends a new message

    // NOTE: Lead creation removed from sync.
    // Leads are now ONLY created via webhook when new messages arrive after connection.
    // This prevents creating leads for old conversations that were already in WhatsApp.
    console.log(`[SYNC] Lead creation skipped - leads are created only via webhook for new messages`);

    // Update last sync time
    await supabase.from("uazapi_config").update({ last_sync_at: new Date().toISOString() }).eq("user_id", user.id);

    // Update sync status
    await supabase.from("whatsapp_sync_status").upsert({
      user_id: user.id,
      last_sync_at: new Date().toISOString(),
      sync_status: "success",
      error_message: null,
    });

    console.log(`Successfully synced ${syncedChats?.length || 0} chats`);

    return new Response(
      JSON.stringify({
        success: true,
        count: syncedChats?.length || 0,
        chats: syncedChats,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
   } catch (error) {
    console.error("Error in uazapi-get-chats:", error);
    try {
      console.error("Error in uazapi-get-chats (serialized):", JSON.stringify(error));
    } catch {
      // ignore serialization errors
    }

    // Update sync status with error
     const errAny: any = error;
    const errorMessage =
      error instanceof Error
        ? error.message
        : errAny?.message
          ? String(errAny.message)
          : "Unknown error";

     const statusCode =
       error instanceof HttpError
         ? error.status
         : typeof errAny?.status === "number"
           ? errAny.status
           : 500;
    try {
      const authHeaderRetry = req.headers.get("Authorization");
      if (authHeaderRetry) {
        const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
          global: { headers: { Authorization: authHeaderRetry } },
        });

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("whatsapp_sync_status").upsert({
            user_id: user.id,
            last_sync_at: new Date().toISOString(),
            sync_status: "error",
            error_message: errorMessage,
          });
        }
      }
    } catch (e) {
      console.error("Error updating sync status:", e);
    }

     return new Response(JSON.stringify({ error: errorMessage }), {
       status: statusCode,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
