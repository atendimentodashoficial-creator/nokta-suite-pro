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

    const { chat_ids } = await req.json();

    if (!chat_ids || !Array.isArray(chat_ids) || chat_ids.length === 0) {
      throw new Error("chat_ids array is required");
    }

    console.log(`=== Deleting ${chat_ids.length} chats for user ${user.id} ===`);

    // Fetch the chats to get their chat_id (WhatsApp ID) and instancia_id
    const { data: chats, error: chatsError } = await supabase
      .from("disparos_chats")
      .select("id, chat_id, instancia_id, contact_number, normalized_number")
      .eq("user_id", user.id)
      .in("id", chat_ids);

    if (chatsError) {
      console.error("Error fetching chats:", chatsError);
      throw new Error("Error fetching chats");
    }

    if (!chats || chats.length === 0) {
      throw new Error("No chats found");
    }

    // Compute last 8 digits for each selected chat to create deletion tombstones
    const phoneLast8Set = new Set<string>();
    const instanciaIds = new Set<string>();
    for (const chat of chats) {
      const last8 = getLast8Digits(chat.contact_number || chat.normalized_number || chat.chat_id);
      if (last8 && last8.length === 8) {
        phoneLast8Set.add(last8);
      }
      if (chat.instancia_id) {
        instanciaIds.add(chat.instancia_id);
      }
    }
    const phoneLast8List = Array.from(phoneLast8Set);

    // Get normalized numbers to delete all duplicates across instances
    const normalizedNumbers = [...new Set(chats.map(c => c.normalized_number).filter(Boolean))];

    // Group chats by instancia_id for API deletion
    const chatsByInstancia = new Map<string | null, string[]>();
    for (const chat of chats) {
      const instanciaId = chat.instancia_id;
      if (!chatsByInstancia.has(instanciaId)) {
        chatsByInstancia.set(instanciaId, []);
      }
      chatsByInstancia.get(instanciaId)!.push(chat.chat_id);
    }

    // Delete from UAZapi for each instance (best-effort, with timeout)
    const withTimeout = async (ms: number, fn: (signal: AbortSignal) => Promise<void>) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ms);
      try {
        await fn(controller.signal);
      } finally {
        clearTimeout(timeout);
      }
    };

    for (const [instanciaId, chatIdList] of chatsByInstancia) {
      let config: { base_url: string; api_key: string } | null = null;

      if (instanciaId) {
        const { data: instancia } = await supabase
          .from("disparos_instancias")
          .select("base_url, api_key")
          .eq("id", instanciaId)
          .eq("user_id", user.id)
          .single();
        config = instancia;
      }

      if (config) {
        const baseUrl = config.base_url.replace(/\/+$/, "");
        
        for (const chatId of chatIdList) {
          try {
            await withTimeout(2500, async (signal) => {
              const response = await fetch(`${baseUrl}/chat/delete`, {
                method: "POST",
                signal,
                headers: {
                  "Accept": "application/json",
                  "Content-Type": "application/json",
                  "token": config!.api_key,
                },
                body: JSON.stringify({ chatId }),
              });

              if (!response.ok) {
                const text = await response.text();
                console.error(`UAZapi delete error for ${chatId}:`, text);
              }
            });
          } catch (apiError) {
            console.error(`Error deleting chat ${chatId} from UAZapi:`, apiError);
          }
        }
      }
    }

    // Get all chat DB IDs to delete messages (including duplicates by normalized_number)
    const { data: allChatsToDelete } = await supabase
      .from("disparos_chats")
      .select("id")
      .eq("user_id", user.id)
      .in("normalized_number", normalizedNumbers);

    const allChatDbIds = allChatsToDelete?.map(c => c.id) || chat_ids;

    // Delete messages from database (HARD DELETE)
    console.log(`Deleting messages for ${allChatDbIds.length} chats...`);
    const { error: messagesError } = await supabase
      .from("disparos_messages")
      .delete()
      .in("chat_id", allChatDbIds);

    if (messagesError) {
      console.error("Error deleting messages:", messagesError);
    } else {
      console.log("Messages deleted successfully");
    }

    // Delete kanban positions
    const { error: kanbanError } = await supabase
      .from("disparos_chat_kanban")
      .delete()
      .in("chat_id", allChatDbIds);

    if (kanbanError) {
      console.error("Error deleting kanban positions:", kanbanError);
    }

    // Hard delete the chats
    const { error: deleteError } = await supabase
      .from("disparos_chats")
      .delete()
      .in("normalized_number", normalizedNumbers)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting chats:", deleteError);
      throw new Error("Error deleting chats");
    }

    // Create deletion tombstones so sync/webhook never re-imports these phones
    const nowIso = new Date().toISOString();
    const instanciaIdList = Array.from(instanciaIds);

    for (const last8 of phoneLast8List) {
      // Create tombstone for each instancia (or null if no instancia)
      if (instanciaIdList.length > 0) {
        for (const instId of instanciaIdList) {
          const { error: tombstoneError } = await supabase
            .from("disparos_chat_deletions")
            .upsert(
              {
                user_id: user.id,
                phone_last8: last8,
                instancia_id: instId,
                deleted_at: nowIso,
              },
              { onConflict: "user_id,phone_last8,instancia_id" }
            );

          if (tombstoneError) {
            console.error("Error creating tombstone for", last8, instId, tombstoneError);
          }
        }
      } else {
        // No instancia - create with null
        const { error: tombstoneError } = await supabase
          .from("disparos_chat_deletions")
          .upsert(
            {
              user_id: user.id,
              phone_last8: last8,
              instancia_id: null,
              deleted_at: nowIso,
            },
            { onConflict: "user_id,phone_last8,instancia_id" }
          );

        if (tombstoneError) {
          console.error("Error creating tombstone for", last8, tombstoneError);
        }
      }
    }

    console.log(`=== Successfully deleted ${chat_ids.length} chats and created ${phoneLast8List.length} tombstone(s) ===`);

    return new Response(
      JSON.stringify({ success: true, deleted: chat_ids.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in disparos-delete-chat:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
