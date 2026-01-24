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

    const { chat_id, db_chat_id, message, type = "text", caption } = await req.json();
    if (!chat_id || !message) {
      throw new Error("chat_id and message are required");
    }

    console.log("Sending message:", { chat_id, type, hasCaption: !!caption });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Get the chat to find which instance it belongs to
    // CRITICAL: We must use the instance that the chat is associated with
    // Never fall back to a different instance - this causes mismatches in the UI
    let config: any = null;
    
    if (db_chat_id) {
      const { data: chatData } = await supabase
        .from("disparos_chats")
        .select("instancia_id, instancia_nome")
        .eq("id", db_chat_id)
        .single();

      if (chatData?.instancia_id) {
        // Get the specific instance config
        const { data: instancia } = await supabase
          .from("disparos_instancias")
          .select("*")
          .eq("id", chatData.instancia_id)
          .eq("is_active", true)
          .single();

        if (instancia) {
          config = instancia;
        } else {
          // Instance exists but is not active or was deleted
          throw new Error(`A instância "${chatData.instancia_nome || 'associada'}" não está ativa. Reconecte-a em Conexões → Disparos.`);
        }
      } else {
        // Chat has no instancia_id - this is a data integrity issue
        console.error(`Chat ${db_chat_id} has no instancia_id - data integrity issue`);
        throw new Error("Este chat não está vinculado a nenhuma instância. Abra a conversa pela lista de chats correta.");
      }
    }

    // No fallback allowed - we must always use the chat's instance
    if (!config) {
      throw new Error("Nenhuma instância de Disparos configurada. Configure em Conexões → Disparos.");
    }

    const baseUrl = config.base_url.replace(/\/+$/, "");
    const phoneNumber = chat_id.replace("@s.whatsapp.net", "");

    let apiUrl: string;
    let requestBody: Record<string, any>;
    let mediaType: string = "text";

    // No app do WhatsApp, o envio de mídia usa /send/media com payload unificado.
    // Vamos seguir a mesma lógica aqui.
    if (type === "text") {
      apiUrl = `${baseUrl}/send/text`;
      mediaType = "text";
      requestBody = { number: phoneNumber, text: message };
    } else {
      const uazType = type === "audio" ? "ptt" : type; // padroniza
      if (!['image', 'ptt', 'video', 'document'].includes(uazType)) {
        throw new Error("Invalid type. Must be: text, image, ptt, video, or document");
      }

      apiUrl = `${baseUrl}/send/media`;
      mediaType = uazType === 'ptt' ? 'audio' : uazType;

      requestBody = {
        number: phoneNumber,
        type: uazType,
        file: message,
      };
      if (caption && (uazType === 'image' || uazType === 'video' || uazType === 'document')) {
        requestBody.caption = caption;
      }
    }

    console.log("Calling UAZapi:", { apiUrl, type: mediaType });

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": config.api_key,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("UAZapi send error:", response.status, text);
      
      if (response.status === 502 || response.status === 503) {
        throw new Error("Serviço temporariamente indisponível. Tente novamente ou verifique se a instância está conectada.");
      }
      
      throw new Error(`Erro ao enviar mensagem: ${response.status} - ${text}`);
    }

    const result = await response.json();
    console.log("UAZapi response:", result);
    
    const messageId = result.key?.id || result.id || `msg-${Date.now()}`;

    // Determine content to save based on type
    const contentToSave = type === "text" ? message : (caption || `[${mediaType}]`);
    const mediaUrlToSave = type === "text" ? null : message;

    // Save message to database
    const { data: savedMessage, error: saveError } = await supabase
      .from("disparos_messages")
      .insert({
        chat_id: db_chat_id,
        message_id: messageId,
        content: contentToSave,
        sender_type: "agent",
        media_type: mediaType,
        media_url: mediaUrlToSave,
        status: "sent",
        timestamp: new Date().toISOString(),
        admin_id: user.id,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving message:", saveError);
    }

    // Update chat's last message
    await supabase
      .from("disparos_chats")
      .update({
        last_message: contentToSave,
        last_message_time: new Date().toISOString(),
      })
      .eq("id", db_chat_id);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: messageId,
        id: savedMessage?.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in disparos-send-message:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
