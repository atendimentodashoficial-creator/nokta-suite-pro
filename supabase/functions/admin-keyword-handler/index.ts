import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Admin Keyword Handler
 * 
 * Processes incoming WhatsApp messages and checks if they match admin-configured keywords.
 * When a keyword is detected, it responds with the configured information (balance or report).
 * Includes cooldown to prevent repeated sends.
 */

// Normalize accents for keyword matching
function normalizeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Check if keyword exists as a whole word in text
function matchesWholeWord(text: string, keyword: string): boolean {
  if (!text || !keyword) return false;
  const normalizedText = normalizeAccents(text);
  const normalizedKeyword = normalizeAccents(keyword);
  const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
  return regex.test(normalizedText);
}

interface KeywordHandlerPayload {
  user_id?: string;
  admin_instancia_id?: string;
  phone: string;
  message_text: string;
  chat_id?: string;
}

function getLast8Digits(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-8);
}

// Check if cooldown period has passed
function isCooldownActive(lastSentAt: string | null, cooldownHours: number): boolean {
  if (!lastSentAt || cooldownHours <= 0) return false;
  const lastSent = new Date(lastSentAt).getTime();
  const now = Date.now();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  return (now - lastSent) < cooldownMs;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[admin-keyword-handler] Starting...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: KeywordHandlerPayload = await req.json();
    const { user_id, admin_instancia_id, phone, message_text, chat_id } = body;

    if (!phone || !message_text || (!user_id && !admin_instancia_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let resolvedUserId = user_id || null;
    let notifConfig: any = null;
    let configError: any = null;

    if (user_id) {
      console.log(`[admin-keyword-handler] Processing (user mode) for user ${user_id}, phone: ${phone}, text: "${message_text.substring(0, 50)}..."`);

      const res = await supabase
        .from('admin_client_notifications')
        .select(`
          *,
          admin_notification_instances:admin_instancia_id (
            id,
            base_url,
            api_key,
            is_active
          )
        `)
        .eq('user_id', user_id)
        .maybeSingle();

      notifConfig = res.data;
      configError = res.error;
    } else {
      console.log(`[admin-keyword-handler] Processing (admin instance mode) for admin_instancia_id ${admin_instancia_id}, phone: ${phone}, chat_id: ${chat_id || 'none'}, text: "${message_text.substring(0, 50)}..."`);

      // Query keyword-enabled configs. If chat_id is a group, also include configs 
      // where admin_instancia_id is null (fallback scenario) by filtering by destination_value.
      const isGroupLookup = chat_id ? chat_id.endsWith('@g.us') : false;
      
      let query = supabase
        .from('admin_client_notifications')
        .select(`
          *,
          admin_notification_instances:admin_instancia_id (
            id,
            base_url,
            api_key,
            is_active
          )
        `)
        .eq('keyword_enabled', true);
      
      if (isGroupLookup && chat_id) {
        // For groups: match by destination_value (group ID) regardless of admin_instancia_id
        query = query.eq('destination_type', 'group').eq('destination_value', chat_id);
      } else {
        // For direct messages: match by admin_instancia_id
        query = query.eq('admin_instancia_id', admin_instancia_id);
      }
      
      const res = await query.limit(250);

      if (res.error) {
        configError = res.error;
      } else {
        const incomingLast8 = getLast8Digits(phone);
        const isGroupMessage = chat_id ? chat_id.endsWith('@g.us') : false;

        const matched = (res.data || []).find((c: any) => {
          if (!c?.destination_value) return false;

          // Match by group ID when message comes from a group
          if (isGroupMessage && c.destination_type === 'group') {
            return c.destination_value === chat_id;
          }

          // Match by phone number for direct messages
          if (!isGroupMessage && c.destination_type === 'number') {
            return getLast8Digits(c.destination_value) === incomingLast8;
          }

          return false;
        });

        if (!matched) {
          console.log(`[admin-keyword-handler] No notification config matched (isGroup=${isGroupMessage}, chat_id=${chat_id}, phone_last8=${incomingLast8})`);
          return new Response(
            JSON.stringify({ success: false, matched: false, reason: 'No config matched' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        notifConfig = matched;
        resolvedUserId = matched.user_id;
      }
    }

    if (configError) {
      console.error('[admin-keyword-handler] Error fetching config:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch config' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!notifConfig) {
      console.log('[admin-keyword-handler] No notification config found for user');
      return new Response(
        JSON.stringify({ success: false, matched: false, reason: 'No config found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if keyword feature is enabled
    if (!notifConfig.keyword_enabled) {
      console.log('[admin-keyword-handler] Keywords not enabled for user');
      return new Response(
        JSON.stringify({ success: false, matched: false, reason: 'Keywords not enabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let adminInstance = notifConfig.admin_notification_instances;
    
    // If admin_notification_instances join returned null (admin_instancia_id was null in config),
    // try to load the instance using the admin_instancia_id passed in the request
    if ((!adminInstance || !adminInstance.is_active) && admin_instancia_id) {
      console.log(`[admin-keyword-handler] Config has no linked admin instance, loading from request param: ${admin_instancia_id}`);
      const { data: fallbackInstance } = await supabase
        .from('admin_notification_instances')
        .select('id, base_url, api_key, is_active')
        .eq('id', admin_instancia_id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (fallbackInstance) {
        adminInstance = fallbackInstance;
        console.log(`[admin-keyword-handler] Using fallback admin instance: ${fallbackInstance.id}`);
      }
    }
    
    if (!adminInstance || !adminInstance.is_active) {
      console.log('[admin-keyword-handler] No active admin instance configured');
      return new Response(
        JSON.stringify({ success: false, matched: false, reason: 'No admin instance configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const keywordBalance = notifConfig.keyword_balance || 'saldo';
    const keywordReport = notifConfig.keyword_report || 'relatorio';
    const cooldownHours = notifConfig.keyword_cooldown_hours ?? 1;

    let matchedKeyword: 'balance' | 'report' | null = null;

    // Check for balance keyword
    if (matchesWholeWord(message_text, keywordBalance)) {
      matchedKeyword = 'balance';
      console.log(`[admin-keyword-handler] Matched balance keyword: "${keywordBalance}"`);
    }
    // Check for report keyword
    else if (matchesWholeWord(message_text, keywordReport)) {
      matchedKeyword = 'report';
      console.log(`[admin-keyword-handler] Matched report keyword: "${keywordReport}"`);
    }

    if (!matchedKeyword) {
      console.log('[admin-keyword-handler] No keyword matched');
      return new Response(
        JSON.stringify({ success: true, matched: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No cooldown for keyword triggers - always respond when triggered

    // Get the destination: group ID or phone number
    let destinationPhone = phone;
    if (notifConfig.destination_type === 'group' && notifConfig.destination_value) {
      destinationPhone = notifConfig.destination_value;
    } else if (notifConfig.destination_type === 'number' && notifConfig.destination_value) {
      destinationPhone = notifConfig.destination_value;
    }

    // Prepare the response message based on keyword type
    let responseMessage = '';

    if (matchedKeyword === 'balance') {
      // Fetch Meta Ads balance for this user
      console.log('[admin-keyword-handler] Fetching Meta Ads balance...');
      
      try {
        // Get user's Facebook Ad Account (most recently synced)
        const { data: adAccount } = await supabase
          .from('facebook_ad_accounts')
          .select('ad_account_id, account_name, account_type, currency_type, currency_spread, manual_funds_balance, status')
          .eq('user_id', resolvedUserId)
          .eq('status', 'connected')
          .order('last_sync_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let saldoDetalhado = '';

        if (!adAccount) {
          saldoDetalhado = '❌ Nenhuma conta de anúncios configurada.';
        } else {
          // Get user's Facebook token from facebook_config table
          const { data: fbConfig } = await supabase
            .from('facebook_config')
            .select('access_token')
            .eq('user_id', resolvedUserId)
            .maybeSingle();

          if (!fbConfig?.access_token) {
            saldoDetalhado = '⚠️ Token do Meta Ads não configurado.';
          } else {
            try {
              const normalizedAccountId = adAccount.ad_account_id.startsWith('act_') 
                ? adAccount.ad_account_id 
                : `act_${adAccount.ad_account_id}`;
              
              const fbResponse = await fetch(
                `https://graph.facebook.com/v22.0/${normalizedAccountId}?fields=name,balance,spend_cap,is_prepay_account,currency,amount_spent&access_token=${fbConfig.access_token}`
              );
              
              if (fbResponse.ok) {
                const fbData = await fbResponse.json();
                
                if (fbData.error) {
                  console.error('[admin-keyword-handler] FB API error:', fbData.error);
                  saldoDetalhado = '⚠️ Erro ao consultar Meta Ads.';
                } else {
                  // Calculate balance based on account type
                  const isPrepaid = adAccount.account_type === 'prepaid' || fbData.is_prepay_account;
                  const balanceCents = fbData.balance ? parseInt(String(fbData.balance)) : 0;
                  const spendCapCents = fbData.spend_cap ? parseInt(String(fbData.spend_cap)) : 0;
                  const amountSpentCents = fbData.amount_spent ? parseInt(String(fbData.amount_spent)) : 0;

                  let rawBalance = balanceCents / 100;
                  let spendCap = spendCapCents / 100;
                  let amountSpent = amountSpentCents / 100;

                  let displayBalance: number;
                  if (isPrepaid) {
                    if (spendCap > 0) {
                      displayBalance = spendCap - amountSpent;
                    } else {
                      displayBalance = rawBalance;
                    }
                  } else {
                    // Pós-pago: usar manual_funds_balance se disponível
                    if (adAccount.manual_funds_balance && adAccount.manual_funds_balance > 0) {
                      displayBalance = adAccount.manual_funds_balance - rawBalance;
                    } else {
                      displayBalance = -rawBalance; // Valor devido
                    }
                  }

                  // Convert if USD account
                  if (adAccount.currency_type === 'USD') {
                    let exchangeRate = 5.37; // fallback
                    try {
                      const erResponse = await fetch('https://open.er-api.com/v6/latest/USD');
                      if (erResponse.ok) {
                        const erData = await erResponse.json();
                        if (erData?.rates?.BRL) {
                          exchangeRate = erData.rates.BRL;
                        }
                      }
                    } catch (e) {
                      console.log('[admin-keyword-handler] Exchange rate fallback');
                    }
                    
                    const spreadMultiplier = 1 + ((adAccount.currency_spread || 0) / 100);
                    const effectiveRate = exchangeRate * spreadMultiplier;
                    displayBalance = displayBalance * effectiveRate;
                    console.log(`[admin-keyword-handler] USD conversion: rate=${exchangeRate}, spread=${adAccount.currency_spread}%, effective=${effectiveRate}`);
                  }

                  const formattedBalance = displayBalance.toLocaleString('pt-BR', { 
                    style: 'currency', 
                    currency: 'BRL' 
                  });
                  
                  saldoDetalhado = `• ${adAccount.account_name || normalizedAccountId}: ${formattedBalance}`;
                  console.log(`[admin-keyword-handler] Balance: ${displayBalance} (isPrepaid=${isPrepaid})`);
                }
              } else {
                const errorText = await fbResponse.text();
                console.error('[admin-keyword-handler] FB API response error:', errorText);
                saldoDetalhado = '⚠️ Erro ao consultar Meta Ads.';
              }
            } catch (err) {
              console.error('[admin-keyword-handler] Error fetching balance:', err);
              saldoDetalhado = '⚠️ Não foi possível obter o saldo.';
            }
          }
        }

        // Use custom message template or default
        const messageTemplate = notifConfig.keyword_balance_message || '💰 *Saldo Meta Ads*\n\n{saldo_detalhado}';
        responseMessage = messageTemplate.replace('{saldo_detalhado}', saldoDetalhado);

      } catch (err) {
        console.error('[admin-keyword-handler] Error fetching balance:', err);
        responseMessage = '❌ Erro ao consultar o saldo. Tente novamente mais tarde.';
      }
    } else if (matchedKeyword === 'report') {
      // Generate report with Meta Ads data
      console.log('[admin-keyword-handler] Generating report...');

      try {
        const reportPeriod = parseInt(notifConfig.keyword_report_period || notifConfig.campaign_report_period || '7');
        
        // Use Brasília timezone (UTC-3) for date calculations
        const BRASILIA_OFFSET = -3 * 60; // -3 hours in minutes
        const nowUtc = new Date();
        const nowBrasilia = new Date(nowUtc.getTime() + (BRASILIA_OFFSET + nowUtc.getTimezoneOffset()) * 60 * 1000);
        
        const endDate = new Date(nowBrasilia);
        const startDate = new Date(nowBrasilia);
        startDate.setDate(startDate.getDate() - reportPeriod);

        // Format dates for display (DD/MM/YYYY) using Brasília date
        const formatDate = (d: Date) => {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}/${month}/${year}`;
        };
        // Format dates for API (YYYY-MM-DD)
        const formatDateISO = (d: Date) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        console.log(`[admin-keyword-handler] Report dates (Brasília): ${formatDate(startDate)} to ${formatDate(endDate)}`);

        // Get user's Facebook config
        const { data: fbConfig } = await supabase
          .from('facebook_config')
          .select('access_token')
          .eq('user_id', resolvedUserId)
          .maybeSingle();

        // Get user's ad accounts
        const { data: adAccounts } = await supabase
          .from('facebook_ad_accounts')
          .select('ad_account_id, currency_type, currency_spread')
          .eq('user_id', resolvedUserId)
          .eq('status', 'connected');

        let gasto = 0;
        let conversas = 0;
        let cliques = 0;
        let impressoes = 0;
        let alcance = 0;
        let exchangeRate = 1;

        if (fbConfig?.access_token && adAccounts?.length) {
          // Check if any account is USD and get exchange rate
          const hasUsdAccount = adAccounts.some(a => a.currency_type === 'USD');
          if (hasUsdAccount) {
            try {
              const erResponse = await fetch('https://open.er-api.com/v6/latest/USD');
              if (erResponse.ok) {
                const erData = await erResponse.json();
                if (erData?.rates?.BRL) {
                  exchangeRate = erData.rates.BRL;
                }
              }
            } catch (e) {
              exchangeRate = 5.37; // fallback
            }
          }

          const timeRangeValue = JSON.stringify({ 
            since: formatDateISO(startDate), 
            until: formatDateISO(endDate) 
          });
          
          for (const account of adAccounts) {
            try {
              const normalizedAccountId = account.ad_account_id.startsWith('act_') 
                ? account.ad_account_id 
                : `act_${account.ad_account_id}`;
              
              const insightsUrl = `https://graph.facebook.com/v22.0/${normalizedAccountId}/insights?fields=spend,actions,clicks,impressions,reach&time_range=${encodeURIComponent(timeRangeValue)}&access_token=${fbConfig.access_token}`;
              
              console.log(`[admin-keyword-handler] Fetching insights for ${normalizedAccountId}`);
              const response = await fetch(insightsUrl);
              
              if (response.ok) {
                const data = await response.json();
                const insights = data.data?.[0];
                
                if (insights) {
                  let accountSpend = parseFloat(insights.spend || '0');
                  
                  // Convert USD to BRL if needed
                  if (account.currency_type === 'USD') {
                    const spreadMultiplier = 1 + ((account.currency_spread || 0) / 100);
                    const effectiveRate = exchangeRate * spreadMultiplier;
                    accountSpend = accountSpend * effectiveRate;
                  }
                  
                  gasto += accountSpend;
                  cliques += parseInt(insights.clicks || '0');
                  impressoes += parseInt(insights.impressions || '0');
                  alcance += parseInt(insights.reach || '0');
                  
                  // Count messaging_conversation_started actions
                  const actions = insights.actions || [];
                  const messagingActions = [
                    'onsite_conversion.messaging_conversation_started_7d',
                    'onsite_conversion.messaging_first_reply',
                    'messaging_conversation_started_7d'
                  ];
                  
                  for (const actionType of messagingActions) {
                    const convAction = actions.find((a: any) => a.action_type === actionType);
                    if (convAction) {
                      conversas += parseInt(convAction.value || '0');
                      break;
                    }
                  }
                  
                  console.log(`[admin-keyword-handler] Account ${normalizedAccountId}: spend=${accountSpend}, clicks=${insights.clicks}, impressions=${insights.impressions}`);
                }
              } else {
                const errorText = await response.text();
                console.error(`[admin-keyword-handler] Insights error for ${normalizedAccountId}:`, errorText);
              }
            } catch (err) {
              console.error(`[admin-keyword-handler] Error fetching insights for ${account.ad_account_id}:`, err);
            }
          }
        }

        const custoConversa = conversas > 0 ? (gasto / conversas).toFixed(2) : '0.00';
        const cpc = cliques > 0 ? (gasto / cliques).toFixed(2) : '0.00';
        const cpm = impressoes > 0 ? ((gasto / impressoes) * 1000).toFixed(2) : '0.00';
        const ctr = impressoes > 0 ? ((cliques / impressoes) * 100).toFixed(2) : '0.00';

        console.log(`[admin-keyword-handler] Report totals: gasto=${gasto}, conversas=${conversas}, cliques=${cliques}, impressoes=${impressoes}`);

        // Use custom message template or default
        const messageTemplate = notifConfig.keyword_report_message || `📊 *Relatório de Campanhas*

Período: {data_inicio} a {data_fim}

🔹 *Gasto:* R$ {gasto}
🔹 *Leads:* {conversas}
🔹 *Custo por Lead:* R$ {custo_conversa}
🔹 *Cliques:* {cliques}
🔹 *CPC:* R$ {cpc}
🔹 *Impressões:* {impressoes}
🔹 *Alcance:* {alcance}`;

        responseMessage = messageTemplate
          .replace('{data_inicio}', formatDate(startDate))
          .replace('{data_fim}', formatDate(endDate))
          .replace('{periodo_dias}', String(reportPeriod))
          .replace('{gasto}', gasto.toFixed(2))
          .replace('{conversas}', String(conversas))
          .replace('{custo_conversa}', custoConversa)
          .replace('{cliques}', String(cliques))
          .replace('{cpc}', cpc)
          .replace('{cpm}', cpm)
          .replace('{ctr}', ctr)
          .replace('{impressoes}', impressoes.toLocaleString('pt-BR'))
          .replace('{alcance}', alcance.toLocaleString('pt-BR'));

      } catch (err) {
        console.error('[admin-keyword-handler] Error generating report:', err);
        responseMessage = '❌ Erro ao gerar relatório. Tente novamente mais tarde.';
      }
    }

    // Send the response message via the admin's WhatsApp instance
    console.log(`[admin-keyword-handler] Sending response to ${destinationPhone}...`);
    
    const normalizedBaseUrl = adminInstance.base_url.replace(/\/+$/, '');
    
    const sendResponse = await fetch(`${normalizedBaseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': adminInstance.api_key,
      },
      body: JSON.stringify({
        number: destinationPhone,
        text: responseMessage,
      }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error(`[admin-keyword-handler] Failed to send message: ${errorText}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send response message', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-keyword-handler] Response sent successfully!`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        matched: true, 
        keyword: matchedKeyword, 
        destination: destinationPhone,
        message_sent: true 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[admin-keyword-handler] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});