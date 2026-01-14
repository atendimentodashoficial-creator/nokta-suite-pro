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

    // Get the chat to find its instancia_id and history_cleared_at
    const { data: chatData, error: chatError } = await supabase
      .from("disparos_chats")
      .select("instancia_id, created_at, last_message_time, history_cleared_at")
      .eq("id", db_chat_id)
      .single();

    if (chatError) {
      console.error("Error fetching chat:", chatError);
    }

    // If history_cleared_at is set, we filter out messages older than this timestamp.
    // This happens when a chat was deleted and then recreated after a new message arrived.
    const historyClearedAt = chatData?.history_cleared_at 
      ? new Date(chatData.history_cleared_at).getTime() 
      : null;

    if (historyClearedAt) {
      console.log('History cleared at:', chatData?.history_cleared_at, '- will filter old messages');
    }

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

    if (!config) {
      throw new Error("Nenhuma instância de Disparos configurada. Configure em Conexões → Disparos.");
    }

    console.log("Using config:", { base_url: config.base_url, nome: config.nome || config.instance_name });

    // Try different chat_id variations (with/without 9th digit)
    const chatIdVariations = [chat_id];
    const baseNumber = chat_id.replace("@s.whatsapp.net", "");
    
    if (baseNumber.length === 13 && baseNumber.startsWith("55")) {
      const without9 = baseNumber.slice(0, 4) + baseNumber.slice(5);
      chatIdVariations.push(`${without9}@s.whatsapp.net`);
    } else if (baseNumber.length === 12 && baseNumber.startsWith("55")) {
      const with9 = baseNumber.slice(0, 4) + "9" + baseNumber.slice(4);
      chatIdVariations.push(`${with9}@s.whatsapp.net`);
    }

    let messages: any[] = [];
    const baseUrl = String(config.base_url || "").replace(/\/+$/, "");

    for (const tryId of chatIdVariations) {
      try {
        const apiUrl = `${baseUrl}/message/find`;
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": config.api_key,
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
      .select("message_id, content, timestamp, sender_type, media_type")
      .eq("chat_id", db_chat_id);

    const existingIds = new Set(existingMessages?.map((m) => m.message_id) || []);
    
    // Build a map of existing messages by content+sender+mediaType for duplicate detection
    const existingContentMap = new Map<string, number[]>();
    existingMessages?.forEach((m) => {
      const contentStr = typeof m.content === "string" ? m.content : m.content == null ? "" : JSON.stringify(m.content);
      const mediaType = m.media_type || "text";
      // Use first 100 chars for better matching, include media_type in key
      const key = `${m.sender_type}|${mediaType}|${contentStr.substring(0, 100).trim().toLowerCase()}`;
      const ts = new Date(m.timestamp).getTime();
      if (!existingContentMap.has(key)) {
        existingContentMap.set(key, []);
      }
      existingContentMap.get(key)!.push(ts);
    });
    
    const isDuplicateContent = (senderType: string, mediaType: string, content: any, timestamp: number): boolean => {
      const contentStr = typeof content === "string" ? content : "";
      const key = `${senderType}|${mediaType}|${contentStr.substring(0, 100).trim().toLowerCase()}`;
      const existingTimestamps = existingContentMap.get(key);
      if (!existingTimestamps || existingTimestamps.length === 0) return false;
      
      // 5 minute window to catch duplicates
      const FIVE_MINUTES_MS = 300 * 1000;
      return existingTimestamps.some(existingTs => Math.abs(timestamp - existingTs) <= FIVE_MINUTES_MS);
    };

    const newMessages: any[] = [];

    const toIsoTimestamp = (raw: any): string => {
      if (!raw) return new Date().toISOString();
      if (typeof raw === "string") {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
      if (typeof raw === "number") {
        const ms = raw < 2_000_000_000 ? raw * 1000 : raw;
        return new Date(ms).toISOString();
      }
      return new Date().toISOString();
    };

    for (const msg of messages) {
      const messageId = msg.id || msg.key?.id || msg.messageId;
      if (!messageId || existingIds.has(messageId)) continue;

      const isFromMe = msg.fromMe ?? msg.key?.fromMe ?? false;
      const msgTimestamp = toIsoTimestamp(msg.messageTimestamp || msg.timestamp);
      const msgDate = new Date(msgTimestamp);

      // When history was cleared, ignore any provider messages older than the clear time.
      if (historyClearedAt && msgDate.getTime() < historyClearedAt) {
        continue;
      }
      
      // Determine media type first (needed for duplicate detection)
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
      
      let rawContent = msg.text || msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.body || "";
      if (!rawContent && typeof msg.content === "string") {
        rawContent = msg.content;
      }
      
      const senderType = isFromMe ? "agent" : "customer";
      
      // Check for duplicates using sender, media type, content, and timestamp
      if (isDuplicateContent(senderType, mediaType, rawContent, msgDate.getTime())) {
        continue;
      }

      const isDeleted = msg.status === "Deleted" || msg.deleted === true;

      const getMediaPlaceholder = (mt: string) => {
        if (mt === "audio") return "[audio]";
        if (mt === "image") return "[image]";
        if (mt === "video") return "[video]";
        if (mt === "document") return "[document]";
        return "[media]";
      };

      const textContent = msg.text || msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.body || (typeof msg.content === "string" ? msg.content : "");

      const content = isDeleted
        ? "Mensagem apagada"
        : mediaType !== "text"
          ? (String(textContent || "").trim() || getMediaPlaceholder(mediaType))
          : String(textContent || "").trim();

      const status = isFromMe
        ? msg.status === "Read" ? "read" : msg.status === "Delivered" ? "delivered" : "sent"
        : null;

      // Extract quoted message info
      const contextInfo = msg.content?.contextInfo || msg.message?.extendedTextMessage?.contextInfo || msg.contextInfo;
      let quotedMessageId: string | null = null;
      let quotedContent: string | null = null;
      let quotedSenderType: string | null = null;

      if (contextInfo?.stanzaId || contextInfo?.quotedMessage) {
        quotedMessageId = contextInfo.stanzaId || null;
        quotedContent = contextInfo.quotedMessage?.conversation || 
          contextInfo.quotedMessage?.extendedTextMessage?.text ||
          contextInfo.quotedMessage?.text ||
          contextInfo.quotedMessageText ||
          null;
        // Determine if quoted message was from the user (fromMe) or the contact
        const quotedFromMe = contextInfo.participant === undefined || contextInfo.fromMe === true;
        quotedSenderType = quotedFromMe ? 'agent' : 'customer';
      }

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
        quoted_message_id: quotedMessageId,
        quoted_content: quotedContent,
        quoted_sender_type: quotedSenderType,
      });
    }

    if (newMessages.length > 0) {
      await supabase.from("disparos_messages").upsert(newMessages, {
        onConflict: "chat_id,message_id",
        ignoreDuplicates: true,
      });

      const latest = [...newMessages].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )[0];

      const latestTime = new Date(latest.timestamp).toISOString();
      const currentLastTime = chatData?.last_message_time ? new Date(chatData.last_message_time).getTime() : 0;
      const incomingLastTime = new Date(latestTime).getTime();

      if (incomingLastTime >= currentLastTime) {
        const nowIso = new Date().toISOString();
        await supabase
          .from('disparos_chats')
          .update({
            last_message: latest.content || null,
            last_message_time: latestTime,
            updated_at: nowIso,
          })
          .eq('id', db_chat_id);
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
