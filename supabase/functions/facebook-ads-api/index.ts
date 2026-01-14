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
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token de autenticação não fornecido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a Supabase client with the user's token
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { 
        global: { 
          headers: { Authorization: authHeader } 
        } 
      }
    );

    // Get user from the token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    console.log("User ID:", user?.id);
    console.log("Auth Error:", authError?.message);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ad_account_id, campaign_id, adset_id, date_start, date_end, account_type } = await req.json();
    console.log("Action:", action, "Ad Account ID:", ad_account_id, "Campaign ID:", campaign_id, "Adset ID:", adset_id, "Date range:", date_start, "-", date_end, "Account Type:", account_type);

    // Função para buscar cotação do dólar
    const fetchUSDToBRL = async (): Promise<number> => {
      try {
        // Usar API do Banco Central do Brasil
        const response = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL");
        const data = await response.json();
        if (data?.USDBRL?.bid) {
          const rate = parseFloat(data.USDBRL.bid);
          console.log("[EXCHANGE] USD to BRL rate:", rate);
          return rate;
        }
        // Fallback
        console.log("[EXCHANGE] Using fallback rate");
        return 5.0;
      } catch (error) {
        console.error("[EXCHANGE] Error fetching exchange rate:", error);
        return 5.0; // Fallback
      }
    };

    // Use service role client to query database
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Buscar token do Facebook do usuário
    const { data: fbConfig, error: configError } = await adminClient
      .from("facebook_config")
      .select("access_token")
      .eq("user_id", user.id)
      .single();

    console.log("FB Config found:", !!fbConfig?.access_token);
    console.log("Config Error:", configError?.message);

    if (configError || !fbConfig?.access_token) {
      return new Response(
        JSON.stringify({ error: "Token do Facebook não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = fbConfig.access_token;

    if (action === "get_account_info") {
      if (!ad_account_id) {
        return new Response(
          JSON.stringify({ error: "Ad Account ID não fornecido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Normalizar o ad_account_id (adicionar act_ se não tiver)
      const normalizedAccountId = ad_account_id.startsWith("act_") 
        ? ad_account_id 
        : `act_${ad_account_id}`;

      // Buscar dados básicos da conta
      // Observação: para contas pré-pagas, o "saldo disponível" não vem no field balance.
      // Precisamos de spend_cap e amount_spent para estimar: saldo = spend_cap - amount_spent
      const fbUrl = `https://graph.facebook.com/v22.0/${normalizedAccountId}?fields=name,balance,spend_cap,funding_source_details,is_prepay_account,currency,amount_spent&access_token=${accessToken}`;

      console.log(`Fetching Facebook Ads data for account: ${normalizedAccountId}`);

      const fbResponse = await fetch(fbUrl);
      const fbData = await fbResponse.json();

      if (fbData.error) {
        console.error("Facebook API Error:", fbData.error);
        return new Response(
          JSON.stringify({ 
            error: fbData.error.message || "Erro ao buscar dados do Facebook",
            error_code: fbData.error.code,
            error_type: fbData.error.type
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar gastos no período (se date_start e date_end foram fornecidos)
      let spendInPeriod = 0;
      if (date_start && date_end) {
        try {
          const timeRangeValue = encodeURIComponent(
            JSON.stringify({ since: date_start, until: date_end })
          );
          const insightsUrl = `https://graph.facebook.com/v22.0/${normalizedAccountId}/insights?fields=spend&time_range=${timeRangeValue}&access_token=${accessToken}`;
          console.log("Fetching insights for period:", date_start, "to", date_end);
          
          const insightsResponse = await fetch(insightsUrl);
          const insightsData = await insightsResponse.json();
          
          if (insightsData.data && insightsData.data.length > 0 && insightsData.data[0].spend) {
            spendInPeriod = parseFloat(insightsData.data[0].spend);
            console.log("Spend in period:", spendInPeriod);
          }
        } catch (insightError) {
          console.error("Error fetching insights:", insightError);
        }
      }

      // Buscar orçamento diário total das campanhas/conjuntos ativos
      let totalDailyBudget = 0;
      const campaignsWithCBO: Set<string> = new Set(); // Campanhas com orçamento a nível de campanha (CBO)
      const activeCampaigns: Set<string> = new Set(); // Todas as campanhas ativas
      
      try {
        // Buscar campanhas com orçamento
        const campaignsUrl = `https://graph.facebook.com/v22.0/${normalizedAccountId}/campaigns?fields=id,name,daily_budget,lifetime_budget,status&limit=500&access_token=${accessToken}`;
        const campaignsResponse = await fetch(campaignsUrl);
        const campaignsData = await campaignsResponse.json();
        
        console.log("[BUDGET] Campaigns total:", campaignsData.data?.length || 0);
        
        if (campaignsData.data) {
          for (const campaign of campaignsData.data) {
            if (campaign.status === "ACTIVE") {
              activeCampaigns.add(campaign.id);
              // Se a campanha tem daily_budget, é CBO (Campaign Budget Optimization)
              if (campaign.daily_budget) {
                const budget = parseInt(campaign.daily_budget) / 100;
                totalDailyBudget += budget;
                campaignsWithCBO.add(campaign.id);
                console.log(`[BUDGET] Campaign CBO ${campaign.name}: R$${budget}`);
              } else {
                console.log(`[BUDGET] Campaign ABO ${campaign.name}: budget at adset level`);
              }
            }
          }
        }
        
        console.log(`[BUDGET] Active campaigns: ${activeCampaigns.size}, CBO campaigns: ${campaignsWithCBO.size}`);

        // Buscar ad sets ativos com orçamento
        // Só somar se a campanha pai NÃO for CBO (para evitar duplicação)
        const fetchAllPages = async (url: string, label: string) => {
          const all: any[] = [];
          let nextUrl: string | null = url;
          let pages = 0;

          while (nextUrl && pages < 10) {
            pages++;
            const res: Response = await fetch(nextUrl);
            const json: any = await res.json();

            if (json?.error) {
              console.error(`[BUDGET] ${label} error:`, json.error);
              break;
            }

            if (Array.isArray(json?.data)) {
              all.push(...json.data);
            }

            nextUrl = json?.paging?.next ?? null;
          }

          return all;
        };

        const adsetsUrl = `https://graph.facebook.com/v22.0/${normalizedAccountId}/adsets?fields=id,name,daily_budget,lifetime_budget,status,effective_status,campaign_id&effective_status=["ACTIVE"]&limit=500&access_token=${accessToken}`;
        const adsets = await fetchAllPages(adsetsUrl, "AdSets");

        console.log("[BUDGET] AdSets total:", adsets.length);

        let aboAdSetsCount = 0;
        let aboAdSetsBudget = 0;

        for (const adset of adsets) {
          // O campaign_id pode vir como string ou como objeto {id: "xxx"}
          const campaignId = typeof adset.campaign_id === "object" ? adset.campaign_id?.id : adset.campaign_id;

          const dailyBudgetRaw = adset.daily_budget;
          if (!dailyBudgetRaw) continue;

          const budget = parseInt(dailyBudgetRaw) / 100;
          if (!Number.isFinite(budget) || budget <= 0) continue;

          // Verificar se a campanha pai é CBO
          const isCBO = campaignsWithCBO.has(campaignId);

          if (!isCBO) {
            // É ABO - somar o orçamento do ad set
            totalDailyBudget += budget;
            aboAdSetsCount++;
            aboAdSetsBudget += budget;
            console.log(`[BUDGET] AdSet ABO ${adset.name}: R$${budget}`);
          }
        }

        console.log(`[BUDGET] ABO AdSets added: ${aboAdSetsCount}, total: R$${aboAdSetsBudget}`);
        console.log(`[BUDGET] Total daily budget: R$${totalDailyBudget}`);
      } catch (budgetError) {
        console.error("[BUDGET] Error:", budgetError);
      }

      // Atualizar dados na tabela local usando adminClient
      await adminClient
        .from("facebook_ad_accounts")
        .upsert({
          user_id: user.id,
          ad_account_id: normalizedAccountId,
          account_name: fbData.name,
          is_prepay_account: fbData.is_prepay_account,
          last_balance: fbData.balance ? parseInt(fbData.balance) / 100 : null,
          last_sync_at: new Date().toISOString(),
          status: "connected",
          // Só atualiza account_type se foi passado explicitamente
          ...(account_type ? { account_type } : {})
        }, {
          onConflict: "user_id,ad_account_id"
        });

      // Buscar account_type e currency_type do banco se não foi passado
      let effectiveAccountType = account_type;
      let effectiveCurrencyType = "BRL";
      
      const { data: accountData } = await adminClient
        .from("facebook_ad_accounts")
        .select("account_type, currency_type")
        .eq("user_id", user.id)
        .eq("ad_account_id", normalizedAccountId)
        .single();
      
      if (!effectiveAccountType) {
        effectiveAccountType = accountData?.account_type;
      }
      effectiveCurrencyType = accountData?.currency_type || "BRL";

      // Determinar se é pré-pago baseado no tipo definido pelo usuário ou detecção do Facebook
      const isPrepaid = effectiveAccountType === "prepaid" ||
        (effectiveAccountType !== "postpaid" && fbData.is_prepay_account);

      // Valores retornados pela API normalmente vêm em centavos (string)
      const balanceCents = fbData.balance ? parseInt(String(fbData.balance)) : 0;
      const spendCapCents = fbData.spend_cap ? parseInt(String(fbData.spend_cap)) : 0;
      const amountSpentCents = fbData.amount_spent ? parseInt(String(fbData.amount_spent)) : 0;

      // balance (na API) costuma ser "amount due" (especialmente em pós-pago)
      let amountDue = balanceCents / 100;
      let spendCap = spendCapCents / 100;
      let amountSpent = amountSpentCents / 100;
      let convertedSpendInPeriod = spendInPeriod;
      let convertedDailyBudget = totalDailyBudget;
      let exchangeRate = 1;

      // Se a conta está configurada como USD, converter todos os valores para BRL
      if (effectiveCurrencyType === "USD") {
        exchangeRate = await fetchUSDToBRL();
        amountDue = amountDue * exchangeRate;
        spendCap = spendCap * exchangeRate;
        amountSpent = amountSpent * exchangeRate;
        convertedSpendInPeriod = spendInPeriod * exchangeRate;
        convertedDailyBudget = totalDailyBudget * exchangeRate;
        console.log("[CONVERSION] Converted USD values to BRL with rate:", exchangeRate);
      }

      // Regra:
      // - Pré-pago: saldo disponível ≈ spend_cap - amount_spent
      // - Pós-pago: saldo na conta (para exibição) = -amount_due (dívida fica negativa)
      const displayBalance = isPrepaid ? (spendCap - amountSpent) : (-amountDue);

      console.log("[BALANCE] fb.balance(raw):", fbData.balance, "cents:", balanceCents);
      console.log("[BALANCE] fb.spend_cap(raw):", fbData.spend_cap, "cents:", spendCapCents);
      console.log("[BALANCE] fb.amount_spent(raw):", fbData.amount_spent, "cents:", amountSpentCents);
      console.log("[BALANCE] isPrepaid:", isPrepaid, "effectiveType:", effectiveAccountType, "display:", displayBalance);
      console.log("[BALANCE] currencyType:", effectiveCurrencyType, "exchangeRate:", exchangeRate);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: normalizedAccountId,
            name: fbData.name,
            balance: displayBalance,
            currency: "BRL", // Sempre retornar em BRL (convertido se necessário)
            currency_type: effectiveCurrencyType, // Moeda original da conta
            is_prepay_account: isPrepaid,
            account_type: effectiveAccountType || (isPrepaid ? "prepaid" : "postpaid"),
            funding_source_details: fbData.funding_source_details,
            amount_spent: amountSpent,
            spend_cap: spendCap,
            amount_due: amountDue,
            spend_in_period: convertedSpendInPeriod,
            daily_budget: convertedDailyBudget,
            exchange_rate: effectiveCurrencyType === "USD" ? exchangeRate : null
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_campaign_metrics") {
      if (!ad_account_id) {
        return new Response(
          JSON.stringify({ error: "Ad Account ID não fornecido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedAccountId = ad_account_id.startsWith("act_") 
        ? ad_account_id 
        : `act_${ad_account_id}`;

      // Buscar currency_type da conta para converter valores se necessário
      const { data: accountSettings } = await adminClient
        .from("facebook_ad_accounts")
        .select("currency_type")
        .eq("user_id", user.id)
        .eq("ad_account_id", normalizedAccountId)
        .single();
      
      const currencyType = accountSettings?.currency_type || "BRL";
      let exchangeRate = 1;
      if (currencyType === "USD") {
        exchangeRate = await fetchUSDToBRL();
        console.log("[CAMPAIGN_METRICS] Converting USD to BRL with rate:", exchangeRate);
      }

      // Buscar campanhas com métricas
      const timeRange = date_start && date_end
        ? `&time_range=${encodeURIComponent(JSON.stringify({ since: date_start, until: date_end }))}`
        : "";
      
      const campaignsUrl = `https://graph.facebook.com/v22.0/${normalizedAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&access_token=${accessToken}`;
      
      console.log("Fetching campaigns for account:", normalizedAccountId);
      
      const campaignsResponse = await fetch(campaignsUrl);
      const campaignsData = await campaignsResponse.json();

      if (campaignsData.error) {
        console.error("Facebook API Error:", campaignsData.error);
        return new Response(
          JSON.stringify({ 
            error: campaignsData.error.message || "Erro ao buscar campanhas",
            error_code: campaignsData.error.code
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const campaigns = campaignsData.data || [];
      const campaignsWithMetrics = [];

      // Buscar insights para cada campanha
      for (const campaign of campaigns) {
        try {
          // Métricas básicas (antigas)
          const insightsUrl = `https://graph.facebook.com/v22.0/${campaign.id}/insights?fields=impressions,clicks,spend,reach,ctr,cpc,cpm,actions,cost_per_action_type${timeRange}&access_token=${accessToken}`;

          const insightsResponse = await fetch(insightsUrl);
          const insightsData = await insightsResponse.json();

          if (insightsData?.error) {
            throw new Error(insightsData.error?.message || "Erro ao buscar insights da campanha");
          }

          let metrics = {
            impressions: 0,
            clicks: 0,
            spend: 0,
            reach: 0,
            ctr: 0,
            cpc: 0,
            cpm: 0,
            results: 0,
            cost_per_result: 0,
          };

          if (insightsData.data && insightsData.data.length > 0) {
            const insight = insightsData.data[0];
            
            // Log para debug
            console.log("Campaign:", campaign.name, "Objective:", campaign.objective);
            console.log("Actions:", JSON.stringify(insight.actions));
            console.log("Cost per action:", JSON.stringify(insight.cost_per_action_type));
            
            const impressions = parseInt(insight.impressions || 0);
            const reach = parseInt(insight.reach || 0);
            const spend = parseFloat(insight.spend || 0);
            
            metrics = {
              impressions,
              clicks: parseInt(insight.clicks || 0),
              spend,
              reach,
              ctr: parseFloat(insight.ctr || 0),
              cpc: parseFloat(insight.cpc || 0),
              cpm: parseFloat(insight.cpm || 0),
              results: 0,
              cost_per_result: 0,
            };

            // CONVERSAS INICIADAS: usar APENAS métricas de messaging para todas as campanhas
            // Isso garante que só mostramos custo por conversa iniciada, sem misturar com outros objetivos
            const messagingActions = [
              "onsite_conversion.messaging_conversation_started_7d",
              "onsite_conversion.messaging_first_reply",
              "onsite_conversion.total_messaging_connection"
            ];
            
            // Buscar conversas iniciadas
            if (insight.actions && Array.isArray(insight.actions)) {
              for (const actionType of messagingActions) {
                const action = insight.actions.find((a: { action_type: string; value: string }) => 
                  a.action_type === actionType
                );
                if (action) {
                  metrics.results = parseInt(action.value || 0);
                  console.log("Found messaging conversation:", actionType, action.value);
                  break;
                }
              }
            }

            // Buscar custo por conversa iniciada
            if (insight.cost_per_action_type && Array.isArray(insight.cost_per_action_type)) {
              for (const actionType of messagingActions) {
                const cost = insight.cost_per_action_type.find((c: { action_type: string; value: string }) => 
                  c.action_type === actionType
                );
                if (cost) {
                  metrics.cost_per_result = parseFloat(cost.value || 0);
                  console.log("Found messaging cost per conversation:", actionType, cost.value);
                  break;
                }
              }
            }

            // Fallback: calcular se tiver resultados mas não custo
            if (metrics.cost_per_result === 0 && metrics.results > 0) {
              metrics.cost_per_result = metrics.spend / metrics.results;
            }
          }

          // Calcular orçamento (daily_budget em centavos, converter para reais)
          // Se tiver daily_budget, usar; senão dividir lifetime_budget por 30 dias (estimativa)
          let dailyBudget = campaign.daily_budget 
            ? parseFloat(campaign.daily_budget) / 100 
            : (campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 / 30 : 0);

          // Aplicar conversão se necessário
          if (exchangeRate !== 1) {
            metrics.spend = metrics.spend * exchangeRate;
            metrics.cpc = metrics.cpc * exchangeRate;
            metrics.cpm = metrics.cpm * exchangeRate;
            metrics.cost_per_result = metrics.cost_per_result * exchangeRate;
            dailyBudget = dailyBudget * exchangeRate;
          }

          campaignsWithMetrics.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            status: campaign.status,
            objective: campaign.objective,
            daily_budget: dailyBudget,
            ...metrics
          });
        } catch (insightError) {
          console.error("Error fetching insights for campaign:", campaign.id, insightError);
          // Mesmo em caso de erro, incluir orçamento
          let dailyBudget = campaign.daily_budget 
            ? parseFloat(campaign.daily_budget) / 100 
            : (campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 / 30 : 0);

          if (exchangeRate !== 1) {
            dailyBudget = dailyBudget * exchangeRate;
          }

          campaignsWithMetrics.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            status: campaign.status,
            objective: campaign.objective,
            daily_budget: dailyBudget,
            impressions: 0,
            clicks: 0,
            spend: 0,
            reach: 0,
            ctr: 0,
            cpc: 0,
            cpm: 0,
            results: 0,
            cost_per_result: 0,
          });
        }
      }

      // Ordenar por gasto (maior primeiro)
      campaignsWithMetrics.sort((a, b) => b.spend - a.spend);

      // Calcular orçamento ativo total (CBO + ABO)
      let totalActiveBudget = 0;
      
      // 1. Somar orçamentos de campanhas CBO ativas
      const activeCBOCampaigns = campaignsWithMetrics.filter(
        c => c.status?.toUpperCase() === "ACTIVE" && (c.daily_budget ?? 0) > 0
      );
      const cboBudget = activeCBOCampaigns.reduce((acc, c) => acc + (c.daily_budget ?? 0), 0);
      totalActiveBudget += cboBudget;
      console.log("CBO Active Budget:", cboBudget, "from", activeCBOCampaigns.length, "campaigns");
      
      // 2. Buscar orçamentos de adsets ABO ativos (campanhas ativas SEM orçamento CBO)
      const activeABOCampaigns = campaignsWithMetrics.filter(
        c => c.status?.toUpperCase() === "ACTIVE" && (c.daily_budget ?? 0) === 0
      );
      
      let aboBudget = 0;
      for (const campaign of activeABOCampaigns) {
        try {
          const adsetsUrl = `https://graph.facebook.com/v22.0/${campaign.campaign_id}/adsets?fields=id,status,daily_budget,lifetime_budget&access_token=${accessToken}`;
          const adsetsResponse = await fetch(adsetsUrl);
          const adsetsData = await adsetsResponse.json();
          
          if (adsetsData.data && Array.isArray(adsetsData.data)) {
            for (const adset of adsetsData.data) {
              if (adset.status?.toUpperCase() === "ACTIVE") {
                let adsetBudget = adset.daily_budget 
                  ? parseFloat(adset.daily_budget) / 100 
                  : (adset.lifetime_budget ? parseFloat(adset.lifetime_budget) / 100 / 30 : 0);
                // Aplicar conversão se necessário
                if (exchangeRate !== 1) {
                  adsetBudget = adsetBudget * exchangeRate;
                }
                aboBudget += adsetBudget;
              }
            }
          }
        } catch (error) {
          console.error("Error fetching adsets for ABO budget:", campaign.campaign_id, error);
        }
      }
      
      totalActiveBudget += aboBudget;
      console.log("ABO Active Budget:", aboBudget, "from", activeABOCampaigns.length, "campaigns");
      console.log("Total Active Budget:", totalActiveBudget);

      return new Response(
        JSON.stringify({
          success: true,
          campaigns: campaignsWithMetrics,
          total_active_budget: totalActiveBudget,
          cbo_budget: cboBudget,
          abo_budget: aboBudget,
          currency_type: currencyType,
          exchange_rate: currencyType === "USD" ? exchangeRate : null
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_adsets") {
      if (!campaign_id) {
        return new Response(
          JSON.stringify({ error: "Campaign ID não fornecido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const timeRange = date_start && date_end
        ? `&time_range=${encodeURIComponent(JSON.stringify({ since: date_start, until: date_end }))}`
        : "";

      // Buscar adsets da campanha com campos de orçamento
      const adsetsUrl = `https://graph.facebook.com/v22.0/${campaign_id}/adsets?fields=id,name,status,daily_budget,lifetime_budget&access_token=${accessToken}`;
      
      console.log("Fetching adsets for campaign:", campaign_id);
      
      const adsetsResponse = await fetch(adsetsUrl);
      const adsetsData = await adsetsResponse.json();

      if (adsetsData.error) {
        console.error("Facebook API Error:", adsetsData.error);
        // Rate limit ou outros erros do Facebook - retornar 200 com success: false
        const isRateLimit = adsetsData.error.code === 17 || 
          (adsetsData.error.message || "").toLowerCase().includes("request limit");
        const friendlyMessage = isRateLimit 
          ? "Limite de requisições da API atingido. Aguarde alguns minutos e tente novamente."
          : (adsetsData.error.message || "Erro ao buscar conjuntos");
        return new Response(
          JSON.stringify({ success: false, error: friendlyMessage, adsets: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const adsets = adsetsData.data || [];
      const adsetsWithMetrics = [];

      for (const adset of adsets) {
        try {
          const insightsUrl = `https://graph.facebook.com/v22.0/${adset.id}/insights?fields=impressions,clicks,spend,reach,ctr,cpc,cpm,actions,cost_per_action_type${timeRange}&access_token=${accessToken}`;

          const insightsResponse = await fetch(insightsUrl);
          const insightsData = await insightsResponse.json();

          if (insightsData?.error) {
            throw new Error(insightsData.error?.message || "Erro ao buscar insights do conjunto");
          }

          let metrics = {
            impressions: 0,
            clicks: 0,
            spend: 0,
            reach: 0,
            ctr: 0,
            cpc: 0,
            cpm: 0,
            results: 0,
            cost_per_result: 0,
          };

          if (insightsData.data && insightsData.data.length > 0) {
            const insight = insightsData.data[0];
            const impressions = parseInt(insight.impressions || 0);
            const reach = parseInt(insight.reach || 0);
            const spend = parseFloat(insight.spend || 0);
            
            metrics = {
              impressions,
              clicks: parseInt(insight.clicks || 0),
              spend,
              reach,
              ctr: parseFloat(insight.ctr || 0),
              cpc: parseFloat(insight.cpc || 0),
              cpm: parseFloat(insight.cpm || 0),
              results: 0,
              cost_per_result: 0,
            };

            // Buscar conversas iniciadas
            if (insight.actions && Array.isArray(insight.actions)) {
              const messagingActions = [
                "onsite_conversion.messaging_conversation_started_7d",
                "onsite_conversion.messaging_first_reply",
                "onsite_conversion.total_messaging_connection"
              ];
              for (const actionType of messagingActions) {
                const action = insight.actions.find((a: { action_type: string; value: string }) => a.action_type === actionType);
                if (action) {
                  metrics.results = parseInt(action.value || 0);
                  break;
                }
              }
            }

            // Buscar custo por conversa iniciada
            if (insight.cost_per_action_type && Array.isArray(insight.cost_per_action_type)) {
              const messagingActions = [
                "onsite_conversion.messaging_conversation_started_7d",
                "onsite_conversion.messaging_first_reply",
                "onsite_conversion.total_messaging_connection"
              ];
              for (const actionType of messagingActions) {
                const cost = insight.cost_per_action_type.find((c: { action_type: string; value: string }) => c.action_type === actionType);
                if (cost) {
                  metrics.cost_per_result = parseFloat(cost.value || 0);
                  break;
                }
              }
            }

            if (metrics.cost_per_result === 0 && metrics.results > 0) {
              metrics.cost_per_result = metrics.spend / metrics.results;
            }
          }

          // Calcular orçamento do adset (ABO)
          const adsetDailyBudget = adset.daily_budget 
            ? parseFloat(adset.daily_budget) / 100 
            : (adset.lifetime_budget ? parseFloat(adset.lifetime_budget) / 100 / 30 : 0);

          adsetsWithMetrics.push({
            adset_id: adset.id,
            adset_name: adset.name,
            status: adset.status,
            daily_budget: adsetDailyBudget,
            ...metrics
          });
        } catch (error) {
          console.error("Error fetching adset insights:", adset.id, error);
          // Calcular orçamento mesmo em caso de erro
          const adsetDailyBudget = adset.daily_budget 
            ? parseFloat(adset.daily_budget) / 100 
            : (adset.lifetime_budget ? parseFloat(adset.lifetime_budget) / 100 / 30 : 0);

          adsetsWithMetrics.push({
            adset_id: adset.id,
            adset_name: adset.name,
            status: adset.status,
            daily_budget: adsetDailyBudget,
            impressions: 0,
            clicks: 0,
            spend: 0,
            reach: 0,
            ctr: 0,
            cpc: 0,
            cpm: 0,
            results: 0,
            cost_per_result: 0,
          });
        }
      }

      adsetsWithMetrics.sort((a, b) => b.spend - a.spend);

      return new Response(
        JSON.stringify({ success: true, adsets: adsetsWithMetrics }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_ads") {
      if (!adset_id) {
        return new Response(
          JSON.stringify({ error: "Adset ID não fornecido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const timeRange = date_start && date_end
        ? `&time_range=${encodeURIComponent(JSON.stringify({ since: date_start, until: date_end }))}`
        : "";

      // Buscar ads do adset
      const adsUrl = `https://graph.facebook.com/v22.0/${adset_id}/ads?fields=id,name,status,creative{thumbnail_url}&access_token=${accessToken}`;
      
      console.log("Fetching ads for adset:", adset_id);
      
      const adsResponse = await fetch(adsUrl);
      const adsData = await adsResponse.json();

      if (adsData.error) {
        console.error("Facebook API Error:", adsData.error);
        // Rate limit ou outros erros do Facebook - retornar 200 com success: false
        const isRateLimit = adsData.error.code === 17 || 
          (adsData.error.message || "").toLowerCase().includes("request limit");
        const friendlyMessage = isRateLimit 
          ? "Limite de requisições da API atingido. Aguarde alguns minutos e tente novamente."
          : (adsData.error.message || "Erro ao buscar anúncios");
        return new Response(
          JSON.stringify({ success: false, error: friendlyMessage, ads: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const ads = adsData.data || [];
      const adsWithMetrics = [];

      for (const ad of ads) {
        try {
          const insightsUrl = `https://graph.facebook.com/v22.0/${ad.id}/insights?fields=impressions,clicks,spend,reach,ctr,cpc,cpm,actions,cost_per_action_type${timeRange}&access_token=${accessToken}`;

          const insightsResponse = await fetch(insightsUrl);
          const insightsData = await insightsResponse.json();

          if (insightsData?.error) {
            throw new Error(insightsData.error?.message || "Erro ao buscar insights do anúncio");
          }

          let metrics = {
            impressions: 0,
            clicks: 0,
            spend: 0,
            reach: 0,
            ctr: 0,
            cpc: 0,
            cpm: 0,
            results: 0,
            cost_per_result: 0,
          };

          if (insightsData.data && insightsData.data.length > 0) {
            const insight = insightsData.data[0];
            const impressions = parseInt(insight.impressions || 0);
            const reach = parseInt(insight.reach || 0);
            const spend = parseFloat(insight.spend || 0);
            
            metrics = {
              impressions,
              clicks: parseInt(insight.clicks || 0),
              spend,
              reach,
              ctr: parseFloat(insight.ctr || 0),
              cpc: parseFloat(insight.cpc || 0),
              cpm: parseFloat(insight.cpm || 0),
              results: 0,
              cost_per_result: 0,
            };

            // Buscar conversas iniciadas
            if (insight.actions && Array.isArray(insight.actions)) {
              const messagingActions = [
                "onsite_conversion.messaging_conversation_started_7d",
                "onsite_conversion.messaging_first_reply",
                "onsite_conversion.total_messaging_connection"
              ];
              for (const actionType of messagingActions) {
                const action = insight.actions.find((a: { action_type: string; value: string }) => a.action_type === actionType);
                if (action) {
                  metrics.results = parseInt(action.value || 0);
                  break;
                }
              }
            }

            // Buscar custo por conversa iniciada
            if (insight.cost_per_action_type && Array.isArray(insight.cost_per_action_type)) {
              const messagingActions = [
                "onsite_conversion.messaging_conversation_started_7d",
                "onsite_conversion.messaging_first_reply",
                "onsite_conversion.total_messaging_connection"
              ];
              for (const actionType of messagingActions) {
                const cost = insight.cost_per_action_type.find((c: { action_type: string; value: string }) => c.action_type === actionType);
                if (cost) {
                  metrics.cost_per_result = parseFloat(cost.value || 0);
                  break;
                }
              }
            }

            if (metrics.cost_per_result === 0 && metrics.results > 0) {
              metrics.cost_per_result = metrics.spend / metrics.results;
            }
          }

          adsWithMetrics.push({
            ad_id: ad.id,
            ad_name: ad.name,
            status: ad.status,
            thumbnail_url: ad.creative?.thumbnail_url || null,
            ...metrics
          });
        } catch (error) {
          console.error("Error fetching ad insights:", ad.id, error);
          adsWithMetrics.push({
            ad_id: ad.id,
            ad_name: ad.name,
            status: ad.status,
            thumbnail_url: ad.creative?.thumbnail_url || null,
            impressions: 0,
            clicks: 0,
            spend: 0,
            reach: 0,
            ctr: 0,
            cpc: 0,
            cpm: 0,
            results: 0,
            cost_per_result: 0,
          });
        }
      }

      adsWithMetrics.sort((a, b) => b.spend - a.spend);

      return new Response(
        JSON.stringify({ success: true, ads: adsWithMetrics }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "test_connection") {
      // Testar conexão com o Facebook
      const fbUrl = `https://graph.facebook.com/v22.0/me?access_token=${accessToken}`;
      const fbResponse = await fetch(fbUrl);
      const fbData = await fbResponse.json();

      if (fbData.error) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: fbData.error.message || "Token inválido ou expirado"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          user_name: fbData.name,
          user_id: fbData.id
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Nova action para buscar gastos detalhados por conjunto e anúncio
    if (action === "get_spend_breakdown") {
      if (!ad_account_id) {
        return new Response(
          JSON.stringify({ error: "Ad Account ID não fornecido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedAccountId = ad_account_id.startsWith("act_") 
        ? ad_account_id 
        : `act_${ad_account_id}`;

      const timeRange = date_start && date_end
        ? `&time_range=${encodeURIComponent(JSON.stringify({ since: date_start, until: date_end }))}`
        : "";

      console.log("Fetching spend breakdown for account:", normalizedAccountId);

      // Buscar gastos por conjunto de anúncios
      // IMPORTANTE: Usar IDs como chave para evitar problemas com nomes duplicados
      const adsetSpendUrl = `https://graph.facebook.com/v22.0/${normalizedAccountId}/insights?fields=adset_name,adset_id,campaign_name,campaign_id,spend${timeRange}&level=adset&limit=500&access_token=${accessToken}`;
      
      const adsetResponse = await fetch(adsetSpendUrl);
      const adsetData = await adsetResponse.json();

      const spendByAdset: Record<string, { spend: number; campaign: string; campaign_id: string; adset: string; adset_id: string }> = {};
      if (adsetData.data && Array.isArray(adsetData.data)) {
        for (const item of adsetData.data) {
          const campaignName = item.campaign_name || "";
          const campaignId = item.campaign_id || "";
          const adsetName = item.adset_name || "Sem conjunto";
          const adsetId = item.adset_id || "";
          // Usar ID como chave quando disponível, fallback para nome
          const key = adsetId || `${campaignName}::${adsetName}`;

          if (!spendByAdset[key]) {
            spendByAdset[key] = { spend: 0, campaign: campaignName, campaign_id: campaignId, adset: adsetName, adset_id: adsetId };
          }
          spendByAdset[key].spend += parseFloat(item.spend || 0);
        }
      }

      // Buscar gastos por anúncio
      // IMPORTANTE: Usar IDs como chave para evitar problemas com nomes duplicados
      const adSpendUrl = `https://graph.facebook.com/v22.0/${normalizedAccountId}/insights?fields=ad_name,ad_id,adset_name,adset_id,campaign_name,campaign_id,spend${timeRange}&level=ad&limit=500&access_token=${accessToken}`;
      
      const adResponse = await fetch(adSpendUrl);
      const adData = await adResponse.json();

      const spendByAd: Record<string, { spend: number; adset: string; adset_id: string; campaign: string; campaign_id: string; ad_id: string; ad_name: string }> = {};
      if (adData.data && Array.isArray(adData.data)) {
        for (const item of adData.data) {
          const adName = item.ad_name || "Sem anúncio";
          const adId = item.ad_id || "";
          const adsetName = item.adset_name || "";
          const adsetId = item.adset_id || "";
          const campaignName = item.campaign_name || "";
          const campaignId = item.campaign_id || "";
          // Usar ID como chave quando disponível, fallback para nomes compostos
          const key = adId || `${campaignName}::${adsetName}::${adName}`;
          if (!spendByAd[key]) {
            spendByAd[key] = { 
              spend: 0, 
              adset: adsetName, 
              adset_id: adsetId,
              campaign: campaignName,
              campaign_id: campaignId,
              ad_id: adId,
              ad_name: adName
            };
          }
          spendByAd[key].spend += parseFloat(item.spend || 0);
        }
      }

      // Converter para arrays - incluindo IDs para lookup no frontend
      const adsetSpendArray = Object.entries(spendByAdset).map(([_, data]) => ({
        adset_name: data.adset,
        adset_id: data.adset_id,
        campaign_name: data.campaign,
        campaign_id: data.campaign_id,
        spend: data.spend
      }));

      const adSpendArray = Object.entries(spendByAd).map(([_, data]) => ({
        ad_name: data.ad_name,
        ad_id: data.ad_id,
        adset_name: data.adset,
        adset_id: data.adset_id,
        campaign_name: data.campaign,
        campaign_id: data.campaign_id,
        spend: data.spend
      }));

      return new Response(
        JSON.stringify({
          success: true,
          adset_spend: adsetSpendArray,
          ad_spend: adSpendArray
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação não reconhecida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in facebook-ads-api:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
