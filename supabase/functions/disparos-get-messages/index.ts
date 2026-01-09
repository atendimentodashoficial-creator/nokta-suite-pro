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

    const { chat_id, db_chat_id } = await req.json();
    if (!chat_id || !db_chat_id) {
      throw new Error("chat_id and db_chat_id are required");
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

    // Get the chat to find its instancia_id and created_at (to filter old messages)
    const { data: chatData, error: chatError } = await supabase
      .from("disparos_chats")
      .select("instancia_id, created_at, last_message_time")
      .eq("id", db_chat_id)
      .single();

    if (chatError) {
      console.error("Error fetching chat:", chatError);
    }

    // NOTE: We no longer filter messages by chat created_at since we want to show old conversations
    // The created_at filter was meant for chats recreated after deletion, but now we import all history
    console.log("Chat created_at:", chatData?.created_at);

    let config: any = null;

    // If chat has an instancia_id, use that specific instance config
    if (chatData?.instancia_id) {
      const { data: instancia } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("id", chatData.instancia_id)
        .eq("is_active", true)
        .single();
      
      if (instancia) {
        config = instancia;
      }
    }

    // Fallback: try to get any active instance for this user
    if (!config) {
      const { data: instancias } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);

      if (instancias && instancias.length > 0) {
        config = instancias[0];
      }
    }

    // No legacy fallback - Disparos tab only uses disparos_instancias
    if (!config) {
      throw new Error("Nenhuma instância de Disparos configurada. Configure em Conexões → Disparos.");
    }

    console.log("Using config:", { base_url: config.base_url, nome: config.nome || config.instance_name });

    // Try different chat_id variations (with/without 9th digit)
    const chatIdVariations = [chat_id];
    const baseNumber = chat_id.replace("@s.whatsapp.net", "");
    
    if (baseNumber.length === 13 && baseNumber.startsWith("55")) {
      // Try without 9th digit
      const without9 = baseNumber.slice(0, 4) + baseNumber.slice(5);
      chatIdVariations.push(`${without9}@s.whatsapp.net`);
    } else if (baseNumber.length === 12 && baseNumber.startsWith("55")) {
      // Try with 9th digit
      const with9 = baseNumber.slice(0, 4) + "9" + baseNumber.slice(4);
      chatIdVariations.push(`${with9}@s.whatsapp.net`);
    }

    let messages: any[] = [];

    const baseUrl = String(config.base_url || "").replace(/\/+$/, "");

    for (const tryId of chatIdVariations) {
      try {
        // UAZapi padrão (mesmo endpoint usado no WhatsApp): POST /message/find
        const apiUrl = `${baseUrl}/message/find`;
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            // UAZapi usa header token
            "token": config.api_key,
            // compat: algumas configs antigas usam apikey
            "apikey": config.api_key,
          },
          body: JSON.stringify({ chatid: tryId, limit: 100 }),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error(`UAZapi error fetching messages for ${tryId}:`, text);
          continue;
        }

        const data = await response.json();
        const found = data?.messages || data?.data || data?.result || [];
        messages = Array.isArray(found) ? found : [];

        if (messages.length > 0) break;
      } catch (e) {
        console.error(`Error fetching messages for ${tryId}:`, e);
      }
    }

    // Get existing messages to avoid duplicates
    const { data: existingMessages } = await supabase
      .from("disparos_messages")
      .select("message_id, content, timestamp, sender_type")
      .eq("chat_id", db_chat_id);

    const existingIds = new Set(existingMessages?.map((m) => m.message_id) || []);
    
    // Build a map of existing messages by content+sender for duplicate detection
    // Key: sender_type + normalized content (first 50 chars)
    // Value: array of timestamps
    const existingContentMap = new Map<string, number[]>();
    existingMessages?.forEach((m) => {
      const contentStr =
        typeof m.content === "string"
          ? m.content
          : m.content == null
            ? ""
            : JSON.stringify(m.content);
      const key = `${m.sender_type}|${contentStr.substring(0, 50).trim()}`;
      const ts = new Date(m.timestamp).getTime();
      if (!existingContentMap.has(key)) {
        existingContentMap.set(key, []);
      }
      existingContentMap.get(key)!.push(ts);
    });
    
    // Helper function to check if a message is a duplicate
    // Returns true if there's an existing message with same content+sender within 2 minutes
    const isDuplicateContent = (senderType: string, content: any, timestamp: number): boolean => {
      // Ensure content is a string before calling substring
      const contentStr = typeof content === "string" ? content : "";
      const key = `${senderType}|${contentStr.substring(0, 50).trim()}`;
      const existingTimestamps = existingContentMap.get(key);
      if (!existingTimestamps || existingTimestamps.length === 0) return false;
      
      // Check if any existing timestamp is within 2 minutes (120 seconds)
      const TWO_MINUTES_MS = 120 * 1000;
      return existingTimestamps.some(existingTs => 
        Math.abs(timestamp - existingTs) <= TWO_MINUTES_MS
      );
    };

    // Insert new messages
    const newMessages: any[] = [];

    const toIsoTimestamp = (raw: any): string => {
      if (!raw) return new Date().toISOString();
      // UAZapi geralmente vem em ISO ou timestamp ms
      if (typeof raw === "string") {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
      if (typeof raw === "number") {
        // seconds or ms
        const ms = raw < 2_000_000_000 ? raw * 1000 : raw;
        return new Date(ms).toISOString();
      }
      return new Date().toISOString();
    };

    for (const msg of messages) {
      const messageId = msg.id || msg.key?.id || msg.messageId;
      if (!messageId || existingIds.has(messageId)) continue;

      const isFromMe = msg.fromMe ?? msg.key?.fromMe ?? false;
      
      // Get message timestamp early for duplicate check
      const msgTimestamp = toIsoTimestamp(msg.messageTimestamp || msg.timestamp);
      const msgDate = new Date(msgTimestamp);
      
      // NOTE: We no longer filter messages by chat created_at - show all message history
      
      // Early content extraction for duplicate check
      // msg.content can be an object (media) or string, so handle both
      let rawContent =
        msg.text ||
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.body ||
        "";
      
      // If still empty and msg.content is a string, use it
      if (!rawContent && typeof msg.content === "string") {
        rawContent = msg.content;
      }
      
      // Check for duplicate content within 2-minute window
      const senderType = isFromMe ? "agent" : "customer";
      if (isDuplicateContent(senderType, rawContent, msgDate.getTime())) {
        const rawPreview = typeof rawContent === "string" ? rawContent : "";
        console.log(
          `Skipping duplicate message (content match within 2min): ${senderType} - "${rawPreview.substring(0, 30)}..."`,
        );
        continue;
      }

      // Media mapping (UAZapi) + fallback (baileys-like)
      let mediaType = "text";
      let mediaUrl: string | null = null;

      if (msg.messageType === "ImageMessage") {
        mediaType = "image";
        mediaUrl = msg.content?.URL || null;
      } else if (msg.messageType === "VideoMessage") {
        mediaType = "video";
        mediaUrl = msg.content?.URL || null;
      } else if (msg.messageType === "AudioMessage") {
        mediaType = "audio";
        mediaUrl = msg.content?.URL || null;
      } else if (msg.messageType === "DocumentMessage") {
        mediaType = "document";
        mediaUrl = msg.content?.URL || null;
      } else if (msg.message?.imageMessage) {
        mediaType = "image";
        mediaUrl = msg.message.imageMessage.url || null;
      } else if (msg.message?.videoMessage) {
        mediaType = "video";
        mediaUrl = msg.message.videoMessage.url || null;
      } else if (msg.message?.audioMessage) {
        mediaType = "audio";
        mediaUrl = msg.message.audioMessage.url || null;
      } else if (msg.message?.documentMessage) {
        mediaType = "document";
        mediaUrl = msg.message.documentMessage.url || null;
      }

      const isDeleted = msg.status === "Deleted" || msg.deleted === true;

      const getMediaPlaceholder = (mt: string) => {
        if (mt === "audio") return "[audio]";
        if (mt === "image") return "[image]";
        if (mt === "video") return "[video]";
        if (mt === "document") return "[document]";
        return "[media]";
      };

      const textContent =
        msg.text ||
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.body ||
        (typeof msg.content === "string" ? msg.content : "");

      const content =
        isDeleted
          ? "Mensagem apagada"
          : mediaType !== "text"
            ? (String(textContent || "").trim() || getMediaPlaceholder(mediaType))
            : String(textContent || "").trim();

      const status =
        isFromMe
          ? msg.status === "Read"
            ? "read"
            : msg.status === "Delivered"
              ? "delivered"
              : "sent"
          : null;

      // msgTimestamp already calculated above

      newMessages.push({
        chat_id: db_chat_id,
        message_id: messageId,
        content,
        sender_type: isFromMe ? "agent" : "customer",
        media_type: mediaType,
        media_url: mediaUrl,
        status,
        deleted: isDeleted,
        timestamp: msgTimestamp,
      });
    }

    if (newMessages.length > 0) {
      // Use upsert with ignoreDuplicates to prevent race condition duplicates
      await supabase.from("disparos_messages").upsert(newMessages, {
        onConflict: "chat_id,message_id",
        ignoreDuplicates: true,
      });

      // Update chat preview (last_message/last_message_time) based on the newest message we just inserted
      // NOTE: We do NOT increment unread_count here because the webhook already handles that.
      // This sync function is a fallback and should only update the preview metadata.
      const latest = [...newMessages].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )[0];

      const latestTime = new Date(latest.timestamp).toISOString();
      const currentLastTime = chatData?.last_message_time ? new Date(chatData.last_message_time).getTime() : 0;
      const incomingLastTime = new Date(latestTime).getTime();

      if (incomingLastTime >= currentLastTime) {
        const nowIso = new Date().toISOString();
        // Only update preview metadata, never increment unread (webhook handles that)
        await supabase
          .from('disparos_chats')
          .update({
            last_message: latest.content || null,
            last_message_time: latestTime,
            updated_at: nowIso,
          })
          .eq('id', db_chat_id);
      }
    } else {
      // No new inserts, but the chat preview may be stale (legacy rows where media content used to be stored as object).
      // Recompute latest message from DB and update preview WITHOUT incrementing unread.
      const { data: latestDb } = await supabase
        .from('disparos_messages')
        .select('content, timestamp')
        .eq('chat_id', db_chat_id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestDb?.timestamp) {
        const latestTime = new Date(latestDb.timestamp).toISOString();
        const currentLastTime = chatData?.last_message_time ? new Date(chatData.last_message_time).getTime() : 0;
        const incomingLastTime = new Date(latestTime).getTime();

        if (incomingLastTime > currentLastTime) {
          const nowIso = new Date().toISOString();
          await supabase
            .from('disparos_chats')
            .update({
              last_message: (typeof latestDb.content === 'string' ? latestDb.content : JSON.stringify(latestDb.content)) || null,
              last_message_time: latestTime,
              updated_at: nowIso,
            })
            .eq('id', db_chat_id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, count: newMessages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in disparos-get-messages:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});