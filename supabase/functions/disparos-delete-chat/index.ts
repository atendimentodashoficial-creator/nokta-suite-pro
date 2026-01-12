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
      .select("id, chat_id, instancia_id, normalized_number")
      .eq("user_id", user.id)
      .in("id", chat_ids);

    if (chatsError) {
      console.error("Error fetching chats:", chatsError);
      throw new Error("Error fetching chats");
    }

    if (!chats || chats.length === 0) {
      throw new Error("No chats found");
    }

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

    // Delete from UAZapi for each instance
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
      // No legacy fallback - Disparos tab only uses disparos_instancias

      if (config) {
        const baseUrl = config.base_url.replace(/\/+$/, "");
        
        // Delete each chat from UAZapi
        for (const chatId of chatIdList) {
          try {
            console.log(`Deleting chat ${chatId} from UAZapi...`);
            const response = await fetch(`${baseUrl}/chat/delete`, {
              method: "POST",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "token": config.api_key,
              },
              body: JSON.stringify({ chatId }),
            });

            if (!response.ok) {
              const text = await response.text();
              console.error(`UAZapi delete error for ${chatId}:`, text);
              // Continue with other chats even if one fails
            } else {
              console.log(`Chat ${chatId} deleted from UAZapi successfully`);
            }
          } catch (apiError) {
            console.error(`Error deleting chat ${chatId} from UAZapi:`, apiError);
            // Continue with other chats
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

    // Delete messages from database
    console.log(`Deleting messages for ${allChatDbIds.length} chats...`);
    const { error: messagesError } = await supabase
      .from("disparos_messages")
      .delete()
      .in("chat_id", allChatDbIds);

    if (messagesError) {
      console.error("Error deleting messages:", messagesError);
      // Continue with chat deletion even if message deletion fails
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

    // Hard delete the chats (permanent deletion like WhatsApp)
    const { error: deleteError } = await supabase
      .from("disparos_chats")
      .delete()
      .in("normalized_number", normalizedNumbers)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting chats:", deleteError);
      throw new Error("Error deleting chats");
    }

    console.log(`=== Successfully deleted ${chat_ids.length} chats ===`);

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
