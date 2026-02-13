import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_ADS_API_VERSION = 'v19';
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

interface GoogleAdsConfig {
  developer_token: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token?: string;
  token_expires_at?: string;
}

async function refreshAccessToken(config: GoogleAdsConfig): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token refresh error:', error);
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return response.json();
}

async function getValidAccessToken(
  supabaseClient: any,
  userId: string,
  config: GoogleAdsConfig
): Promise<string> {
  // Check if current token is still valid
  if (config.access_token && config.token_expires_at) {
    const expiresAt = new Date(config.token_expires_at);
    const now = new Date();
    // Add 5 minute buffer
    if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
      return config.access_token;
    }
  }

  // Refresh the token
  console.log('Refreshing access token...');
  const tokenData = await refreshAccessToken(config);
  
  // Calculate expiration time
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  // Update in database
  await supabaseClient
    .from('google_ads_config')
    .update({
      access_token: tokenData.access_token,
      token_expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);

  return tokenData.access_token;
}

async function makeGoogleAdsRequest(
  accessToken: string,
  developerToken: string,
  customerId: string,
  query: string
): Promise<any> {
  // Remove hyphens from customer ID
  const cleanCustomerId = customerId.replace(/-/g, '');
  
  const response = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers/${cleanCustomerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Google Ads API error:', error);
    throw new Error(`Google Ads API error: ${error}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid token');
    }

    const { action, ...params } = await req.json();
    console.log(`Google Ads API - Action: ${action}`);

    switch (action) {
      case 'test_connection': {
        const { developer_token, client_id, client_secret, refresh_token } = params;

        // Try to get an access token
        const tokenData = await refreshAccessToken({
          developer_token,
          client_id,
          client_secret,
          refresh_token,
        });

        // Validate using Google Ads API - list accessible customers
        const customersResponse = await fetch(
          `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
          {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'developer-token': developer_token,
            },
          }
        );

        if (!customersResponse.ok) {
          const errorText = await customersResponse.text();
          console.error('Google Ads API validation error:', errorText);
          throw new Error(`Falha na validação: ${errorText}`);
        }

        const customersData = await customersResponse.json();
        const customerCount = customersData.resourceNames?.length || 0;

        return new Response(
          JSON.stringify({
            success: true,
            message: `Conexão válida! ${customerCount} conta(s) acessível(is).`,
            customers: customersData.resourceNames || [],
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_accessible_customers': {
        // Get config from database
        const { data: config, error: configError } = await supabaseClient
          .from('google_ads_config')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (configError || !config) {
          throw new Error('Google Ads not configured');
        }

        const accessToken = await getValidAccessToken(supabaseClient, user.id, config);

        // List accessible customers
        const response = await fetch(
          `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'developer-token': config.developer_token,
            },
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to list customers: ${error}`);
        }

        const data = await response.json();
        
        return new Response(
          JSON.stringify({ success: true, customers: data.resourceNames || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_account_info': {
        const { customer_id } = params;

        // Get config from database
        const { data: config, error: configError } = await supabaseClient
          .from('google_ads_config')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (configError || !config) {
          throw new Error('Google Ads not configured');
        }

        const accessToken = await getValidAccessToken(supabaseClient, user.id, config);
        const cleanCustomerId = customer_id.replace(/-/g, '');

        // Get customer info using GAQL query via searchStream
        const query = `SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1`;
        
        const response = await fetch(
          `${GOOGLE_ADS_API_BASE}/customers/${cleanCustomerId}/googleAds:searchStream`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'developer-token': config.developer_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to get account info: ${error}`);
        }

        const data = await response.json();
        let accountInfo = { id: cleanCustomerId, name: '', currency: '' };
        
        if (data && Array.isArray(data) && data[0]?.results?.[0]?.customer) {
          const customer = data[0].results[0].customer;
          accountInfo = {
            id: customer.id || cleanCustomerId,
            name: customer.descriptiveName || '',
            currency: customer.currencyCode || '',
          };
        }

        return new Response(
          JSON.stringify({ success: true, account: accountInfo }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_spend': {
        const { customer_id, date_start, date_end } = params;

        // Get config from database
        const { data: config, error: configError } = await supabaseClient
          .from('google_ads_config')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (configError || !config) {
          throw new Error('Google Ads not configured');
        }

        const accessToken = await getValidAccessToken(supabaseClient, user.id, config);

        // GAQL query for spend metrics
        const query = `
          SELECT
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions
          FROM customer
          WHERE segments.date BETWEEN '${date_start}' AND '${date_end}'
        `;

        const data = await makeGoogleAdsRequest(
          accessToken,
          config.developer_token,
          customer_id,
          query
        );

        // Parse response - cost_micros needs to be divided by 1,000,000
        let totalSpend = 0;
        let totalImpressions = 0;
        let totalClicks = 0;
        let totalConversions = 0;

        if (data && Array.isArray(data)) {
          for (const batch of data) {
            if (batch.results) {
              for (const result of batch.results) {
                if (result.metrics) {
                  totalSpend += (result.metrics.costMicros || 0) / 1000000;
                  totalImpressions += result.metrics.impressions || 0;
                  totalClicks += result.metrics.clicks || 0;
                  totalConversions += result.metrics.conversions || 0;
                }
              }
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            metrics: {
              spend: totalSpend,
              impressions: totalImpressions,
              clicks: totalClicks,
              conversions: totalConversions,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_campaigns': {
        const { customer_id, date_start, date_end } = params;

        // Get config from database
        const { data: config, error: configError } = await supabaseClient
          .from('google_ads_config')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (configError || !config) {
          throw new Error('Google Ads not configured');
        }

        const accessToken = await getValidAccessToken(supabaseClient, user.id, config);

        // GAQL query for campaigns
        const query = `
          SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions
          FROM campaign
          WHERE segments.date BETWEEN '${date_start}' AND '${date_end}'
          ORDER BY metrics.cost_micros DESC
          LIMIT 50
        `;

        const data = await makeGoogleAdsRequest(
          accessToken,
          config.developer_token,
          customer_id,
          query
        );

        const campaigns: any[] = [];
        if (data && Array.isArray(data)) {
          for (const batch of data) {
            if (batch.results) {
              for (const result of batch.results) {
                campaigns.push({
                  id: result.campaign?.id,
                  name: result.campaign?.name,
                  status: result.campaign?.status,
                  spend: (result.metrics?.costMicros || 0) / 1000000,
                  impressions: result.metrics?.impressions || 0,
                  clicks: result.metrics?.clicks || 0,
                  conversions: result.metrics?.conversions || 0,
                });
              }
            }
          }
        }

        return new Response(
          JSON.stringify({ success: true, campaigns }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error('Google Ads API error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
