import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;
    const { reuniaoId } = await req.json();

    if (!reuniaoId) {
      return new Response(JSON.stringify({ error: "reuniaoId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing reuniao ${reuniaoId} for user ${userId}`);

    // 1. Fetch the meeting with transcription
    const { data: reuniao, error: reuniaoError } = await supabase
      .from("reunioes")
      .select("id, titulo, transcricao, resumo_ia")
      .eq("id", reuniaoId)
      .single();

    if (reuniaoError || !reuniao) {
      console.error("Error fetching reuniao:", reuniaoError);
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reuniao.transcricao) {
      return new Response(JSON.stringify({ error: "Meeting has no transcription" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch active template fields
    const { data: templateCampos, error: camposError } = await supabase
      .from("reuniao_template_campos")
      .select("id, nome, descricao, ordem")
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    if (camposError) {
      console.error("Error fetching template campos:", camposError);
      return new Response(JSON.stringify({ error: "Failed to fetch template" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!templateCampos || templateCampos.length === 0) {
      return new Response(JSON.stringify({ error: "No template fields configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${templateCampos.length} template fields`);

    // 3. Build the prompt for AI
    const fieldsDescription = templateCampos
      .map((c, i) => `${i + 1}. "${c.nome}"${c.descricao ? `: ${c.descricao}` : ""}`)
      .join("\n");

    const systemPrompt = `Você é um assistente que analisa transcrições de reuniões e extrai informações estruturadas.
Analise a transcrição fornecida e preencha os campos solicitados de forma concisa e objetiva.
Responda em português brasileiro.
Se não houver informação relevante para um campo, responda "Não identificado na transcrição".`;

    const userPrompt = `Transcrição da reunião "${reuniao.titulo}":

${reuniao.transcricao}

---

Por favor, preencha os seguintes campos baseado na transcrição acima:

${fieldsDescription}`;

    // 4. Get OpenAI API key from user's configuration using service role
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: openaiConfig, error: configError } = await serviceSupabase
      .from("openai_config")
      .select("api_key")
      .eq("user_id", userId)
      .single();

    console.log("OpenAI config lookup for user:", userId, "result:", openaiConfig ? "found" : "not found", "error:", configError?.message);

    if (configError || !openaiConfig?.api_key) {
      console.error("OpenAI API key not configured for user:", configError?.message);
      return new Response(JSON.stringify({ error: "Configure sua chave da OpenAI em Configurações > Conexões" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use tool calling to get structured output
    const tools = [
      {
        type: "function",
        function: {
          name: "fill_meeting_summary",
          description: "Preenche os campos do resumo da reunião baseado na transcrição",
          parameters: {
            type: "object",
            properties: {
              campos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    nome: { type: "string", description: "Nome do campo" },
                    valor: { type: "string", description: "Valor extraído da transcrição" },
                  },
                  required: ["nome", "valor"],
                  additionalProperties: false,
                },
              },
              resumo_geral: {
                type: "string",
                description: "Um resumo geral da reunião em 2-3 frases",
              },
            },
            required: ["campos", "resumo_geral"],
            additionalProperties: false,
          },
        },
      },
    ];

    console.log("Calling OpenAI API...");

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiConfig.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "fill_meeting_summary" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    console.log("OpenAI Response received");

    // Parse the tool call response
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedArgs = JSON.parse(toolCall.function.arguments);
    console.log("Parsed AI response:", JSON.stringify(parsedArgs));

    // 5. Delete existing campos preenchidos for this reuniao
    await supabase
      .from("reuniao_campos_preenchidos")
      .delete()
      .eq("reuniao_id", reuniaoId);

    // 6. Insert the new filled campos
    const camposToInsert = templateCampos.map((templateCampo, index) => {
      const aiCampo = parsedArgs.campos?.find(
        (c: { nome: string; valor: string }) => 
          c.nome.toLowerCase().includes(templateCampo.nome.toLowerCase()) ||
          templateCampo.nome.toLowerCase().includes(c.nome.toLowerCase())
      );
      
      return {
        reuniao_id: reuniaoId,
        campo_nome: templateCampo.nome,
        campo_descricao: templateCampo.descricao,
        valor: aiCampo?.valor || parsedArgs.campos?.[index]?.valor || "Não identificado",
        ordem: templateCampo.ordem,
      };
    });

    const { error: insertError } = await supabase
      .from("reuniao_campos_preenchidos")
      .insert(camposToInsert);

    if (insertError) {
      console.error("Error inserting campos:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save summary" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Update reuniao status and resumo_ia
    const { error: updateError } = await supabase
      .from("reunioes")
      .update({
        resumo_ia: parsedArgs.resumo_geral || "Resumo processado",
        status: "resumido",
      })
      .eq("id", reuniaoId);

    if (updateError) {
      console.error("Error updating reuniao:", updateError);
    }

    console.log(`Successfully processed reuniao ${reuniaoId}`);

    return new Response(
      JSON.stringify({
        success: true,
        campos: camposToInsert.length,
        resumo: parsedArgs.resumo_geral,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing reuniao:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
