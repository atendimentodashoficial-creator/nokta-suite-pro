import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to get last 8 digits for matching
function getLast8Digits(phone: string): string {
  if (!phone) return "";
  const clean = phone.replace(/[^\d]/g, "").replace(/@.*$/, "");
  return clean.slice(-8);
}

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

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const body = await req.json();
    
    // Support both single chat_id and array of chat_ids
    let chatIdsToProcess: string[] = [];
    if (body.chat_ids && Array.isArray(body.chat_ids)) {
      chatIdsToProcess = body.chat_ids;
    } else if (body.chat_id) {
      chatIdsToProcess = [body.chat_id];
    }

    if (chatIdsToProcess.length === 0) {
      throw new Error("chat_id or chat_ids is required");
    }

    console.log(`=== Deleting ${chatIdsToProcess.length} chat(s) for user ${user.id} ===`);

    // Fetch the chats to get their chat_id (WhatsApp ID) and normalized_number
    const { data: chats, error: chatsError } = await supabase
      .from("whatsapp_chats")
      .select("id, chat_id, contact_number, normalized_number")
      .eq("user_id", user.id)
      .in("id", chatIdsToProcess);

    if (chatsError) {
      console.error("Error fetching chats:", chatsError);
      throw new Error("Error fetching chats");
    }

    if (!chats || chats.length === 0) {
      throw new Error("No chats found");
    }

    // Get normalized numbers for deleting all related records
    const normalizedNumbers = [...new Set(chats.map(c => c.normalized_number).filter(Boolean))];

    // Compute last 8 digits for each chat to create deletion tombstones
    const phoneLast8Set = new Set<string>();
    for (const chat of chats) {
      const last8 = getLast8Digits(chat.contact_number || chat.normalized_number || chat.chat_id);
      if (last8 && last8.length === 8) {
        phoneLast8Set.add(last8);
      }
    }
    const phoneLast8List = Array.from(phoneLast8Set);

    // Get UAZapi config for this user
    const { data: config } = await supabase
      .from("uazapi_config")
      .select("base_url, api_key")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (config) {
      const baseUrl = config.base_url.replace(/\/+$/, "");

      // Best-effort deletion on provider side. Keep this fast to avoid client timeouts.
      const withTimeout = async (ms: number, fn: (signal: AbortSignal) => Promise<void>) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
          await fn(controller.signal);
        } finally {
          clearTimeout(timeout);
        }
      };

      const CONCURRENCY = 8;
      const queue = [...chats];

      const worker = async () => {
        while (queue.length) {
          const chat = queue.shift();
          if (!chat) break;

          try {
            await withTimeout(2500, async (signal) => {
              const response = await fetch(`${baseUrl}/chat/delete`, {
                method: "POST",
                signal,
                headers: {
                  "Accept": "application/json",
                  "Content-Type": "application/json",
                  "token": config.api_key,
                },
                body: JSON.stringify({ chatId: chat.chat_id }),
              });

              if (!response.ok) {
                const text = await response.text();
                console.error(`UAZapi delete error for ${chat.chat_id}:`, text);
              }
            });
          } catch (apiError) {
            // Don't fail the whole delete if provider delete fails/timeouts
            console.error(`Error deleting chat ${chat.chat_id} from UAZapi:`, apiError);
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    }

    // Get all chat DB IDs to delete (including any with same normalized_number)
    const { data: allChatsToDelete } = await supabase
      .from("whatsapp_chats")
      .select("id")
      .eq("user_id", user.id)
      .in("normalized_number", normalizedNumbers);

    const allChatDbIds = allChatsToDelete?.map(c => c.id) || chatIdsToProcess;

    // Delete messages from database (HARD DELETE)
    console.log(`Deleting messages for ${allChatDbIds.length} chat(s)...`);
    const { error: messagesError } = await supabase
      .from("whatsapp_messages")
      .delete()
      .in("chat_id", allChatDbIds);

    if (messagesError) {
      console.error("Error deleting messages:", messagesError);
    } else {
      console.log("Messages deleted successfully");
    }

    // Delete kanban positions
    const { error: kanbanError } = await supabase
      .from("whatsapp_chat_kanban")
      .delete()
      .in("chat_id", allChatDbIds);

    if (kanbanError) {
      console.error("Error deleting kanban positions:", kanbanError);
    }

    // HARD DELETE the chat rows from database
    const { error: deleteError } = await supabase
      .from("whatsapp_chats")
      .delete()
      .in("normalized_number", normalizedNumbers)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting chats:", deleteError);
      throw new Error("Error deleting chats");
    }

    // Create deletion tombstones so sync/webhook never re-imports these phones
    const nowIso = new Date().toISOString();

    for (const last8 of phoneLast8List) {
      const { error: tombstoneError } = await supabase
        .from("whatsapp_chat_deletions")
        .upsert(
          {
            user_id: user.id,
            phone_last8: last8,
            deleted_at: nowIso,
          },
          { onConflict: "user_id,phone_last8" }
        );

      if (tombstoneError) {
        console.error("Error creating tombstone for", last8, tombstoneError);
      }
    }

    console.log(`=== Successfully deleted ${chatIdsToProcess.length} chat(s) and created ${phoneLast8List.length} tombstone(s) ===`);

    return new Response(
      JSON.stringify({ success: true, deleted: chatIdsToProcess.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in whatsapp-delete-chat:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
