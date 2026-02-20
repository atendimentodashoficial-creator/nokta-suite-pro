import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { 
      titulo, 
      descricao, 
      dataHora, 
      duracaoMinutos = 60,
      participanteEmail,
      participanteNome,
      participanteTelefone, // Phone number for immediate notifications
      procedimentoNome,
      profissionalId, // ID do profissional responsável
      skipLocalSave = false, // Se true, não salva na tabela reunioes (usado quando ambos calendários são criados)
      instanciaId, // ID da instância WhatsApp do chat (para manter consistência de número)
      instanciaNome, // Nome da instância WhatsApp do chat
    } = body;

    if (!titulo || !dataHora) {
      return new Response(
        JSON.stringify({ success: false, error: "Título e data/hora são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Google Calendar config
    const { data: config, error: configError } = await supabase
      .from("google_calendar_config")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (configError || !config || !config.access_token) {
      console.error("Config error:", configError);
      return new Response(
        JSON.stringify({ success: false, error: "Google Calendar não está conectado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = config.access_token;

    // Check if token is expired and refresh if needed
    if (config.token_expires_at && new Date(config.token_expires_at) <= new Date()) {
      console.log("Token expired, refreshing...");
      
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.client_id,
          client_secret: config.client_secret,
          refresh_token: config.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      const refreshData = await refreshResponse.json();

      if (!refreshResponse.ok) {
        console.error("Token refresh error:", refreshData);
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao renovar token do Google. Reconecte sua conta." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      accessToken = refreshData.access_token;
      const expiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

      await supabase
        .from("google_calendar_config")
        .update({
          access_token: accessToken,
          token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    // Calculate start and end times
    const startDate = new Date(dataHora);
    const endDate = new Date(startDate.getTime() + duracaoMinutos * 60 * 1000);

    // Build event object with Google Meet conference
    const eventBody: Record<string, unknown> = {
      summary: titulo,
      description: descricao || `Reunião agendada via CRM${procedimentoNome ? ` - Procedimento: ${procedimentoNome}` : ""}`,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: "America/Sao_Paulo",
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: "America/Sao_Paulo",
      },
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
    };

    // Add attendee if email provided
    if (participanteEmail) {
      eventBody.attendees = [
        {
          email: participanteEmail,
          displayName: participanteNome || participanteEmail,
        },
      ];
    }

    console.log("Creating calendar event...");

    // Create event with Google Meet
    const calendarId = config.calendar_id || "primary";
    const eventResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );

    const eventData = await eventResponse.json();

    if (!eventResponse.ok) {
      console.error("Event creation error:", eventData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: eventData.error?.message || "Erro ao criar evento no Google Calendar" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Event created successfully:", eventData.id);

    // Extract Meet link
    const meetLink = eventData.conferenceData?.entryPoints?.find(
      (ep: { entryPointType: string }) => ep.entryPointType === "video"
    )?.uri || null;

    let reuniaoId = null;

    // Save meeting to reunioes table only if not skipped
    if (!skipLocalSave) {
      const participantes = participanteEmail ? [participanteEmail] : [];
      if (participanteNome && !participantes.includes(participanteNome)) {
        participantes.unshift(participanteNome);
      }

      const { data: reuniaoData, error: reuniaoError } = await supabase
        .from("reunioes")
        .insert({
          user_id: user.id,
          google_event_id: eventData.id,
          titulo: titulo,
          data_reuniao: startDate.toISOString(),
          duracao_minutos: duracaoMinutos,
          participantes: participantes,
          meet_link: meetLink,
          status: "agendado",
          cliente_telefone: participanteTelefone || null,
          profissional_id: profissionalId || null,
        })
        .select()
        .single();

      if (reuniaoError) {
        console.error("Error saving reuniao to database:", reuniaoError);
        // Don't fail the request, the calendar event was created successfully
      } else {
        console.log("Reuniao saved to database:", reuniaoData?.id);
        reuniaoId = reuniaoData?.id;

        // Auto-move kanban card when meeting is scheduled (fire-and-forget)
        if (participanteTelefone) {
          const last8 = participanteTelefone.replace(/\D/g, '').slice(-8);
          if (last8.length === 8) {
            (async () => {
              try {
                const { data: kanbanConfig } = await supabase
                  .from("disparos_kanban_config")
                  .select("auto_move_reuniao_column_id")
                  .eq("user_id", user.id)
                  .maybeSingle();

                const targetColumnId = (kanbanConfig as any)?.auto_move_reuniao_column_id;
                if (targetColumnId) {
                  const { data: chats } = await supabase
                    .from("disparos_chats")
                    .select("id")
                    .eq("user_id", user.id)
                    .is("deleted_at", null)
                    .like("normalized_number", `%${last8}`);

                  for (const chat of chats || []) {
                    const { data: entry } = await supabase
                      .from("disparos_chat_kanban")
                      .select("id")
                      .eq("chat_id", chat.id)
                      .maybeSingle();

                    if (entry) {
                      await supabase
                        .from("disparos_chat_kanban")
                        .update({ column_id: targetColumnId, updated_at: new Date().toISOString() })
                        .eq("id", entry.id);
                    } else {
                      await supabase.from("disparos_chat_kanban").insert({
                        user_id: user.id,
                        chat_id: chat.id,
                        column_id: targetColumnId,
                      });
                    }
                  }
                  console.log("[AutoMove] Kanban moved to meeting column for", last8);
                }
              } catch (e) {
                console.error("[AutoMove] Error:", e);
              }
            })();
          }
        }

        // Trigger immediate notification in background if phone number is provided
        if (participanteTelefone && reuniaoId) {
          console.log("Triggering immediate notification in background for reuniao:", reuniaoId);
          
          // Use waitUntil to run notification in background without blocking response
          const notificationPromise = (async () => {
            try {
              const notifyResponse = await fetch(
                `${supabaseUrl}/functions/v1/enviar-aviso-reuniao-imediato`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    reuniaoId: reuniaoId,
                    userId: user.id,
                    clienteTelefone: participanteTelefone,
                    clienteNome: participanteNome,
                    instanciaId: instanciaId || null,
                    instanciaNome: instanciaNome || null,
                  }),
                }
              );
              const notifyResult = await notifyResponse.json();
              console.log("Background notification result:", notifyResult);
            } catch (notifyError) {
              console.error("Error in background notification:", notifyError);
            }
          })();
          
          // Use globalThis to access EdgeRuntime without TypeScript errors
          const runtime = (globalThis as Record<string, unknown>).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
          if (runtime?.waitUntil) {
            runtime.waitUntil(notificationPromise);
          } else {
            // Fallback: don't await, let it run in background
            notificationPromise.catch(console.error);
          }
        }
      }
    } else {
      console.log("Skipping local save as skipLocalSave=true");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        eventId: eventData.id,
        htmlLink: eventData.htmlLink,
        meetLink,
        reuniaoId,
        message: "Evento criado com sucesso!" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
