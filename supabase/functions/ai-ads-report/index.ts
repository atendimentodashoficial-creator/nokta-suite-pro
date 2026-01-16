import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment API keys
const ENV_OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Helper function to get user's OpenAI key from database
async function getUserOpenAIKey(userId: string): Promise<string | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from('openai_config')
      .select('api_key')
      .eq('user_id', userId)
      .single();
    
    if (error || !data) return null;
    return data.api_key;
  } catch (e) {
    console.error('Error fetching user OpenAI key:', e);
    return null;
  }
}

// Helper to get effective API key and configuration
async function getAIConfig(userId?: string): Promise<{ apiUrl: string; apiKey: string; model: string; provider: string } | null> {
  // Priority 1: User's key from database
  if (userId) {
    const userKey = await getUserOpenAIKey(userId);
    if (userKey && userKey.length > 0) {
      return {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: userKey,
        model: 'gpt-4o-mini',
        provider: 'openai-user'
      };
    }
  }
  
  // Priority 2: Environment OpenAI key
  if (ENV_OPENAI_API_KEY && ENV_OPENAI_API_KEY.length > 0) {
    return {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: ENV_OPENAI_API_KEY,
      model: 'gpt-4o-mini',
      provider: 'openai-env'
    };
  }
  
  // Priority 3: Lovable AI
  if (LOVABLE_API_KEY && LOVABLE_API_KEY.length > 0) {
    return {
      apiUrl: 'https://ai.gateway.lovable.dev/v1/chat/completions',
      apiKey: LOVABLE_API_KEY,
      model: 'google/gemini-3-flash-preview',
      provider: 'lovable'
    };
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract user from auth header for personalized key lookup
    let userId: string | undefined;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        userId = user?.id;
      } catch (e) {
        console.log('Could not extract user:', e);
      }
    }

    const { action, campaigns, adsets, ads, dateStart, dateEnd, accountId, currency, compareWithPrevious, previousReport, funnelData } = await req.json();

    // Check API key action
    if (action === 'check_api_key') {
      const aiConfig = await getAIConfig(userId);
      console.log("Checking AI configuration - Provider:", aiConfig?.provider || 'none');
      return new Response(
        JSON.stringify({ 
          success: true, 
          configured: !!aiConfig,
          provider: aiConfig?.provider || 'none'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate report action
    if (action === 'generate_report') {
      const aiConfig = await getAIConfig(userId);
      
      if (!aiConfig) {
        console.error("No AI API key configured (neither user key, OpenAI env, nor Lovable AI)");
        return new Response(
          JSON.stringify({ success: false, error: "Nenhuma API de IA configurada. Configure a chave OpenAI nas configurações." }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`Using AI provider: ${aiConfig.provider}, model: ${aiConfig.model}`);


      // Helper function to check if an item has actual data (not all zeros)
      const hasActualData = (item: any): boolean => {
        return (
          (item.impressions || 0) > 0 ||
          (item.clicks || 0) > 0 ||
          (item.spend || 0) > 0 ||
          (item.results || 0) > 0 ||
          (item.reach || 0) > 0
        );
      };

      // Filter out items with zero data (inactive during the period)
      const filteredCampaigns = (campaigns || []).filter(hasActualData);
      const filteredAdsets = (adsets || []).filter(hasActualData);
      const filteredAds = (ads || []).filter(hasActualData);

      console.log(`Filtered data: ${filteredCampaigns.length}/${campaigns?.length || 0} campaigns, ${filteredAdsets.length}/${adsets?.length || 0} adsets, ${filteredAds.length}/${ads?.length || 0} ads`);

      if (filteredCampaigns.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhuma campanha com dados no período selecionado" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Generating AI report for ${filteredCampaigns.length} campaigns, ${filteredAdsets.length} adsets, ${filteredAds.length} ads. Compare: ${compareWithPrevious}. Currency: ${currency || 'BRL'}`);

      // Determine currency symbol based on account currency
      const accountCurrency = currency || 'BRL';
      const currencySymbol = accountCurrency === 'USD' ? 'US$' : 'R$';
      const currencyName = accountCurrency === 'USD' ? 'dólares' : 'reais';

      // Generate top performers by metric (calculated in code, not by AI)
      const generateTopPerformersByMetric = () => {
        const metrics = [
          { key: 'results', label: 'Resultados', format: (v: number) => v.toString(), sortDesc: true },
          { key: 'ctr', label: 'CTR', format: (v: number) => `${v.toFixed(2)}%`, sortDesc: true },
          { key: 'cpc', label: 'CPC', format: (v: number) => `${currencySymbol} ${v.toFixed(2)}`, sortDesc: false },
          { key: 'cpm', label: 'CPM', format: (v: number) => `${currencySymbol} ${v.toFixed(2)}`, sortDesc: false },
          { key: 'cost_per_result', label: 'Custo/Resultado', format: (v: number) => `${currencySymbol} ${v.toFixed(2)}`, sortDesc: false },
        ];

        const byMetric: Record<string, { campaigns: any[], adsets: any[], ads: any[] }> = {};

        for (const metric of metrics) {
          const sortFn = metric.sortDesc 
            ? (a: any, b: any) => (b[metric.key] || 0) - (a[metric.key] || 0)
            : (a: any, b: any) => {
                // For cost metrics, filter out zeros and sort ascending
                const aVal = a[metric.key] || Infinity;
                const bVal = b[metric.key] || Infinity;
                return aVal - bVal;
              };

          // Filter items that have the metric > 0 (for cost metrics) or >= 0 (for others)
          const filterFn = metric.sortDesc
            ? (item: any) => (item[metric.key] || 0) > 0
            : (item: any) => (item[metric.key] || 0) > 0;

          const topCampaigns = filteredCampaigns
            .filter(filterFn)
            .sort(sortFn)
            .slice(0, 3)
            .map((c: any) => ({
              name: c.campaign_name,
              metric: metric.label,
              value: metric.format(c[metric.key] || 0),
              spend: c.spend || 0
            }));

          const topAdsets = filteredAdsets
            .filter(filterFn)
            .sort(sortFn)
            .slice(0, 3)
            .map((a: any) => ({
              name: a.adset_name,
              campaign: a.campaign_name || 'N/A',
              metric: metric.label,
              value: metric.format(a[metric.key] || 0),
              spend: a.spend || 0
            }));

          const topAds = filteredAds
            .filter(filterFn)
            .sort(sortFn)
            .slice(0, 3)
            .map((ad: any) => ({
              name: ad.ad_name,
              adset: ad.adset_name || 'N/A',
              metric: metric.label,
              value: metric.format(ad[metric.key] || 0),
              spend: ad.spend || 0
            }));

          byMetric[metric.key] = { campaigns: topCampaigns, adsets: topAdsets, ads: topAds };
        }

        return byMetric;
      };

      const topPerformersByMetric = generateTopPerformersByMetric();

      // Calculate totals FIRST (using filtered data) - needed for score calculation
      const totalSpend = filteredCampaigns.reduce((acc: number, c: any) => acc + (c.spend || 0), 0);
      const totalImpressions = filteredCampaigns.reduce((acc: number, c: any) => acc + (c.impressions || 0), 0);
      const totalClicks = filteredCampaigns.reduce((acc: number, c: any) => acc + (c.clicks || 0), 0);
      const totalResults = filteredCampaigns.reduce((acc: number, c: any) => acc + (c.results || 0), 0);
      const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const avgCostPerResult = totalResults > 0 ? totalSpend / totalResults : 0;

      // Calculate adset and ad level totals
      const adsetTotalSpend = filteredAdsets.reduce((acc: number, a: any) => acc + (a.spend || 0), 0);
      const adsetTotalResults = filteredAdsets.reduce((acc: number, a: any) => acc + (a.results || 0), 0);
      const adsetAvgCostPerResult = adsetTotalResults > 0 ? adsetTotalSpend / adsetTotalResults : 0;
      
      const adTotalSpend = filteredAds.reduce((acc: number, a: any) => acc + (a.spend || 0), 0);
      const adTotalResults = filteredAds.reduce((acc: number, a: any) => acc + (a.results || 0), 0);
      const adAvgCostPerResult = adTotalResults > 0 ? adTotalSpend / adTotalResults : 0;

      // Calculate score based on metrics performance (AFTER calculating the metrics)
      const calculateScore = () => {
        let score = 50; // Base score
        
        // CTR score contribution (good CTR > 1%)
        if (avgCTR > 2) score += 15;
        else if (avgCTR > 1) score += 10;
        else if (avgCTR > 0.5) score += 5;
        else if (avgCTR < 0.3) score -= 10;
        
        // Cost efficiency (lower CPC is better, benchmark ~R$1.00)
        if (avgCPC < 0.5) score += 15;
        else if (avgCPC < 1) score += 10;
        else if (avgCPC < 2) score += 5;
        else if (avgCPC > 5) score -= 10;
        
        // Results vs spend ratio - INCREASED WEIGHT for cost per result
        if (totalResults > 0) {
          if (avgCostPerResult < 5) score += 20;
          else if (avgCostPerResult < 10) score += 15;
          else if (avgCostPerResult < 20) score += 10;
          else if (avgCostPerResult < 30) score += 5;
          else if (avgCostPerResult > 100) score -= 15;
        } else {
          score -= 20; // No results
        }
        
        // Active campaigns bonus
        if (filteredCampaigns.length >= 3) score += 5;
        
        return Math.max(0, Math.min(100, Math.round(score)));
      };

      const reportScore = calculateScore();
      console.log(`Calculated score: ${reportScore} (CTR: ${avgCTR.toFixed(2)}%, CPC: R$${avgCPC.toFixed(2)}, Cost/Result: R$${avgCostPerResult.toFixed(2)}, Results: ${totalResults})`);

      // Prepare detailed data for AI analysis - include adsets and ads with cost per result
      const campaignsSummary = filteredCampaigns.map((c: any) => ({
        nome: c.campaign_name,
        status: c.status,
        objetivo: c.objective,
        gasto: c.spend,
        resultados: c.results,
        ctr: c.ctr,
        cpc: c.cpc,
        custo_por_resultado: c.cost_per_result
      }));

      // Top 10 adsets by cost per result (best performing)
      const topAdsetsByCostPerResult = filteredAdsets
        .filter((a: any) => (a.cost_per_result || 0) > 0)
        .sort((a: any, b: any) => (a.cost_per_result || Infinity) - (b.cost_per_result || Infinity))
        .slice(0, 10)
        .map((a: any) => ({
          nome: a.adset_name,
          campanha: a.campaign_name,
          gasto: a.spend,
          resultados: a.results,
          custo_por_resultado: a.cost_per_result,
          ctr: a.ctr,
          cpc: a.cpc
        }));

      // Top 10 ads by cost per result (best performing)
      const topAdsByCostPerResult = filteredAds
        .filter((a: any) => (a.cost_per_result || 0) > 0)
        .sort((a: any, b: any) => (a.cost_per_result || Infinity) - (b.cost_per_result || Infinity))
        .slice(0, 10)
        .map((a: any) => ({
          nome: a.ad_name,
          conjunto: a.adset_name,
          gasto: a.spend,
          resultados: a.results,
          custo_por_resultado: a.cost_per_result,
          ctr: a.ctr,
          cpc: a.cpc
        }));

      // Worst performers by cost per result (for insights)
      const worstCampaignsByCostPerResult = filteredCampaigns
        .filter((c: any) => (c.cost_per_result || 0) > avgCostPerResult * 1.5 && c.spend > 50)
        .sort((a: any, b: any) => (b.cost_per_result || 0) - (a.cost_per_result || 0))
        .slice(0, 5)
        .map((c: any) => ({
          nome: c.campaign_name,
          gasto: c.spend,
          resultados: c.results,
          custo_por_resultado: c.cost_per_result
        }));

      let comparisonSection = "";
      let comparisonOutputFormat = "";
      
      if (compareWithPrevious && previousReport) {
        comparisonSection = `

RELATÓRIO ANTERIOR PARA COMPARAÇÃO:
${JSON.stringify(previousReport, null, 2)}

INSTRUÇÕES DE COMPARAÇÃO:
Compare o desempenho atual com o relatório anterior e identifique:
- Métricas que melhoraram significativamente
- Métricas que pioraram
- Tendências gerais
- O que pode ter causado as mudanças`;

        comparisonOutputFormat = `,
    "comparison": {
      "summary": "Resumo da comparação com o período anterior",
      "changes": [
        {
          "type": "improvement" | "decline" | "neutral",
          "title": "Título da mudança",
          "description": "Descrição do que mudou"
        }
      ]
    }`;
      }

      // Build funnel analysis section if data is available
      let funnelSection = "";
      let funnelInsightsInstructions = "";
      
      if (funnelData && funnelData.totals) {
        const totals = funnelData.totals;
        const taxas = funnelData.taxas || {};
        const byCampaign = funnelData.byCampaign || [];
        
        funnelSection = `

═══════════════════════════════════════════════════════════════
📊 FUNIL DE CONVERSÃO REAL (DADOS DO CRM)
═══════════════════════════════════════════════════════════════
Este é o funil REAL baseado nos leads que chegaram via anúncios e seu progresso no CRM:

TOTAIS DO PERÍODO:
- Total de Leads: ${totals.leads} (${totals.leadsTracked} rastreados de anúncios / ${totals.leadsUntracked} sem rastreamento)
- Agendamentos: ${totals.agendados} (${totals.agendadosTracked} rastreados / ${totals.agendadosUntracked} não rastreados)
- Comparecimentos: ${totals.compareceu} (${totals.compareceuTracked} rastreados / ${totals.compareceuUntracked} não rastreados)
- Em Negociação: ${totals.emNegociacao || 0}
- Clientes Fechados: ${totals.clientes} (${totals.clientesTracked} rastreados / ${totals.clientesUntracked} não rastreados)
- Faturamento Total: R$ ${(totals.valorTotal || 0).toFixed(2)} (R$ ${(totals.valorTracked || 0).toFixed(2)} de anúncios / R$ ${(totals.valorUntracked || 0).toFixed(2)} orgânico)
- Ticket Médio: R$ ${(totals.ticketMedio || 0).toFixed(2)}

TAXAS DE CONVERSÃO:
- Taxa de Agendamento (Lead → Agendado): ${(taxas.agendamento || 0).toFixed(1)}%
- Taxa de Comparecimento (Agendado → Compareceu): ${(taxas.comparecimento || 0).toFixed(1)}%
- Taxa de Fechamento (Compareceu → Cliente): ${(taxas.fechamento || 0).toFixed(1)}%
- Conversão Geral (Lead → Cliente): ${(taxas.conversaoGeral || 0).toFixed(1)}%

${byCampaign.length > 0 ? `FUNIL POR CAMPANHA (Top 10):
${JSON.stringify(byCampaign.slice(0, 10).map((c: any) => ({
  campanha: c.campaign,
  leads: c.leads,
  agendados: c.agendados,
  compareceu: c.compareceu,
  clientes: c.clientes,
  valor_fechado: c.valor,
  taxa_conversao: c.leads > 0 ? ((c.clientes / c.leads) * 100).toFixed(1) + '%' : '0%'
})), null, 2)}` : ''}

ANÁLISE DE EFICIÊNCIA DO FUNIL (gastos em ${currencySymbol}):
- Custo por Lead (CPL): ${currencySymbol} ${totalResults > 0 ? (totalSpend / totals.leadsTracked).toFixed(2) : '0.00'}
- Custo por Agendamento: ${currencySymbol} ${totals.agendadosTracked > 0 ? (totalSpend / totals.agendadosTracked).toFixed(2) : '0.00'}
- Custo por Comparecimento: ${currencySymbol} ${totals.compareceuTracked > 0 ? (totalSpend / totals.compareceuTracked).toFixed(2) : '0.00'}
- CAC (Custo de Aquisição de Cliente): ${currencySymbol} ${totals.clientesTracked > 0 ? (totalSpend / totals.clientesTracked).toFixed(2) : '0.00'}
- ROAS Real: ${totals.valorTracked > 0 && totalSpend > 0 ? (totals.valorTracked / totalSpend).toFixed(2) + 'x' : 'N/A'}
`;

        funnelInsightsInstructions = `
  * 2-3 insights sobre o FUNIL DE CONVERSÃO (taxas de agendamento, comparecimento, fechamento)
  * Identificar gargalos no funil (onde estamos perdendo mais leads)
  * Comparar desempenho de leads rastreados vs não rastreados`;
      }

      const prompt = `Você é um especialista em análise de campanhas de Facebook Ads, com foco especial em CUSTO POR RESULTADO e no FUNIL DE CONVERSÃO COMPLETO. Analise os dados abaixo e forneça insights e recomendações em JSON.

IMPORTANTE: 
1. O CUSTO POR RESULTADO (custo por conversa iniciada) é a métrica inicial importante.
2. Analise TODOS OS NÍVEIS: Campanhas, Conjuntos de Anúncios e Anúncios individuais.
3. ${funnelData ? 'CRÍTICO: Analise também o FUNIL DE CONVERSÃO REAL (dados do CRM) para entender a qualidade dos leads e o retorno real do investimento.' : 'Foque no custo por resultado como métrica principal.'}
4. Os rankings já foram calculados automaticamente. Seu foco é gerar INSIGHTS e RECOMENDAÇÕES.
5. MOEDA: Os valores monetários estão em ${currencyName} (${currencySymbol}). Sempre use ${currencySymbol} ao mencionar valores monetários.
6. NOMES: Use EXATAMENTE os nomes das campanhas, conjuntos e anúncios como estão nos dados. NÃO invente, resuma ou modifique os nomes.

PERÍODO: ${dateStart} a ${dateEnd}
MOEDA DA CONTA: ${accountCurrency} (${currencySymbol})

═══════════════════════════════════════════════════════════════
RESUMO GERAL - MÉTRICAS DE ANÚNCIOS
═══════════════════════════════════════════════════════════════
- Total de Campanhas com dados: ${filteredCampaigns.length}
- Total de Conjuntos com dados: ${filteredAdsets.length}
- Total de Anúncios com dados: ${filteredAds.length}
- Gasto Total: ${currencySymbol} ${totalSpend.toFixed(2)}
- Resultados Totais (conversas iniciadas): ${totalResults}
- CUSTO MÉDIO POR RESULTADO: ${currencySymbol} ${avgCostPerResult.toFixed(2)}
- CTR Médio: ${avgCTR.toFixed(2)}%
- CPC Médio: ${currencySymbol} ${avgCPC.toFixed(2)}
${funnelSection}
═══════════════════════════════════════════════════════════════
ANÁLISE POR NÍVEL - CUSTO POR RESULTADO
═══════════════════════════════════════════════════════════════

📊 CAMPANHAS (${filteredCampaigns.length} ativas):
Média de Custo/Resultado: ${currencySymbol} ${avgCostPerResult.toFixed(2)}
${JSON.stringify(campaignsSummary.slice(0, 10), null, 2)}

${worstCampaignsByCostPerResult.length > 0 ? `⚠️ Campanhas com Custo/Resultado ACIMA DA MÉDIA (possível desperdício):
${JSON.stringify(worstCampaignsByCostPerResult, null, 2)}` : ''}

📊 CONJUNTOS DE ANÚNCIOS (${filteredAdsets.length} ativos):
Média de Custo/Resultado: ${currencySymbol} ${adsetAvgCostPerResult.toFixed(2)}
Top 10 Melhores Conjuntos por Custo/Resultado:
${JSON.stringify(topAdsetsByCostPerResult, null, 2)}

📊 ANÚNCIOS INDIVIDUAIS (${filteredAds.length} ativos):
Média de Custo/Resultado: ${currencySymbol} ${adAvgCostPerResult.toFixed(2)}
Top 10 Melhores Anúncios por Custo/Resultado:
${JSON.stringify(topAdsByCostPerResult, null, 2)}
${comparisonSection}

Retorne um JSON válido (sem markdown) com a seguinte estrutura:
{
  "summary": "Resumo executivo de 5-7 frases focando no custo por resultado, eficiência do investimento ${funnelData ? 'e no funil de conversão real (CAC, ROAS, taxas de conversão)' : ''}",
  "insights": [
    {
      "type": "success" | "warning" | "info",
      "title": "Título curto do insight",
      "description": "Descrição detalhada do insight"
    }
  ],
  "recommendations": [
    "Recomendação 1",
    "Recomendação 2"
  ]${comparisonOutputFormat}
}

Forneça:
- 10-14 insights relevantes, sendo OBRIGATÓRIO incluir:
  * 2-3 insights sobre CAMPANHAS com melhor/pior custo por resultado (USE OS NOMES EXATOS DAS CAMPANHAS)
  * 2-3 insights sobre CONJUNTOS DE ANÚNCIOS com melhor/pior custo por resultado (USE OS NOMES EXATOS DOS CONJUNTOS)
  * 2-3 insights sobre ANÚNCIOS com melhor/pior custo por resultado (USE OS NOMES EXATOS DOS ANÚNCIOS)${funnelInsightsInstructions}
  * 1-2 insights gerais sobre tendências
- 10-12 recomendações práticas e acionáveis focadas em:
  * Reduzir custo por resultado
  * Escalar os melhores anúncios/conjuntos (mencione pelo nome exato)
  * Pausar ou otimizar os piores performers (mencione pelo nome exato)
  ${funnelData ? `* Melhorar taxas de conversão do funil (agendamento, comparecimento, fechamento)
  * Identificar quais campanhas trazem leads de melhor qualidade (que mais convertem em clientes)` : ''}
${compareWithPrevious ? '- 4-6 mudanças na seção de comparação' : ''}

REGRAS CRÍTICAS:
1. USE SEMPRE O SÍMBOLO ${currencySymbol} para valores monetários (a conta está em ${currencyName})
2. USE SEMPRE OS NOMES EXATOS das campanhas, conjuntos e anúncios - NUNCA invente, resuma ou modifique os nomes
3. Quando mencionar uma campanha, conjunto ou anúncio, use o nome EXATAMENTE como aparece nos dados fornecidos

FOCO PRINCIPAL:
1. Identificar os anúncios e conjuntos mais eficientes (menor custo por conversa)
2. Apontar desperdício de verba em anúncios/conjuntos ineficientes
3. Sugerir realocação de orçamento para os melhores performers
4. Identificar padrões de sucesso (criativos, públicos, horários)
${funnelData ? `5. Analisar a qualidade dos leads por campanha (qual campanha traz leads que mais convertem)
6. Calcular o retorno real do investimento (ROAS baseado em faturamento real)
7. Identificar gargalos no funil (onde estamos perdendo mais oportunidades)` : ''}`;

      console.log(`Calling AI API (${aiConfig.provider}) with enhanced cost/result analysis`);

      const response = await fetch(aiConfig.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { 
              role: 'system', 
              content: 'Você é um especialista em marketing digital e análise de campanhas de Facebook Ads. Sempre responda em português brasileiro com JSON válido, sem markdown.' 
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI API error (${aiConfig.provider}):`, response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ success: false, error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ success: false, error: aiConfig.provider.startsWith('openai') ? "Erro na API OpenAI. Verifique sua chave e créditos." : "Créditos de IA esgotados. Adicione créditos em Configurações > Workspace > Uso." }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 401) {
          return new Response(
            JSON.stringify({ success: false, error: aiConfig.provider.startsWith('openai') ? "Chave OpenAI inválida. Verifique nas configurações." : "Erro de autenticação na API de IA." }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ success: false, error: `Erro ao chamar API de IA (${aiConfig.provider})` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      const aiContent = data.choices[0].message.content;
      
      console.log("AI response received, parsing JSON");

      // Parse JSON from AI response
      let report;
      try {
        // Remove possible markdown code blocks
        const cleanContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        report = JSON.parse(cleanContent);
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError);
        console.log("Raw AI content:", aiContent);
        
        // Return a fallback report
        report = {
          summary: "Não foi possível processar a análise completa. Por favor, tente novamente.",
          insights: [
            {
              type: "info",
              title: "Análise em processamento",
              description: "Houve um erro ao processar a resposta da IA. Tente gerar o relatório novamente."
            }
          ],
          recommendations: [
            "Tente gerar o relatório novamente",
            "Verifique se há campanhas ativas no período selecionado"
          ]
        };
      }

      // Add calculated data to the report
      report.topPerformersByMetric = topPerformersByMetric;
      report.score = reportScore;

      console.log("Report generated successfully with top performers by metric");

      return new Response(
        JSON.stringify({ success: true, report }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in ai-ads-report function:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
