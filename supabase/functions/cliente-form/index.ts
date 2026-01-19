import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  action: z.enum(["get", "submit"]),
  clienteId: z.string().min(1),
  nome: z.string().optional(),
  email: z.string().optional(),
  genero: z.string().optional(),
  data_nascimento: z.string().optional(),
  cep: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  endereco: z.string().optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Dados inválidos", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, clienteId, nome, email, genero, data_nascimento, cep, cidade, estado, endereco } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Configuração do servidor ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Load cliente (lead)
    const { data: cliente, error: clienteError } = await admin
      .from("leads")
      .select("id, user_id, nome, email, genero, data_nascimento, cep, cidade, estado, endereco")
      .eq("id", clienteId)
      .maybeSingle();

    if (clienteError || !cliente) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get") {
      return new Response(
        JSON.stringify({
          success: true,
          cliente: cliente,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action === "submit"
    // Basic normalization (keep nulls to avoid overwriting with empty strings)
    const leadUpdate = {
      nome: nome?.trim() ? nome.trim() : undefined,
      email: email?.trim() ? email.trim().toLowerCase() : null,
      genero: genero?.trim() ? genero.trim() : null,
      data_nascimento: data_nascimento?.trim() ? data_nascimento.trim() : null,
      cep: cep?.trim() ? cep.trim() : null,
      cidade: cidade?.trim() ? cidade.trim() : null,
      estado: estado?.trim() ? estado.trim() : null,
      endereco: endereco?.trim() ? endereco.trim() : null,
    };
    
    // Remove undefined values to avoid overwriting nome with null if not provided
    Object.keys(leadUpdate).forEach(key => {
      if (leadUpdate[key as keyof typeof leadUpdate] === undefined) {
        delete leadUpdate[key as keyof typeof leadUpdate];
      }
    });

    const { error: updateError } = await admin
      .from("leads")
      .update(leadUpdate)
      .eq("id", clienteId);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message || "Erro ao salvar cliente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[cliente-form]", error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
