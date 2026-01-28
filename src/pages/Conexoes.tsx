import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Link2, CheckCircle2, XCircle, Eye, EyeOff, Loader2, RefreshCw, Plus, Trash2, Bot, Database, ChevronDown, ChevronRight, Crosshair, Instagram, Mic } from "lucide-react";
import { MetaIcon } from "@/components/icons/MetaIcon";
import GoogleAdsIcon from "@/components/icons/GoogleAdsIcon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MetaPixelConfig } from "@/components/configuracoes/MetaPixelConfig";
import { GoogleCalendarConfig } from "@/components/configuracoes/GoogleCalendarConfig";
import { InstagramConfigTab } from "@/components/instagram/InstagramConfigTab";
interface LinkedAdAccount {
  id: string;
  ad_account_id: string;
  account_name: string | null;
  account_type: string | null;
  currency_type: string | null;
  currency_spread: number | null;
  is_prepay_account: boolean | null;
  manual_funds_balance: number | null;
}
interface LinkedGoogleAdsAccount {
  id: string;
  customer_id: string;
  account_name: string | null;
  currency: string | null;
  last_balance: number | null;
  last_spend: number | null;
  status: string | null;
}
export default function Conexoes() {
  const {
    user
  } = useAuth();
  const {
    toast
  } = useToast();

  // ===== Meta/Facebook Ads State =====
  const [hasMetaToken, setHasMetaToken] = useState(false);
  const [loadingMetaConfig, setLoadingMetaConfig] = useState(true);
  const [showMetaToken, setShowMetaToken] = useState(false);
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [newMetaToken, setNewMetaToken] = useState("");
  const [savingMetaToken, setSavingMetaToken] = useState(false);
  const [testingMeta, setTestingMeta] = useState(false);
  const [metaTestResult, setMetaTestResult] = useState<{
    success: boolean;
    message: string;
    userName?: string;
  } | null>(null);

  // ===== Ad Accounts State =====
  const [linkedAdAccounts, setLinkedAdAccounts] = useState<LinkedAdAccount[]>([]);
  const [newAccountId, setNewAccountId] = useState("");
  const [newAccountType, setNewAccountType] = useState<string>("prepaid");
  const [newAccountCurrency, setNewAccountCurrency] = useState<string>("BRL");
  const [newAccountSpread, setNewAccountSpread] = useState<string>("");
  const [addingAccount, setAddingAccount] = useState(false);

  // ===== Google Ads State =====
  const [hasGoogleAdsConfig, setHasGoogleAdsConfig] = useState(false);
  const [loadingGoogleAds, setLoadingGoogleAds] = useState(true);
  const [showGoogleAdsCredentials, setShowGoogleAdsCredentials] = useState(false);
  const [googleAdsDeveloperToken, setGoogleAdsDeveloperToken] = useState("");
  const [googleAdsClientId, setGoogleAdsClientId] = useState("");
  const [googleAdsClientSecret, setGoogleAdsClientSecret] = useState("");
  const [googleAdsRefreshToken, setGoogleAdsRefreshToken] = useState("");
  const [newGoogleAdsDeveloperToken, setNewGoogleAdsDeveloperToken] = useState("");
  const [newGoogleAdsClientId, setNewGoogleAdsClientId] = useState("");
  const [newGoogleAdsClientSecret, setNewGoogleAdsClientSecret] = useState("");
  const [newGoogleAdsRefreshToken, setNewGoogleAdsRefreshToken] = useState("");
  const [savingGoogleAds, setSavingGoogleAds] = useState(false);
  const [testingGoogleAds, setTestingGoogleAds] = useState(false);
  const [googleAdsTestResult, setGoogleAdsTestResult] = useState<{
    success: boolean;
    message: string;
    email?: string;
  } | null>(null);

  // ===== Google Ads Accounts State =====
  const [linkedGoogleAdsAccounts, setLinkedGoogleAdsAccounts] = useState<LinkedGoogleAdsAccount[]>([]);
  const [newGoogleCustomerId, setNewGoogleCustomerId] = useState("");
  const [addingGoogleAccount, setAddingGoogleAccount] = useState(false);

  // ===== WhatsApp/UAZapi State (kept for legacy compatibility) =====
  const [loadingWhatsAppConfig, setLoadingWhatsAppConfig] = useState(true);
  const [whatsAppInstanciaId, setWhatsAppInstanciaId] = useState<string | null>(null);
  const [loadingDisparosInstancias, setLoadingDisparosInstancias] = useState(true);

  // ===== OpenAI State =====
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [loadingOpenAI, setLoadingOpenAI] = useState(true);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [openAIKey, setOpenAIKey] = useState("");
  const [newOpenAIKey, setNewOpenAIKey] = useState("");
  const [savingOpenAI, setSavingOpenAI] = useState(false);
  const [testingOpenAI, setTestingOpenAI] = useState(false);
  const [removingOpenAI, setRemovingOpenAI] = useState(false);
  const [openAITestResult, setOpenAITestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // ===== Apify State =====
  const [hasApifyKey, setHasApifyKey] = useState(false);
  const [loadingApify, setLoadingApify] = useState(true);
  const [showApifyKey, setShowApifyKey] = useState(false);
  const [apifyApiKey, setApifyApiKey] = useState("");
  const [newApifyKey, setNewApifyKey] = useState("");
  const [savingApify, setSavingApify] = useState(false);
  const [testingApify, setTestingApify] = useState(false);
  const [apifyTestResult, setApifyTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // ===== Fireflies State =====
  const [hasFirefliesKey, setHasFirefliesKey] = useState(false);
  const [loadingFireflies, setLoadingFireflies] = useState(true);
  const [showFirefliesKey, setShowFirefliesKey] = useState(false);
  const [firefliesApiKey, setFirefliesApiKey] = useState("");
  const [newFirefliesKey, setNewFirefliesKey] = useState("");
  const [savingFireflies, setSavingFireflies] = useState(false);
  const [testingFireflies, setTestingFireflies] = useState(false);
  const [firefliesTestResult, setFirefliesTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // ===== Collapsible States (default collapsed) =====
  const [metaOpen, setMetaOpen] = useState(false);
  const [googleAdsOpen, setGoogleAdsOpen] = useState(false);
  const [openAIOpen, setOpenAIOpen] = useState(false);
  const [apifyOpen, setApifyOpen] = useState(false);
  const [firefliesOpen, setFirefliesOpen] = useState(false);
  const [metaPixelOpen, setMetaPixelOpen] = useState(false);
  const [instagramOpen, setInstagramOpen] = useState(false);
  const [googleCalendarOpen, setGoogleCalendarOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadMetaConfig();
      loadWhatsAppConfig();
      loadLinkedAdAccounts();
      loadGoogleAdsConfig();
      loadLinkedGoogleAdsAccounts();
      checkOpenAIConfig();
      loadApifyConfig();
      loadFirefliesConfig();
      setLoadingDisparosInstancias(false);
    }
  }, [user]);

  // ===== OpenAI Functions =====
  const checkOpenAIConfig = async () => {
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("save-openai-key", {
        body: {
          action: "check"
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (!response.error && response.data?.configured) {
        setHasOpenAIKey(true);
        setOpenAIKey("sk-••••••••••••••••••••••••••••••••");
      }
    } catch (error) {
      console.error("Error checking OpenAI config:", error);
    } finally {
      setLoadingOpenAI(false);
    }
  };
  const validateAndSaveOpenAIKey = async (keyOverride?: string) => {
    const keyToSave = keyOverride?.trim() || openAIKey.trim();
    if (!keyToSave) {
      toast({
        title: "Erro",
        description: "Por favor, insira a API Key",
        variant: "destructive"
      });
      return;
    }
    setSavingOpenAI(true);
    try {
      const {
        data: session
      } = await supabase.auth.getSession();

      // Use the "save" action which validates AND saves the key
      const response = await supabase.functions.invoke("save-openai-key", {
        body: {
          action: "save",
          api_key: keyToSave
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (response.error) {
        throw new Error(response.error.message);
      }
      if (!response.data?.success) {
        setOpenAITestResult({
          success: false,
          message: response.data?.error || "API Key inválida"
        });
        toast({
          title: "API Key inválida",
          description: response.data?.error || "Verifique a chave e tente novamente",
          variant: "destructive"
        });
        return;
      }

      // Key is valid and saved
      setHasOpenAIKey(true);
      setOpenAIKey("sk-••••••••••••••••••••••••••••••••");
      setNewOpenAIKey("");
      setOpenAITestResult({
        success: true,
        message: response.data.message
      });
      toast({
        title: "API Key salva!",
        description: "A chave foi validada e está ativa."
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao salvar API Key";
      setOpenAITestResult({
        success: false,
        message: errorMessage
      });
      toast({
        title: "Erro ao salvar",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setSavingOpenAI(false);
    }
  };
  const testOpenAIConnection = async () => {
    // Se há uma nova chave digitada, salva primeiro e depois testa
    const keyToTest = newOpenAIKey.trim();
    if (keyToTest) {
      await validateAndSaveOpenAIKey(keyToTest);
      return;
    }
    
    // Se não há nova chave, apenas testa a existente
    if (!hasOpenAIKey) {
      toast({
        title: "Erro",
        description: "Nenhuma API Key configurada",
        variant: "destructive"
      });
      return;
    }
    
    setTestingOpenAI(true);
    setOpenAITestResult(null);
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("save-openai-key", {
        body: {
          action: "test"
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (response.error) {
        setOpenAITestResult({
          success: false,
          message: response.error.message || "Erro ao testar conexão"
        });
      } else if (!response.data?.success) {
        setOpenAITestResult({
          success: false,
          message: response.data?.error || "Erro ao testar conexão"
        });
      } else {
        setOpenAITestResult({
          success: true,
          message: response.data.message
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao testar conexão";
      setOpenAITestResult({
        success: false,
        message: errorMessage
      });
    } finally {
      setTestingOpenAI(false);
    }
  };
  const removeOpenAIKey = async () => {
    setRemovingOpenAI(true);
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("save-openai-key", {
        body: {
          action: "clear_info"
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      setHasOpenAIKey(false);
      setOpenAIKey("");
      setNewOpenAIKey("");
      setOpenAITestResult(null);
      toast({
        title: "Chave removida",
        description: response.data?.message || "API Key removida com sucesso."
      });
    } catch (error) {
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover a chave.",
        variant: "destructive"
      });
    } finally {
      setRemovingOpenAI(false);
    }
  };
  const loadApifyConfig = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("apify_config").select("*").eq("user_id", user?.id).single();
      if (!error && data) {
        setHasApifyKey(true);
        setApifyApiKey(data.api_key);
      }
    } catch (error) {
      console.error("Error loading Apify config:", error);
    } finally {
      setLoadingApify(false);
    }
  };
  const saveApifyConfig = async () => {
    const keyToSave = newApifyKey.trim() || apifyApiKey;
    if (!keyToSave) {
      toast({
        title: "Erro",
        description: "Por favor, insira a API Key",
        variant: "destructive"
      });
      return;
    }
    setSavingApify(true);
    try {
      const {
        error
      } = await supabase.from("apify_config").upsert({
        user_id: user?.id,
        api_key: keyToSave,
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      });
      if (error) throw error;
      setHasApifyKey(true);
      setApifyApiKey(keyToSave);
      setNewApifyKey("");
      toast({
        title: "Configuração salva!",
        description: "API Key do Apify configurada com sucesso"
      });
    } catch (error) {
      console.error("Error saving Apify config:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a configuração",
        variant: "destructive"
      });
    } finally {
      setSavingApify(false);
    }
  };

  const testApifyConnection = async () => {
    // Se há uma nova chave digitada, salva primeiro
    const keyToTest = newApifyKey.trim() || apifyApiKey;
    if (!keyToTest) {
      toast({
        title: "Erro",
        description: "Nenhuma API Key configurada",
        variant: "destructive"
      });
      return;
    }
    
    // Se tem nova chave, salvar primeiro
    if (newApifyKey.trim()) {
      await saveApifyConfig();
    }
    
    setTestingApify(true);
    setApifyTestResult(null);
    try {
      // Test with a simple Apify API call to validate the key
      const response = await fetch("https://api.apify.com/v2/users/me", {
        headers: {
          "Authorization": `Bearer ${keyToTest}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setApifyTestResult({
          success: true,
          message: `Conectado como ${data.data?.username || "usuário Apify"}`
        });
      } else {
        throw new Error("API Key inválida");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao testar conexão";
      setApifyTestResult({
        success: false,
        message: errorMessage
      });
    } finally {
      setTestingApify(false);
    }
  };

  // ===== Fireflies Functions =====
  const loadFirefliesConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("fireflies_config")
        .select("*")
        .eq("user_id", user?.id)
        .single();
      if (!error && data) {
        setHasFirefliesKey(true);
        setFirefliesApiKey(data.api_key);
      }
    } catch (error) {
      console.error("Error loading Fireflies config:", error);
    } finally {
      setLoadingFireflies(false);
    }
  };

  const saveFirefliesConfig = async () => {
    const keyToSave = newFirefliesKey.trim() || firefliesApiKey;
    if (!keyToSave) {
      toast({
        title: "Erro",
        description: "Por favor, insira a API Key",
        variant: "destructive"
      });
      return;
    }
    setSavingFireflies(true);
    try {
      const { error } = await supabase.from("fireflies_config").upsert({
        user_id: user?.id,
        api_key: keyToSave,
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      });
      if (error) throw error;
      setHasFirefliesKey(true);
      setFirefliesApiKey(keyToSave);
      setNewFirefliesKey("");
      toast({
        title: "Configuração salva!",
        description: "API Key do Fireflies configurada com sucesso"
      });
    } catch (error) {
      console.error("Error saving Fireflies config:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a configuração",
        variant: "destructive"
      });
    } finally {
      setSavingFireflies(false);
    }
  };

  const testFirefliesConnection = async () => {
    const keyToTest = newFirefliesKey.trim() || firefliesApiKey;
    if (!keyToTest) {
      toast({
        title: "Erro",
        description: "Nenhuma API Key configurada",
        variant: "destructive"
      });
      return;
    }
    
    if (newFirefliesKey.trim()) {
      await saveFirefliesConfig();
    }
    
    setTestingFireflies(true);
    setFirefliesTestResult(null);
    try {
      // Test with Fireflies GraphQL API
      const response = await fetch("https://api.fireflies.ai/graphql", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${keyToTest}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: `{ user { name email } }`
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.data?.user) {
          setFirefliesTestResult({
            success: true,
            message: `Conectado como ${data.data.user.name || data.data.user.email || "usuário Fireflies"}`
          });
        } else if (data.errors) {
          throw new Error(data.errors[0]?.message || "API Key inválida");
        } else {
          throw new Error("Resposta inválida da API");
        }
      } else {
        throw new Error("API Key inválida");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao testar conexão";
      setFirefliesTestResult({
        success: false,
        message: errorMessage
      });
    } finally {
      setTestingFireflies(false);
    }
  };

  // ===== Meta/Facebook Ads Functions =====
  const loadMetaConfig = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("facebook_config").select("access_token").eq("user_id", user?.id).single();
      if (!error && data?.access_token) {
        setHasMetaToken(true);
        setMetaAccessToken(data.access_token);
      }
    } catch (error) {
      console.error("Error loading Meta config:", error);
    } finally {
      setLoadingMetaConfig(false);
    }
  };
  const saveMetaToken = async (tokenOverride?: string) => {
    const tokenToSave = tokenOverride?.trim() || metaAccessToken.trim();
    if (!tokenToSave) {
      toast({
        title: "Erro",
        description: "Por favor, insira o Access Token",
        variant: "destructive"
      });
      return;
    }
    setSavingMetaToken(true);
    try {
      const {
        error
      } = await supabase.from("facebook_config").upsert({
        user_id: user?.id,
        access_token: tokenToSave,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      });
      if (error) throw error;

      // Testar conexão
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("facebook-ads-api", {
        body: {
          action: "test_connection"
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Token inválido");
      }
      setHasMetaToken(true);
      setMetaAccessToken(tokenToSave);
      setNewMetaToken("");
      setMetaTestResult({
        success: true,
        message: "Conectado com sucesso!",
        userName: response.data.user_name
      });
      toast({
        title: "Token salvo com sucesso!",
        description: `Conectado como ${response.data.user_name}`
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao salvar token";
      toast({
        title: "Erro ao salvar token",
        description: errorMessage,
        variant: "destructive"
      });
      setMetaTestResult({
        success: false,
        message: errorMessage
      });
    } finally {
      setSavingMetaToken(false);
    }
  };
  const testMetaConnection = async () => {
    // Se há um novo token digitado, salva primeiro e depois testa
    const tokenToTest = newMetaToken.trim();
    if (tokenToTest) {
      await saveMetaToken(tokenToTest);
      return;
    }
    
    if (!metaAccessToken) {
      toast({
        title: "Erro",
        description: "Nenhum token configurado",
        variant: "destructive"
      });
      return;
    }
    setTestingMeta(true);
    setMetaTestResult(null);
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("facebook-ads-api", {
        body: {
          action: "test_connection"
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Token inválido");
      }
      setMetaTestResult({
        success: true,
        message: "Conexão OK!",
        userName: response.data.user_name
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao testar conexão";
      setMetaTestResult({
        success: false,
        message: errorMessage
      });
    } finally {
      setTestingMeta(false);
    }
  };

  // ===== Ad Accounts Functions =====
  const loadLinkedAdAccounts = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("facebook_ad_accounts").select("id, ad_account_id, account_name, account_type, currency_type, currency_spread, is_prepay_account, manual_funds_balance").eq("user_id", user?.id).order("created_at", {
        ascending: false
      });
      if (!error && data) {
        setLinkedAdAccounts(data);
      }
    } catch (error) {
      console.error("Error loading ad accounts:", error);
    }
  };
  const addAdAccount = async () => {
    if (!newAccountId.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira o Ad Account ID",
        variant: "destructive"
      });
      return;
    }
    setAddingAccount(true);
    try {
      const normalizedId = newAccountId.startsWith("act_") ? newAccountId : `act_${newAccountId}`;

      // Verificar se já existe
      const exists = linkedAdAccounts.some(acc => acc.ad_account_id === normalizedId);
      if (exists) {
        toast({
          title: "Conta já vinculada",
          description: "Esta conta de anúncios já está vinculada",
          variant: "destructive"
        });
        return;
      }

      // Buscar dados da conta
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("facebook-ads-api", {
        body: {
          action: "get_account_info",
          ad_account_id: normalizedId,
          account_type: newAccountType
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Erro ao buscar conta");
      }

      // Atualizar o tipo de conta, moeda e spread no banco
      const spreadValue = newAccountSpread ? parseFloat(newAccountSpread.replace(",", ".")) : 0;
      await supabase.from("facebook_ad_accounts").update({
        account_type: newAccountType,
        currency_type: newAccountCurrency,
        currency_spread: spreadValue
      }).eq("ad_account_id", normalizedId).eq("user_id", user?.id);
      setNewAccountId("");
      setNewAccountType("prepaid");
      setNewAccountCurrency("BRL");
      setNewAccountSpread("");
      loadLinkedAdAccounts();
      toast({
        title: "Conta vinculada com sucesso!",
        description: `${response.data.data.name} foi adicionada como ${newAccountType === "prepaid" ? "Pré-pago" : "Pós-pago"} em ${newAccountCurrency}${spreadValue > 0 ? ` (+${spreadValue}% spread)` : ""}`
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao adicionar conta";
      toast({
        title: "Erro ao vincular conta",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setAddingAccount(false);
    }
  };
  const updateAccountType = async (accountId: string, adAccountId: string, type: string) => {
    try {
      const {
        error
      } = await supabase.from("facebook_ad_accounts").update({
        account_type: type
      }).eq("id", accountId).eq("user_id", user?.id);
      if (error) throw error;
      setLinkedAdAccounts(prev => prev.map(acc => acc.id === accountId ? {
        ...acc,
        account_type: type
      } : acc));
      toast({
        title: "Tipo de conta atualizado",
        description: `Conta definida como ${type === "prepaid" ? "Pré-pago" : "Pós-pago"}`
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o tipo de conta",
        variant: "destructive"
      });
    }
  };
  const updateAccountCurrency = async (accountId: string, currency: string) => {
    try {
      const {
        error
      } = await supabase.from("facebook_ad_accounts").update({
        currency_type: currency
      }).eq("id", accountId).eq("user_id", user?.id);
      if (error) throw error;
      setLinkedAdAccounts(prev => prev.map(acc => acc.id === accountId ? {
        ...acc,
        currency_type: currency
      } : acc));
      toast({
        title: "Moeda atualizada",
        description: `Moeda definida como ${currency === "BRL" ? "Real (BRL)" : "Dólar (USD)"}`
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar a moeda",
        variant: "destructive"
      });
    }
  };
  const updateAccountSpread = async (accountId: string, spread: number) => {
    try {
      const {
        error
      } = await supabase.from("facebook_ad_accounts").update({
        currency_spread: spread
      }).eq("id", accountId).eq("user_id", user?.id);
      if (error) throw error;
      setLinkedAdAccounts(prev => prev.map(acc => acc.id === accountId ? {
        ...acc,
        currency_spread: spread
      } : acc));
      toast({
        title: "Spread atualizado",
        description: `Spread definido como ${spread}%`
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o spread",
        variant: "destructive"
      });
    }
  };
  const updateAccountFundsBalance = async (accountId: string, fundsBalance: number | null) => {
    try {
      const {
        error
      } = await supabase.from("facebook_ad_accounts").update({
        manual_funds_balance: fundsBalance
      }).eq("id", accountId).eq("user_id", user?.id);
      if (error) throw error;
      setLinkedAdAccounts(prev => prev.map(acc => acc.id === accountId ? {
        ...acc,
        manual_funds_balance: fundsBalance
      } : acc));
      toast({
        title: "Fundos atualizado",
        description: fundsBalance ? `Fundos definido como ${fundsBalance}` : "Fundos removido"
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o saldo de fundos",
        variant: "destructive"
      });
    }
  };
  const removeAdAccount = async (accountId: string) => {
    try {
      const {
        error
      } = await supabase.from("facebook_ad_accounts").delete().eq("id", accountId).eq("user_id", user?.id);
      if (error) throw error;
      setLinkedAdAccounts(prev => prev.filter(acc => acc.id !== accountId));
      toast({
        title: "Conta removida",
        description: "A conta de anúncios foi desvinculada"
      });
    } catch (error) {
      toast({
        title: "Erro ao remover conta",
        description: "Não foi possível remover a conta",
        variant: "destructive"
      });
    }
  };

  // ===== WhatsApp/UAZapi Functions =====
  const loadWhatsAppConfig = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("uazapi_config").select("whatsapp_instancia_id").eq("user_id", user?.id).maybeSingle();
      if (!error && data?.whatsapp_instancia_id) {
        setWhatsAppInstanciaId(data.whatsapp_instancia_id);
      }
    } catch (error) {
      console.error("Error loading WhatsApp config:", error);
    } finally {
      setLoadingWhatsAppConfig(false);
    }
  };

  // ===== Google Ads Functions =====
  const loadGoogleAdsConfig = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("google_ads_config").select("*").eq("user_id", user?.id).single();
      if (!error && data) {
        setHasGoogleAdsConfig(true);
        setGoogleAdsDeveloperToken(data.developer_token);
        setGoogleAdsClientId(data.client_id);
        setGoogleAdsClientSecret(data.client_secret);
        setGoogleAdsRefreshToken(data.refresh_token);
      }
    } catch (error) {
      console.error("Error loading Google Ads config:", error);
    } finally {
      setLoadingGoogleAds(false);
    }
  };
  const loadLinkedGoogleAdsAccounts = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("google_ads_accounts").select("*").eq("user_id", user?.id).order("created_at", {
        ascending: false
      });
      if (!error && data) {
        setLinkedGoogleAdsAccounts(data);
      }
    } catch (error) {
      console.error("Error loading Google Ads accounts:", error);
    }
  };
  const saveGoogleAdsConfig = async () => {
    const devToken = newGoogleAdsDeveloperToken.trim() || googleAdsDeveloperToken;
    const clientId = newGoogleAdsClientId.trim() || googleAdsClientId;
    const clientSecret = newGoogleAdsClientSecret.trim() || googleAdsClientSecret;
    const refreshToken = newGoogleAdsRefreshToken.trim() || googleAdsRefreshToken;
    if (!devToken || !clientId || !clientSecret || !refreshToken) {
      toast({
        title: "Erro",
        description: "Preencha todas as credenciais",
        variant: "destructive"
      });
      return;
    }
    setSavingGoogleAds(true);
    try {
      // Test connection first
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("google-ads-api", {
        body: {
          action: "test_connection",
          developer_token: devToken,
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Credenciais inválidas");
      }

      // Save to database
      const {
        error
      } = await supabase.from("google_ads_config").upsert({
        user_id: user?.id,
        developer_token: devToken,
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      });
      if (error) throw error;
      setHasGoogleAdsConfig(true);
      setGoogleAdsDeveloperToken(devToken);
      setGoogleAdsClientId(clientId);
      setGoogleAdsClientSecret(clientSecret);
      setGoogleAdsRefreshToken(refreshToken);
      setNewGoogleAdsDeveloperToken("");
      setNewGoogleAdsClientId("");
      setNewGoogleAdsClientSecret("");
      setNewGoogleAdsRefreshToken("");
      setGoogleAdsTestResult({
        success: true,
        message: "Conectado com sucesso!",
        email: response.data.user?.email
      });
      toast({
        title: "Configuração salva!",
        description: `Conectado como ${response.data.user?.email || "usuário Google"}`
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao salvar configuração";
      toast({
        title: "Erro ao salvar",
        description: errorMessage,
        variant: "destructive"
      });
      setGoogleAdsTestResult({
        success: false,
        message: errorMessage
      });
    } finally {
      setSavingGoogleAds(false);
    }
  };
  const testGoogleAdsConnection = async () => {
    // Se há novas credenciais digitadas, salvar primeiro
    const hasNewCredentials = newGoogleAdsDeveloperToken.trim() || newGoogleAdsClientId.trim() || 
                              newGoogleAdsClientSecret.trim() || newGoogleAdsRefreshToken.trim();
    
    if (hasNewCredentials) {
      await saveGoogleAdsConfig();
      return;
    }
    
    if (!googleAdsDeveloperToken || !googleAdsClientId || !googleAdsClientSecret || !googleAdsRefreshToken) {
      toast({
        title: "Erro",
        description: "Nenhuma configuração salva",
        variant: "destructive"
      });
      return;
    }
    setTestingGoogleAds(true);
    setGoogleAdsTestResult(null);
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("google-ads-api", {
        body: {
          action: "test_connection",
          developer_token: googleAdsDeveloperToken,
          client_id: googleAdsClientId,
          client_secret: googleAdsClientSecret,
          refresh_token: googleAdsRefreshToken
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Erro ao testar conexão");
      }
      setGoogleAdsTestResult({
        success: true,
        message: "Conexão OK!",
        email: response.data.user?.email
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao testar conexão";
      setGoogleAdsTestResult({
        success: false,
        message: errorMessage
      });
    } finally {
      setTestingGoogleAds(false);
    }
  };
  const addGoogleAdsAccount = async () => {
    if (!newGoogleCustomerId.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira o Customer ID",
        variant: "destructive"
      });
      return;
    }
    setAddingGoogleAccount(true);
    try {
      // Format: XXX-XXX-XXXX or XXXXXXXXXX
      const customerId = newGoogleCustomerId.replace(/\D/g, "");

      // Check if already exists
      const exists = linkedGoogleAdsAccounts.some(acc => acc.customer_id.replace(/\D/g, "") === customerId);
      if (exists) {
        toast({
          title: "Conta já vinculada",
          description: "Este Customer ID já está vinculado",
          variant: "destructive"
        });
        return;
      }

      // Get account info
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("google-ads-api", {
        body: {
          action: "get_account_info",
          customer_id: customerId
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Erro ao buscar conta");
      }

      // Format customer ID as XXX-XXX-XXXX
      const formattedId = customerId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");

      // Save to database
      const {
        error
      } = await supabase.from("google_ads_accounts").insert({
        user_id: user?.id,
        customer_id: formattedId,
        account_name: response.data.account?.name || null,
        currency: response.data.account?.currency || "BRL",
        status: "connected"
      });
      if (error) throw error;
      setNewGoogleCustomerId("");
      loadLinkedGoogleAdsAccounts();
      toast({
        title: "Conta vinculada com sucesso!",
        description: `${response.data.account?.name || formattedId} foi adicionada`
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao adicionar conta";
      toast({
        title: "Erro ao vincular conta",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setAddingGoogleAccount(false);
    }
  };
  const removeGoogleAdsAccount = async (accountId: string) => {
    try {
      const {
        error
      } = await supabase.from("google_ads_accounts").delete().eq("id", accountId).eq("user_id", user?.id);
      if (error) throw error;
      setLinkedGoogleAdsAccounts(prev => prev.filter(acc => acc.id !== accountId));
      toast({
        title: "Conta removida",
        description: "A conta do Google Ads foi desvinculada"
      });
    } catch (error) {
      toast({
        title: "Erro ao remover conta",
        description: "Não foi possível remover a conta",
        variant: "destructive"
      });
    }
  };
  const isLoading = loadingMetaConfig || loadingWhatsAppConfig || loadingDisparosInstancias || loadingOpenAI || loadingApify || loadingGoogleAds;
  if (isLoading) {
    return <div className="space-y-6">
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>;
  }
  return <div className="space-y-6">
      {/* Meta/Facebook Ads Card */}
      <Collapsible open={metaOpen} onOpenChange={setMetaOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                    <MetaIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Meta Ads</CardTitle>
                    <CardDescription>
                      Configure o Access Token e vincule suas contas de anúncios
                    </CardDescription>
                  </div>
                </div>
                {metaOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
          {/* Access Token Section */}
          <div className="space-y-4">
            <div>
              <Label>Access Token</Label>
              <div className="flex gap-2 mt-1">
                <Input type={showMetaToken ? "text" : "password"} value={metaAccessToken} onChange={e => setMetaAccessToken(e.target.value)} placeholder="" className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => setShowMetaToken(!showMetaToken)}>
                  {showMetaToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={testMetaConnection} disabled={testingMeta}>
                {testingMeta ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Testar Conexão
              </Button>
              <Button onClick={() => saveMetaToken(metaAccessToken)} disabled={savingMetaToken}>
                {savingMetaToken ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>

            {metaTestResult && <div className={`p-3 rounded-lg border ${metaTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                <div className="flex items-center gap-2">
                  {metaTestResult.success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                  <span className={`text-sm ${metaTestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    {metaTestResult.message}
                    {metaTestResult.userName && ` - ${metaTestResult.userName}`}
                  </span>
                </div>
              </div>}
          </div>

          {/* Ad Accounts Section */}
          {hasMetaToken && <div className="border-t pt-4">
            <div className="mb-4">
              <Label className="text-base font-medium">Contas de Anúncios</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vincule suas contas para monitorar saldo e gastos
              </p>
            </div>
            
            {/* Formulário para adicionar conta */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label>Ad Account ID</Label>
                <Input placeholder="" value={newAccountId} onChange={e => setNewAccountId(e.target.value)} className="mt-1" />
              </div>
              <div className="w-[140px]">
                <Label>Tipo de Conta</Label>
                <Select value={newAccountType} onValueChange={setNewAccountType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prepaid">Pré-pago</SelectItem>
                    <SelectItem value="postpaid">Pós-pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[100px]">
                <Label>Moeda</Label>
                <Select value={newAccountCurrency} onValueChange={setNewAccountCurrency}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">R$ (BRL)</SelectItem>
                    <SelectItem value="USD">$ (USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newAccountCurrency === "USD" && (
                <div className="w-[90px]">
                  <Label>Spread %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="50"
                    placeholder="0.00"
                    value={newAccountSpread}
                    onChange={(e) => setNewAccountSpread(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
              <Button onClick={addAdAccount} disabled={addingAccount}>
                {addingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                    <Plus className="h-4 w-4 mr-2" />
                    Vincular
                  </>}
              </Button>
            </div>

            {/* Lista de contas vinculadas */}
            {linkedAdAccounts.length > 0 ? <div className="space-y-2 mt-4">
                {linkedAdAccounts.map(account => {
                  const accountType = account.account_type || (account.is_prepay_account ? "prepaid" : "postpaid");
                  const currencyType = account.currency_type || "BRL";
                  const currencySpread = account.currency_spread || 0;
                  const fundsBalance = account.manual_funds_balance;
                  return <div key={account.id} className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:pr-3 pr-10 border rounded-lg bg-muted/50 gap-3">
                      {/* Botão de excluir - mobile: canto superior direito, desktop: inline */}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeAdAccount(account.id)} 
                        className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive sm:hidden"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="flex-1 min-w-0">
                        {/* Desktop: nome + badges na mesma linha, ID abaixo */}
                        <div className="hidden sm:flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{account.account_name || "Conta sem nome"}</p>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {accountType === "prepaid" ? "Pré-pago" : "Pós-pago"}
                          </Badge>
                          <Badge variant={currencyType === "USD" ? "secondary" : "outline"} className="text-xs shrink-0">
                            {currencyType === "USD" ? "$ USD" : "R$ BRL"}
                          </Badge>
                          {currencyType === "USD" && currencySpread > 0 && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              +{currencySpread}% spread
                            </Badge>
                          )}
                        </div>
                        <p className="hidden sm:block text-xs text-muted-foreground font-mono truncate">{account.ad_account_id}</p>
                        
                        {/* Mobile: nome, ID, depois badges */}
                        <div className="sm:hidden">
                          <p className="font-medium text-sm truncate">{account.account_name || "Conta sem nome"}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate mb-2">{account.ad_account_id}</p>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-xs">
                              {accountType === "prepaid" ? "Pré-pago" : "Pós-pago"}
                            </Badge>
                            <Badge variant={currencyType === "USD" ? "secondary" : "outline"} className="text-xs">
                              {currencyType === "USD" ? "$ USD" : "R$ BRL"}
                            </Badge>
                            {currencyType === "USD" && currencySpread > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                +{currencySpread}% spread
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 sm:border-0 border-t pt-3 sm:pt-0">
                        <Select value={accountType} onValueChange={value => updateAccountType(account.id, account.ad_account_id, value)}>
                          <SelectTrigger className="w-[100px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="prepaid">Pré-pago</SelectItem>
                            <SelectItem value="postpaid">Pós-pago</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={currencyType} onValueChange={value => updateAccountCurrency(account.id, value)}>
                          <SelectTrigger className="w-[85px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BRL">R$ BRL</SelectItem>
                            <SelectItem value="USD">$ USD</SelectItem>
                          </SelectContent>
                        </Select>
                        {currencyType === "USD" && (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="50"
                            value={currencySpread}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              updateAccountSpread(account.id, Math.round(val * 100) / 100);
                            }}
                            className="w-[70px] h-8 text-xs"
                            placeholder="%"
                            title="Spread do cartão em %"
                          />
                        )}
                        {accountType === "postpaid" && (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={fundsBalance || ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseFloat(e.target.value) : null;
                              updateAccountFundsBalance(account.id, val);
                            }}
                            className="w-[90px] h-8 text-xs"
                            placeholder="Fundos"
                            title={`Saldo de fundos em ${currencyType}`}
                          />
                        )}
                        <Button variant="ghost" size="icon" onClick={() => removeAdAccount(account.id)} className="hidden sm:flex text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>;
                })}
              </div> : <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma conta vinculada. Adicione uma conta acima.
              </p>}
          </div>}
          </CardContent>
        </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Google Ads Card */}
      <Collapsible open={googleAdsOpen} onOpenChange={setGoogleAdsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-950 rounded-lg">
                    <GoogleAdsIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Google Ads</CardTitle>
                    <CardDescription>
                      Configure as credenciais e vincule suas contas do Google Ads
                    </CardDescription>
                  </div>
                </div>
                {googleAdsOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="grid gap-3">
              <div>
                <Label>Developer Token</Label>
                <Input type={showGoogleAdsCredentials ? "text" : "password"} value={googleAdsDeveloperToken} onChange={e => setGoogleAdsDeveloperToken(e.target.value)} placeholder="" className="font-mono text-sm mt-1" />
              </div>
              <div>
                <Label>Client ID (OAuth)</Label>
                <Input type={showGoogleAdsCredentials ? "text" : "password"} value={googleAdsClientId} onChange={e => setGoogleAdsClientId(e.target.value)} placeholder="" className="font-mono text-sm mt-1" />
              </div>
              <div>
                <Label>Client Secret (OAuth)</Label>
                <Input type={showGoogleAdsCredentials ? "text" : "password"} value={googleAdsClientSecret} onChange={e => setGoogleAdsClientSecret(e.target.value)} placeholder="" className="font-mono text-sm mt-1" />
              </div>
              <div>
                <Label>Refresh Token</Label>
                <Input type={showGoogleAdsCredentials ? "text" : "password"} value={googleAdsRefreshToken} onChange={e => setGoogleAdsRefreshToken(e.target.value)} placeholder="" className="font-mono text-sm mt-1" />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={testGoogleAdsConnection} disabled={testingGoogleAds}>
                {testingGoogleAds ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Testar Conexão
              </Button>
              <Button onClick={() => saveGoogleAdsConfig()} disabled={savingGoogleAds}>
                {savingGoogleAds ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>

            {googleAdsTestResult && <div className={`p-3 rounded-lg border ${googleAdsTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                <div className="flex items-center gap-2">
                  {googleAdsTestResult.success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                  <span className={`text-sm ${googleAdsTestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    {googleAdsTestResult.message}
                    {googleAdsTestResult.email && ` - ${googleAdsTestResult.email}`}
                  </span>
                </div>
              </div>}
          </div>
          </CardContent>
        </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Google Ads Accounts Section */}
      {hasGoogleAdsConfig && <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-950 rounded-lg">
                  <Link2 className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Contas de Anúncios Google</CardTitle>
                  <CardDescription>
                    Vincule suas contas do Google Ads para monitorar gastos
                  </CardDescription>
                </div>
              </div>
              <Badge variant="secondary" className="gap-1">
                {linkedGoogleAdsAccounts.length} conta{linkedGoogleAdsAccounts.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Formulário para adicionar conta */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label>Customer ID</Label>
                <Input placeholder="" value={newGoogleCustomerId} onChange={e => setNewGoogleCustomerId(e.target.value)} className="mt-1" />
              </div>
              <Button onClick={addGoogleAdsAccount} disabled={addingGoogleAccount}>
                {addingGoogleAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                    <Plus className="h-4 w-4 mr-2" />
                    Vincular
                  </>}
              </Button>
            </div>

            {/* Lista de contas vinculadas */}
            {linkedGoogleAdsAccounts.length > 0 ? <div className="space-y-2">
                {linkedGoogleAdsAccounts.map(account => <div key={account.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{account.account_name || "Conta sem nome"}</p>
                        <Badge variant="outline" className="text-xs">
                          {account.currency || "BRL"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{account.customer_id}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeGoogleAdsAccount(account.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>)}
              </div> : <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma conta vinculada. Adicione uma conta acima.
              </p>}
          </CardContent>
        </Card>}


      {/* OpenAI Card */}
      <Collapsible open={openAIOpen} onOpenChange={setOpenAIOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-950 rounded-lg">
                    <Bot className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">OpenAI</CardTitle>
                    <CardDescription>
                      Configure a API Key da OpenAI para relatórios de IA
                    </CardDescription>
                  </div>
                </div>
                {openAIOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label>API Key</Label>
              <div className="flex gap-2 mt-1">
                <Input type={showOpenAIKey ? "text" : "password"} value={openAIKey} onChange={e => setOpenAIKey(e.target.value)} placeholder="" className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => setShowOpenAIKey(!showOpenAIKey)}>
                  {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={testOpenAIConnection} disabled={testingOpenAI}>
                {testingOpenAI ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Testar Conexão
              </Button>
              <Button onClick={() => validateAndSaveOpenAIKey(openAIKey)} disabled={savingOpenAI}>
                {savingOpenAI ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>

            {openAITestResult && <div className={`p-3 rounded-lg border ${openAITestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                <div className="flex items-center gap-2">
                  {openAITestResult.success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                  <span className={`text-sm ${openAITestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    {openAITestResult.message}
                  </span>
                </div>
              </div>}
          </div>
          </CardContent>
        </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Apify Card */}
      <Collapsible open={apifyOpen} onOpenChange={setApifyOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-100 dark:bg-cyan-950 rounded-lg">
                    <Database className="h-5 w-5 text-cyan-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Apify</CardTitle>
                    <CardDescription>
                      Configure a API Key do Apify para web scraping e extração de dados
                    </CardDescription>
                  </div>
                </div>
                {apifyOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label>API Key</Label>
              <div className="flex gap-2 mt-1">
                <Input type={showApifyKey ? "text" : "password"} value={apifyApiKey} onChange={e => setApifyApiKey(e.target.value)} placeholder="" className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => setShowApifyKey(!showApifyKey)}>
                  {showApifyKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={testApifyConnection} disabled={testingApify}>
                {testingApify ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Testar Conexão
              </Button>
              <Button onClick={saveApifyConfig} disabled={savingApify}>
                {savingApify ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>

            {apifyTestResult && <div className={`p-3 rounded-lg border ${apifyTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                <div className="flex items-center gap-2">
                  {apifyTestResult.success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                  <span className={`text-sm ${apifyTestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    {apifyTestResult.message}
                  </span>
                </div>
              </div>}
          </div>
          </CardContent>
        </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Fireflies Card */}
      <Collapsible open={firefliesOpen} onOpenChange={setFirefliesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-950 rounded-lg">
                    <Mic className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Fireflies.ai</CardTitle>
                    <CardDescription>
                      Configure a API Key do Fireflies para transcrição e resumos de reuniões
                    </CardDescription>
                  </div>
                </div>
                {firefliesOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label>API Key</Label>
              <div className="flex gap-2 mt-1">
                <Input type={showFirefliesKey ? "text" : "password"} value={firefliesApiKey} onChange={e => setFirefliesApiKey(e.target.value)} placeholder="" className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => setShowFirefliesKey(!showFirefliesKey)}>
                  {showFirefliesKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Obtenha sua API Key em <a href="https://fireflies.ai/integrations" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">fireflies.ai/integrations</a>
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={testFirefliesConnection} disabled={testingFireflies}>
                {testingFireflies ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Testar Conexão
              </Button>
              <Button onClick={saveFirefliesConfig} disabled={savingFireflies}>
                {savingFireflies ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>

            {firefliesTestResult && <div className={`p-3 rounded-lg border ${firefliesTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                <div className="flex items-center gap-2">
                  {firefliesTestResult.success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                  <span className={`text-sm ${firefliesTestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    {firefliesTestResult.message}
                  </span>
                </div>
              </div>}
          </div>
          </CardContent>
        </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Google Calendar Card */}
      <GoogleCalendarConfig defaultOpen={googleCalendarOpen} />

      {/* Meta Pixel Card */}
      <Collapsible open={metaPixelOpen} onOpenChange={setMetaPixelOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                    <Crosshair className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Meta Pixel</CardTitle>
                    <CardDescription>
                      Configure a integração com o Meta Pixel para rastrear conversões
                    </CardDescription>
                  </div>
                </div>
                {metaPixelOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <MetaPixelConfig />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Instagram Card */}
      <Collapsible open={instagramOpen} onOpenChange={setInstagramOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-950 dark:to-pink-950 rounded-lg">
                    <Instagram className="h-5 w-5 text-pink-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Instagram</CardTitle>
                    <CardDescription>
                      Configure a integração com a API do Instagram
                    </CardDescription>
                  </div>
                </div>
                {instagramOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <InstagramConfigTab />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>;
}