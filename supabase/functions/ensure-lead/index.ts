import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.77.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");

const last8 = (phone: string) => {
  const d = onlyDigits(phone);
  return d.length >= 8 ? d.slice(-8) : d;
};

// Normalização simples focada em BR (mantém compatibilidade com o que já existe no banco)
const normalizeForStore = (phone: string) => {
  const d = onlyDigits(phone);
  // Se vier com 55 e tiver 12 dígitos (55 + DDD + 8), adiciona 9 após DDD
  if (d.startsWith("55") && d.length === 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    return `55${ddd}9${rest}`;
  }
  // Se vier sem 55 e tiver 10 dígitos (DDD + 8), adiciona 55 e 9
  if (!d.startsWith("55") && d.length === 10) {
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    return `55${ddd}9${rest}`;
  }
  // Se vier sem 55 e tiver 11 dígitos (DDD + 9 + 8), adiciona 55
  if (!d.startsWith("55") && d.length === 11) {
    return `55${d}`;
  }
  return d;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";

    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const telefoneRaw = body?.telefone;
    const nome = (body?.nome || "").toString().trim();
    const email = body?.email ?? null;
    const status = body?.status ?? "cliente";
    const ensureCliente = !!body?.ensure_cliente;
    const origem_tipo = body?.origem_tipo ?? null;
    const origem_lead = body?.origem_lead ?? null;
    const origem = body?.origem ?? null;
    const instancia_nome = body?.instancia_nome ?? null;

    if (!telefoneRaw || !nome) {
      return new Response(JSON.stringify({ error: "telefone e nome são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const wantedLast8 = last8(telefoneRaw);
    const telefone = normalizeForStore(telefoneRaw);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const ensureClienteRecord = async (leadsList: any[]): Promise<string | null> => {
      // Busca cliente ativo (status=cliente, não deletado) - sem origem específica (cliente manual)
      const existingClienteAtivo = (leadsList || []).find((l: any) => {
        const leadLast8 = last8(l.telefone);
        const leadOrigem = (l.origem || "").toLowerCase();
        return leadLast8 === wantedLast8 && l.status === "cliente" && !l.deleted_at && !leadOrigem;
      });

      if (existingClienteAtivo?.id) {
        await admin
          .from("leads")
          .update({ nome, email })
          .eq("id", existingClienteAtivo.id)
          .eq("user_id", userId);
        return existingClienteAtivo.id;
      }

      // Busca QUALQUER registro ativo sem origem (pode ser lead) - para evitar constraint conflict
      const existingAtivoSemOrigem = (leadsList || []).find((l: any) => {
        const leadLast8 = last8(l.telefone);
        const leadOrigem = (l.origem || "").toLowerCase();
        return leadLast8 === wantedLast8 && !l.deleted_at && !leadOrigem;
      });

      if (existingAtivoSemOrigem?.id) {
        // Converter para cliente se necessário
        const updateData: Record<string, any> = { nome, email, status: "cliente" };
        if (origem_tipo) updateData.origem_tipo = origem_tipo;
        await admin
          .from("leads")
          .update(updateData)
          .eq("id", existingAtivoSemOrigem.id)
          .eq("user_id", userId);
        return existingAtivoSemOrigem.id;
      }

      // Busca cliente deletado (status=cliente, deletado, sem origem específica)
      const existingClienteDeletado = (leadsList || []).find((l: any) => {
        const leadLast8 = last8(l.telefone);
        const leadOrigem = (l.origem || "").toLowerCase();
        return leadLast8 === wantedLast8 && l.deleted_at && !leadOrigem;
      });

      if (existingClienteDeletado?.id) {
        const restoreData: Record<string, any> = { deleted_at: null, nome, email, status: "cliente" };
        if (origem_tipo) restoreData.origem_tipo = origem_tipo;
        
        const { error: restoreError } = await admin
          .from("leads")
          .update(restoreData)
          .eq("id", existingClienteDeletado.id)
          .eq("user_id", userId);

        if (!restoreError) {
          return existingClienteDeletado.id;
        }
        console.error("[ensure-lead] ensureClienteRecord restore error", restoreError);
      }

      // Criar novo registro como cliente SEM origem
      const { data: createdCliente, error: insertError } = await admin
        .from("leads")
        .insert({
          user_id: userId,
          nome,
          telefone,
          email,
          procedimento_nome: "Agendamento",
          status: "cliente",
          origem: null,
          origem_tipo: origem_tipo || "Manual",
        })
        .select("id")
        .single();

      if (insertError) {
        console.log("[ensure-lead] ensureClienteRecord insert conflict, searching fresh...", insertError.message);
        
        // Fresh query - busca QUALQUER registro com telefone matching (sem filtrar status)
        const { data: freshRecords } = await admin
          .from("leads")
          .select("id, telefone, status, origem")
          .eq("user_id", userId)
          .is("deleted_at", null);

        const freshMatch = (freshRecords || []).find((l: any) => {
          const leadOrigem = (l.origem || "").toLowerCase();
          return last8(l.telefone) === wantedLast8 && !leadOrigem;
        });
        
        if (freshMatch?.id) {
          // Converter para cliente e atualizar dados
          await admin.from("leads").update({ nome, email, status: "cliente" }).eq("id", freshMatch.id);
          return freshMatch.id;
        }
        
        return null;
      }

      return createdCliente?.id || null;
    };

    // Busca leads do usuário filtrando pelo telefone (últimos 8 dígitos) para evitar limite de 1000 rows
    const phonePattern = `%${wantedLast8}`;
    const { data: leads, error: leadsError } = await admin
      .from("leads")
      .select("id, user_id, telefone, origem, status, deleted_at")
      .eq("user_id", userId)
      .like("telefone", phonePattern);

    if (leadsError) {
      return new Response(JSON.stringify({ error: leadsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ensure-lead] Leads matching phone: ${(leads || []).length}, wantedLast8: ${wantedLast8}, telefone: ${telefone}, status: ${status}, origem: ${origem}`);

    // Busca cliente existente (status = "cliente") por telefone
    const existingCliente = (leads || []).find((l) => {
      const leadLast8 = last8(l.telefone);
      return leadLast8 === wantedLast8 && !l.deleted_at && l.status === "cliente";
    });

    // Busca qualquer lead ativo por telefone
    const existingByPhone = (leads || []).find((l) => {
      const leadLast8 = last8(l.telefone);
      return leadLast8 === wantedLast8 && !l.deleted_at;
    });

    console.log(`[ensure-lead] existingCliente: ${existingCliente?.id || 'none'}, existingByPhone: ${existingByPhone?.id || 'none'} (origem: ${existingByPhone?.origem || 'null'})`);

    // Se o status desejado é "cliente" (agendamento), garantir que existe um cliente
    if (status === "cliente") {
      // Se já existe um cliente, atualizar e retornar
      if (existingCliente?.id) {
        // Cliente já existe e está ativo/visível: atualizar apenas nome/email.
        // NÃO atualizar origem_tipo, para manter a primeira origem em que o card foi criado.
        await admin
          .from("leads")
          .update({ nome, email })
          .eq("id", existingCliente.id)
          .eq("user_id", userId);

        return new Response(JSON.stringify({ id: existingCliente.id, reused: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Se é lead de WhatsApp/Disparos mas não é cliente
      if (existingByPhone?.id) {
        const existingOrigem = (existingByPhone.origem || "").toLowerCase();
        
        if (existingOrigem === "whatsapp" || existingOrigem === "disparos") {
          // First check if there's already a null-origin record for this phone
          const existingNullOrigem = (leads || []).find((l: any) => {
            const leadLast8 = last8(l.telefone);
            const leadOrigem = (l.origem || "").toLowerCase();
            return leadLast8 === wantedLast8 && !l.deleted_at && !leadOrigem;
          });

          if (existingNullOrigem?.id) {
            await admin
              .from("leads")
              .update({ nome, email, status: "cliente", origem_tipo: origem_tipo || existingOrigem.charAt(0).toUpperCase() + existingOrigem.slice(1) })
              .eq("id", existingNullOrigem.id)
              .eq("user_id", userId);
            return new Response(JSON.stringify({ id: existingNullOrigem.id, reused: true }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Check for deleted null-origin records to restore
          const deletedNullOrigem = (leads || []).find((l: any) => {
            const leadLast8 = last8(l.telefone);
            const leadOrigem = (l.origem || "").toLowerCase();
            return leadLast8 === wantedLast8 && l.deleted_at && !leadOrigem;
          });

          if (deletedNullOrigem?.id) {
            await admin
              .from("leads")
              .update({ deleted_at: null, nome, email, status: "cliente", origem_tipo: origem_tipo || existingOrigem.charAt(0).toUpperCase() + existingOrigem.slice(1) })
              .eq("id", deletedNullOrigem.id)
              .eq("user_id", userId);
            return new Response(JSON.stringify({ id: deletedNullOrigem.id, reused: true }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // No null-origin record exists, safe to create new
          const { data: created, error: insertError } = await admin
            .from("leads")
            .insert({
              user_id: userId,
              nome,
              telefone,
              email,
              procedimento_nome: "Agendamento",
              status: "cliente",
              origem: null,
              origem_tipo: origem_tipo || existingOrigem.charAt(0).toUpperCase() + existingOrigem.slice(1),
            })
            .select("id")
            .single();

          if (insertError) {
            console.log("[ensure-lead] Insert conflict, fresh search...", insertError.message);
            const { data: freshAll } = await admin
              .from("leads")
              .select("id, telefone, status, origem, deleted_at")
              .eq("user_id", userId)
              .is("deleted_at", null);

            const freshMatch = (freshAll || []).find((l: any) => last8(l.telefone) === wantedLast8 && !(l.origem || "").toLowerCase());
            if (freshMatch?.id) {
              await admin.from("leads").update({ nome, email, status: "cliente" }).eq("id", freshMatch.id);
              return new Response(JSON.stringify({ id: freshMatch.id, reused: true }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            return new Response(JSON.stringify({ error: insertError.message }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ id: created.id, created: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Se é lead sem origem, converter para cliente
        const updates: Record<string, any> = {
          nome,
          email,
          status: "cliente",
        };
        if (origem_tipo !== null) updates.origem_tipo = origem_tipo;
        
        const { error: updateError } = await admin
          .from("leads")
          .update(updates)
          .eq("id", existingByPhone.id)
          .eq("user_id", userId);

        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ id: existingByPhone.id, reused: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Não existe nenhum registro, criar como cliente
      const { data: created, error: insertError } = await admin
        .from("leads")
        .insert({
          user_id: userId,
          nome,
          telefone,
          email,
          procedimento_nome: "Agendamento",
          status: "cliente",
          origem_tipo: origem_tipo || "Manual",
        })
        .select("id")
        .single();

      if (insertError) {
        console.log("[ensure-lead] Insert conflict for new cliente, searching existing...", insertError.message);
        const { data: freshClientes } = await admin
          .from("leads")
          .select("id, telefone")
          .eq("user_id", userId)
          .eq("status", "cliente")
          .is("deleted_at", null);

        const freshMatch = (freshClientes || []).find((l: any) => last8(l.telefone) === wantedLast8);
        if (freshMatch?.id) {
          await admin.from("leads").update({ nome, email }).eq("id", freshMatch.id);
          return new Response(JSON.stringify({ id: freshMatch.id, reused: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ id: created.id, created: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Para leads (WhatsApp/Disparos), manter lógica existente
    if (existingByPhone?.id) {
      const updates: Record<string, any> = { nome, email };
      
      const { error: updateError } = await admin
        .from("leads")
        .update(updates)
        .eq("id", existingByPhone.id)
        .eq("user_id", userId);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cliente_id = ensureCliente ? await ensureClienteRecord(leads || []) : null;

      return new Response(JSON.stringify({ id: existingByPhone.id, reused: true, ...(cliente_id ? { cliente_id } : {}) }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica se há algum deletado com o mesmo telefone para restaurar
    const deletedByPhone = (leads || []).find((l) => {
      const leadLast8 = last8(l.telefone);
      return leadLast8 === wantedLast8 && l.deleted_at;
    });

    if (deletedByPhone?.id) {
      // Restaura o registro deletado e atualiza created_at para "recomeçar" o lead
      const { error: updateError } = await admin
        .from("leads")
        .update({
          deleted_at: null,
          created_at: new Date().toISOString(),
          nome,
          email,
          status,
          ...(origem_tipo !== null ? { origem_tipo } : {}),
          ...(origem_lead !== null ? { origem_lead } : {}),
        })
        .eq("id", deletedByPhone.id)
        .eq("user_id", userId);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cliente_id = ensureCliente ? await ensureClienteRecord(leads || []) : null;

      return new Response(JSON.stringify({ id: deletedByPhone.id, reused: true, ...(cliente_id ? { cliente_id } : {}) }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Não achou por last8 + origem -> cria novo (telefone já normalizado)
    const { data: created, error: insertError } = await admin
      .from("leads")
      .insert({
        user_id: userId,
        nome,
        telefone,
        email,
        procedimento_nome: "",
        status,
        ...(origem !== null ? { origem } : {}),
        ...(origem_tipo !== null ? { origem_tipo } : {}),
        ...(origem_lead !== null ? { origem_lead } : {}),
        ...(instancia_nome !== null ? { instancia_nome } : {}),
      })
      .select("id")
      .single();

    if (insertError) {
      // Se for duplicidade (variação de telefone), tenta buscar de novo por last8 e retornar
      const { data: leads2 } = await admin
        .from("leads")
        .select("id, telefone, deleted_at")
        .eq("user_id", userId);

      const match2 = (leads2 || []).find((l) => {
        const leadLast8 = last8(l.telefone);
        return leadLast8 === wantedLast8 && !l.deleted_at;
      });

      if (match2?.id) {
        const cliente_id = ensureCliente ? await ensureClienteRecord(leads || []) : null;

        return new Response(JSON.stringify({ id: match2.id, reused: true, ...(cliente_id ? { cliente_id } : {}) }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
        const cliente_id = ensureCliente ? await ensureClienteRecord(leads || []) : null;

    return new Response(JSON.stringify({ id: created.id, created: true, ...(cliente_id ? { cliente_id } : {}) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ensure-lead] error", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
