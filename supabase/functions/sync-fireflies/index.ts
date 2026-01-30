import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FirefliesTranscript {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  transcript_url: string;
  summary?: {
    overview?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Syncing Fireflies for user: ${userId}`);

    // Get user's Fireflies config
    const { data: config, error: configError } = await supabase
      .from("fireflies_config")
      .select("api_key")
      .eq("user_id", userId)
      .single();

    if (configError || !config?.api_key) {
      console.error("No Fireflies config found:", configError);
      return new Response(
        JSON.stringify({ error: "Fireflies API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching transcripts from Fireflies API...");

    // Fetch transcripts from Fireflies GraphQL API
    const firefliesResponse = await fetch("https://api.fireflies.ai/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        query: `
          query {
            transcripts(limit: 50) {
              id
              title
              date
              duration
              participants
              transcript_url
              summary {
                overview
              }
            }
          }
        `,
      }),
    });

    if (!firefliesResponse.ok) {
      const errorText = await firefliesResponse.text();
      console.error("Fireflies API error:", firefliesResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch from Fireflies API", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firefliesData = await firefliesResponse.json();
    console.log("Fireflies response:", JSON.stringify(firefliesData).substring(0, 500));

    if (firefliesData.errors) {
      console.error("Fireflies GraphQL errors:", firefliesData.errors);
      return new Response(
        JSON.stringify({ error: "Fireflies API returned errors", details: firefliesData.errors }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transcripts: FirefliesTranscript[] = firefliesData.data?.transcripts || [];
    console.log(`Found ${transcripts.length} transcripts`);

    let synced = 0;

    for (const transcript of transcripts) {
      // Check if already exists
      const { data: existing } = await supabase
        .from("reunioes")
        .select("id")
        .eq("fireflies_id", transcript.id)
        .eq("user_id", userId)
        .single();

      if (existing) {
        console.log(`Transcript ${transcript.id} already exists, skipping`);
        continue;
      }

      // Fetch full transcript content
      let transcricaoCompleta = null;
      if (transcript.transcript_url) {
        try {
          const transcriptResponse = await fetch("https://api.fireflies.ai/graphql", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${config.api_key}`,
            },
            body: JSON.stringify({
              query: `
                query GetTranscript($id: String!) {
                  transcript(id: $id) {
                    sentences {
                      speaker_name
                      text
                    }
                  }
                }
              `,
              variables: { id: transcript.id },
            }),
          });

          if (transcriptResponse.ok) {
            const transcriptData = await transcriptResponse.json();
            const sentences = transcriptData.data?.transcript?.sentences || [];
            transcricaoCompleta = sentences
              .map((s: { speaker_name: string; text: string }) => `${s.speaker_name}: ${s.text}`)
              .join("\n");
          }
        } catch (e) {
          console.error("Error fetching transcript content:", e);
        }
      }

      // Insert new meeting
      const { error: insertError } = await supabase.from("reunioes").insert({
        user_id: userId,
        fireflies_id: transcript.id,
        titulo: transcript.title || "Reunião sem título",
        data_reuniao: new Date(parseInt(transcript.date)).toISOString(),
        duracao_minutos: Math.round(transcript.duration || 0),
        participantes: transcript.participants || [],
        transcricao: transcricaoCompleta,
        resumo_ia: transcript.summary?.overview || null,
        status: transcricaoCompleta ? (transcript.summary?.overview ? "resumido" : "transcrito") : "pendente",
      });

      if (insertError) {
        console.error("Error inserting meeting:", insertError);
      } else {
        synced++;
        console.log(`Synced transcript: ${transcript.title}`);
      }
    }

    console.log(`Sync complete. ${synced} new meetings synced.`);

    return new Response(
      JSON.stringify({ success: true, synced, total: transcripts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
