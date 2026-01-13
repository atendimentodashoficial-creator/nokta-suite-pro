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
import {
  Link2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Bot,
  Database
} from "lucide-react";
import { MetaIcon } from "@/components/icons/MetaIcon";
import GoogleAdsIcon from "@/components/icons/GoogleAdsIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LinkedAdAccount {
  id: string;
  ad_account_id: string;
  account_name: string | null;
  account_type: string | null;
  is_prepay_account: boolean | null;
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
  const { user } = useAuth();
  const { toast } = useToast();

  // ===== Meta/Facebook Ads State =====
  const [hasMetaToken, setHasMetaToken] = useState(false);
  const [loadingMetaConfig, setLoadingMetaConfig] = useState(true);
  const [showMetaToken, setShowMetaToken] = useState(false);
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [newMetaToken, setNewMetaToken] = useState("");
  const [savingMetaToken, setSavingMetaToken] = useState(false);
  const [testingMeta, setTestingMeta] = useState(false);
  const [metaTestResult, setMetaTestResult] = useState<{ success: boolean; message: string; userName?: string } | null>(null);

  // ===== Ad Accounts State =====
  const [linkedAdAccounts, setLinkedAdAccounts] = useState<LinkedAdAccount[]>([]);
  const [newAccountId, setNewAccountId] = useState("");
  const [newAccountType, setNewAccountType] = useState<string>("prepaid");
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
  const [googleAdsTestResult, setGoogleAdsTestResult] = useState<{ success: boolean; message: string; email?: string } | null>(null);

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
  const [openAITestResult, setOpenAITestResult] = useState<{ success: boolean; message: string } | null>(null);

  // ===== Apify State =====
  const [hasApifyKey, setHasApifyKey] = useState(false);
  const [loadingApify, setLoadingApify] = useState(true);
  const [showApifyKey, setShowApifyKey] = useState(false);
  const [apifyApiKey, setApifyApiKey] = useState("");
  const [newApifyKey, setNewApifyKey] = useState("");
  const [savingApify, setSavingApify] = useState(false);

  useEffect(() => {
    if (user) {
      loadMetaConfig();
      loadWhatsAppConfig();
      loadLinkedAdAccounts();
      loadGoogleAdsConfig();
      loadLinkedGoogleAdsAccounts();
      checkOpenAIConfig();
      loadApifyConfig();
      setLoadingDisparosInstancias(false);
    }
  }, [user]);

  // ===== OpenAI Functions =====
  const checkOpenAIConfig = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("save-openai-key", {
        body: { action: "check" },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
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

  const validateAndSaveOpenAIKey = async () => {
    if (!newOpenAIKey.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira a API Key",
        variant: "destructive",
      });
      return;
    }

    setSavingOpenAI(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      
      // Use the "save" action which validates AND saves the key
      const response = await supabase.functions.invoke("save-openai-key", {
        body: { action: "save", api_key: newOpenAIKey.trim() },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        setOpenAITestResult({ success: false, message: response.data?.error || "API Key inválida" });
        toast({
          title: "API Key inválida",
          description: response.data?.error || "Verifique a chave e tente novamente",
          variant: "destructive",
        });
        return;
      }

      // Key is valid and saved
      setHasOpenAIKey(true);
      setOpenAIKey("sk-••••••••••••••••••••••••••••••••");
      setNewOpenAIKey("");
      setOpenAITestResult({ success: true, message: response.data.message });
      toast({
        title: "API Key salva!",
        description: "A chave foi validada e está ativa.",
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao salvar API Key";
      setOpenAITestResult({ success: false, message: errorMessage });
      toast({
        title: "Erro ao salvar",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSavingOpenAI(false);
    }
  };

  const testOpenAIConnection = async () => {
    setTestingOpenAI(true);
    setOpenAITestResult(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("save-openai-key", {
        body: { action: "test" },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error) {
        setOpenAITestResult({ success: false, message: response.error.message || "Erro ao testar conexão" });
      } else if (!response.data?.success) {
        setOpenAITestResult({ success: false, message: response.data?.error || "Erro ao testar conexão" });
      } else {
        setOpenAITestResult({ success: true, message: response.data.message });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao testar conexão";
      setOpenAITestResult({ success: false, message: errorMessage });
    } finally {
      setTestingOpenAI(false);
    }
  };

  const removeOpenAIKey = async () => {
    setRemovingOpenAI(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("save-openai-key", {
        body: { action: "clear_info" },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      setHasOpenAIKey(false);
      setOpenAIKey("");
      setNewOpenAIKey("");
      setOpenAITestResult(null);
      
      toast({
        title: "Chave removida",
        description: response.data?.message || "API Key removida com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover a chave.",
        variant: "destructive",
      });
    } finally {
      setRemovingOpenAI(false);
    }
  };

  const loadApifyConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("apify_config")
        .select("*")
        .eq("user_id", user?.id)
        .single();

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
        variant: "destructive",
      });
      return;
    }

    setSavingApify(true);
    try {
      const { error } = await supabase
        .from("apify_config")
        .upsert({
          user_id: user?.id,
          api_key: keyToSave,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id",
        });

      if (error) throw error;

      setHasApifyKey(true);
      setApifyApiKey(keyToSave);
      setNewApifyKey("");
      toast({
        title: "Configuração salva!",
        description: "API Key do Apify configurada com sucesso",
      });
    } catch (error) {
      console.error("Error saving Apify config:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a configuração",
        variant: "destructive",
      });
    } finally {
      setSavingApify(false);
    }
  };

  // ===== Meta/Facebook Ads Functions =====
  const loadMetaConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("facebook_config")
        .select("access_token")
        .eq("user_id", user?.id)
        .single();

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
    const tokenToSave = tokenOverride || newMetaToken;
    if (!tokenToSave.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira o Access Token",
        variant: "destructive",
      });
      return;
    }

    setSavingMetaToken(true);
    try {
      const { error } = await supabase
        .from("facebook_config")
        .upsert({
          user_id: user?.id,
          access_token: tokenToSave.trim(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id"
        });

      if (error) throw error;

      // Testar conexão
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("facebook-ads-api", {
        body: { action: "test_connection" },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Token inválido");
      }

      setHasMetaToken(true);
      setMetaAccessToken(tokenToSave.trim());
      setNewMetaToken("");
      setMetaTestResult({ success: true, message: "Conectado com sucesso!", userName: response.data.user_name });
      
      toast({
        title: "Token salvo com sucesso!",
        description: `Conectado como ${response.data.user_name}`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao salvar token";
      toast({
        title: "Erro ao salvar token",
        description: errorMessage,
        variant: "destructive",
      });
      setMetaTestResult({ success: false, message: errorMessage });
    } finally {
      setSavingMetaToken(false);
    }
  };

  const testMetaConnection = async () => {
    if (!metaAccessToken && !newMetaToken) {
      toast({
        title: "Erro",
        description: "Nenhum token configurado",
        variant: "destructive",
      });
      return;
    }

    setTestingMeta(true);
    setMetaTestResult(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("facebook-ads-api", {
        body: { action: "test_connection" },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Token inválido");
      }

      setMetaTestResult({ success: true, message: "Conexão OK!", userName: response.data.user_name });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao testar conexão";
      setMetaTestResult({ success: false, message: errorMessage });
    } finally {
      setTestingMeta(false);
    }
  };

  // ===== Ad Accounts Functions =====
  const loadLinkedAdAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("facebook_ad_accounts")
        .select("id, ad_account_id, account_name, account_type, is_prepay_account")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

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
        variant: "destructive",
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
          variant: "destructive",
        });
        return;
      }

      // Buscar dados da conta
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("facebook-ads-api", {
        body: {
          action: "get_account_info",
          ad_account_id: normalizedId,
          account_type: newAccountType,
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Erro ao buscar conta");
      }

      // Atualizar o tipo de conta no banco
      await supabase
        .from("facebook_ad_accounts")
        .update({ account_type: newAccountType })
        .eq("ad_account_id", normalizedId)
        .eq("user_id", user?.id);

      setNewAccountId("");
      setNewAccountType("prepaid");
      loadLinkedAdAccounts();
      toast({
        title: "Conta vinculada com sucesso!",
        description: `${response.data.data.name} foi adicionada como ${newAccountType === "prepaid" ? "Pré-pago" : "Pós-pago"}`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao adicionar conta";
      toast({
        title: "Erro ao vincular conta",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setAddingAccount(false);
    }
  };

  const updateAccountType = async (accountId: string, adAccountId: string, type: string) => {
    try {
      const { error } = await supabase
        .from("facebook_ad_accounts")
        .update({ account_type: type })
        .eq("id", accountId)
        .eq("user_id", user?.id);

      if (error) throw error;

      setLinkedAdAccounts(prev => 
        prev.map(acc => acc.id === accountId ? { ...acc, account_type: type } : acc)
      );
      
      toast({
        title: "Tipo de conta atualizado",
        description: `Conta definida como ${type === "prepaid" ? "Pré-pago" : "Pós-pago"}`,
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o tipo de conta",
        variant: "destructive",
      });
    }
  };

  const removeAdAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from("facebook_ad_accounts")
        .delete()
        .eq("id", accountId)
        .eq("user_id", user?.id);

      if (error) throw error;

      setLinkedAdAccounts(prev => prev.filter(acc => acc.id !== accountId));
      toast({
        title: "Conta removida",
        description: "A conta de anúncios foi desvinculada",
      });
    } catch (error) {
      toast({
        title: "Erro ao remover conta",
        description: "Não foi possível remover a conta",
        variant: "destructive",
      });
    }
  };

  // ===== WhatsApp/UAZapi Functions =====
  const loadWhatsAppConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("uazapi_config")
        .select("whatsapp_instancia_id")
        .eq("user_id", user?.id)
        .maybeSingle();

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
      const { data, error } = await supabase
        .from("google_ads_config")
        .select("*")
        .eq("user_id", user?.id)
        .single();

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
      const { data, error } = await supabase
        .from("google_ads_accounts")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

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
        variant: "destructive",
      });
      return;
    }

    setSavingGoogleAds(true);
    try {
      // Test connection first
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("google-ads-api", {
        body: {
          action: "test_connection",
          developer_token: devToken,
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Credenciais inválidas");
      }

      // Save to database
      const { error } = await supabase
        .from("google_ads_config")
        .upsert({
          user_id: user?.id,
          developer_token: devToken,
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id",
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
        email: response.data.user?.email,
      });

      toast({
        title: "Configuração salva!",
        description: `Conectado como ${response.data.user?.email || "usuário Google"}`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao salvar configuração";
      toast({
        title: "Erro ao salvar",
        description: errorMessage,
        variant: "destructive",
      });
      setGoogleAdsTestResult({ success: false, message: errorMessage });
    } finally {
      setSavingGoogleAds(false);
    }
  };

  const testGoogleAdsConnection = async () => {
    if (!googleAdsDeveloperToken || !googleAdsClientId || !googleAdsClientSecret || !googleAdsRefreshToken) {
      toast({
        title: "Erro",
        description: "Nenhuma configuração salva",
        variant: "destructive",
      });
      return;
    }

    setTestingGoogleAds(true);
    setGoogleAdsTestResult(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("google-ads-api", {
        body: {
          action: "test_connection",
          developer_token: googleAdsDeveloperToken,
          client_id: googleAdsClientId,
          client_secret: googleAdsClientSecret,
          refresh_token: googleAdsRefreshToken,
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Erro ao testar conexão");
      }

      setGoogleAdsTestResult({
        success: true,
        message: "Conexão OK!",
        email: response.data.user?.email,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao testar conexão";
      setGoogleAdsTestResult({ success: false, message: errorMessage });
    } finally {
      setTestingGoogleAds(false);
    }
  };

  const addGoogleAdsAccount = async () => {
    if (!newGoogleCustomerId.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira o Customer ID",
        variant: "destructive",
      });
      return;
    }

    setAddingGoogleAccount(true);
    try {
      // Format: XXX-XXX-XXXX or XXXXXXXXXX
      const customerId = newGoogleCustomerId.replace(/\D/g, "");
      
      // Check if already exists
      const exists = linkedGoogleAdsAccounts.some(
        acc => acc.customer_id.replace(/\D/g, "") === customerId
      );
      if (exists) {
        toast({
          title: "Conta já vinculada",
          description: "Este Customer ID já está vinculado",
          variant: "destructive",
        });
        return;
      }

      // Get account info
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("google-ads-api", {
        body: {
          action: "get_account_info",
          customer_id: customerId,
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Erro ao buscar conta");
      }

      // Format customer ID as XXX-XXX-XXXX
      const formattedId = customerId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");

      // Save to database
      const { error } = await supabase
        .from("google_ads_accounts")
        .insert({
          user_id: user?.id,
          customer_id: formattedId,
          account_name: response.data.account?.name || null,
          currency: response.data.account?.currency || "BRL",
          status: "connected",
        });

      if (error) throw error;

      setNewGoogleCustomerId("");
      loadLinkedGoogleAdsAccounts();
      toast({
        title: "Conta vinculada com sucesso!",
        description: `${response.data.account?.name || formattedId} foi adicionada`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao adicionar conta";
      toast({
        title: "Erro ao vincular conta",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setAddingGoogleAccount(false);
    }
  };

  const removeGoogleAdsAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from("google_ads_accounts")
        .delete()
        .eq("id", accountId)
        .eq("user_id", user?.id);

      if (error) throw error;

      setLinkedGoogleAdsAccounts(prev => prev.filter(acc => acc.id !== accountId));
      toast({
        title: "Conta removida",
        description: "A conta do Google Ads foi desvinculada",
      });
    } catch (error) {
      toast({
        title: "Erro ao remover conta",
        description: "Não foi possível remover a conta",
        variant: "destructive",
      });
    }
  };

  const isLoading = loadingMetaConfig || loadingWhatsAppConfig || loadingDisparosInstancias || loadingOpenAI || loadingApify || loadingGoogleAds;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Meta/Facebook Ads Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                <MetaIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Meta Ads</CardTitle>
                <CardDescription>
                  Configure o Access Token para integração com o Meta Ads
                </CardDescription>
              </div>
            </div>
            <Badge variant={hasMetaToken ? "default" : "secondary"} className="gap-1">
              {hasMetaToken ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </>
              ) : (
                "Não configurado"
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasMetaToken ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Access Token</Label>
                <div className="flex gap-2">
                  <Input
                    type={showMetaToken ? "text" : "password"}
                    value={metaAccessToken}
                    onChange={(e) => setMetaAccessToken(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowMetaToken(!showMetaToken)}
                  >
                    {showMetaToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={testMetaConnection} disabled={testingMeta}>
                  {testingMeta ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
                <Button onClick={() => saveMetaToken(metaAccessToken)} disabled={savingMetaToken}>
                  {savingMetaToken ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                </Button>
              </div>

              {metaTestResult && (
                <div className={`p-3 rounded-lg border ${metaTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                  <div className="flex items-center gap-2">
                    {metaTestResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={`text-sm ${metaTestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                      {metaTestResult.message}
                      {metaTestResult.userName && ` - ${metaTestResult.userName}`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Access Token</Label>
                <Input
                  type="password"
                  value={newMetaToken}
                  onChange={(e) => setNewMetaToken(e.target.value)}
                  placeholder="Cole o Access Token do Facebook"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Obtenha o token em developers.facebook.com
                </p>
              </div>
              <Button onClick={() => saveMetaToken()} disabled={savingMetaToken || !newMetaToken}>
                {savingMetaToken ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar e Conectar"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ad Accounts Section */}
      {hasMetaToken && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg">
                  <Link2 className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Contas de Anúncios</CardTitle>
                  <CardDescription>
                    Vincule suas contas de anúncios do Meta Ads para monitorar saldo e gastos
                  </CardDescription>
                </div>
              </div>
              <Badge variant="secondary" className="gap-1">
                {linkedAdAccounts.length} conta{linkedAdAccounts.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Formulário para adicionar conta */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label>Ad Account ID</Label>
                <Input
                  placeholder="ex: act_1234567890"
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                />
              </div>
              <div className="w-[140px] space-y-2">
                <Label>Tipo de Conta</Label>
                <Select value={newAccountType} onValueChange={setNewAccountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prepaid">Pré-pago</SelectItem>
                    <SelectItem value="postpaid">Pós-pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addAdAccount} disabled={addingAccount || !newAccountId.trim()}>
                {addingAccount ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Vincular
                  </>
                )}
              </Button>
            </div>

            {/* Lista de contas vinculadas */}
            {linkedAdAccounts.length > 0 ? (
              <div className="space-y-2">
                {linkedAdAccounts.map((account) => {
                  const accountType = account.account_type || (account.is_prepay_account ? "prepaid" : "postpaid");
                  return (
                    <div
                      key={account.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{account.account_name || "Conta sem nome"}</p>
                          <Badge variant="outline" className="text-xs">
                            {accountType === "prepaid" ? "Pré-pago" : "Pós-pago"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{account.ad_account_id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select 
                          value={accountType} 
                          onValueChange={(value) => updateAccountType(account.id, account.ad_account_id, value)}
                        >
                          <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="prepaid">Pré-pago</SelectItem>
                            <SelectItem value="postpaid">Pós-pago</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAdAccount(account.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma conta vinculada. Adicione uma conta acima.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Google Ads Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-950 rounded-lg">
                <GoogleAdsIcon className="h-5 w-5" size={20} />
              </div>
              <div>
                <CardTitle className="text-lg">Google Ads</CardTitle>
                <CardDescription>
                  Configure as credenciais para integração com Google Ads
                </CardDescription>
              </div>
            </div>
            <Badge variant={hasGoogleAdsConfig ? "default" : "secondary"} className="gap-1">
              {hasGoogleAdsConfig ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </>
              ) : (
                "Não configurado"
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasGoogleAdsConfig ? (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Developer Token</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type={showGoogleAdsCredentials ? "text" : "password"}
                      value={googleAdsDeveloperToken}
                      readOnly
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Client ID</Label>
                  <Input
                    type={showGoogleAdsCredentials ? "text" : "password"}
                    value={googleAdsClientId}
                    readOnly
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Client Secret</Label>
                  <Input
                    type={showGoogleAdsCredentials ? "text" : "password"}
                    value={googleAdsClientSecret}
                    readOnly
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Refresh Token</Label>
                  <Input
                    type={showGoogleAdsCredentials ? "text" : "password"}
                    value={googleAdsRefreshToken}
                    readOnly
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGoogleAdsCredentials(!showGoogleAdsCredentials)}
                >
                  {showGoogleAdsCredentials ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  {showGoogleAdsCredentials ? "Ocultar" : "Mostrar"}
                </Button>
                <Button variant="outline" onClick={testGoogleAdsConnection} disabled={testingGoogleAds}>
                  {testingGoogleAds ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
              </div>

              {googleAdsTestResult && (
                <div className={`p-3 rounded-lg border ${googleAdsTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                  <div className="flex items-center gap-2">
                    {googleAdsTestResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={`text-sm ${googleAdsTestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                      {googleAdsTestResult.message}
                      {googleAdsTestResult.email && ` - ${googleAdsTestResult.email}`}
                    </span>
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <Label className="text-sm font-medium">Atualizar Credenciais</Label>
                <div className="grid gap-3 mt-2">
                  <Input
                    type="password"
                    value={newGoogleAdsDeveloperToken}
                    onChange={(e) => setNewGoogleAdsDeveloperToken(e.target.value)}
                    placeholder="Novo Developer Token"
                  />
                  <Input
                    type="password"
                    value={newGoogleAdsClientId}
                    onChange={(e) => setNewGoogleAdsClientId(e.target.value)}
                    placeholder="Novo Client ID"
                  />
                  <Input
                    type="password"
                    value={newGoogleAdsClientSecret}
                    onChange={(e) => setNewGoogleAdsClientSecret(e.target.value)}
                    placeholder="Novo Client Secret"
                  />
                  <Input
                    type="password"
                    value={newGoogleAdsRefreshToken}
                    onChange={(e) => setNewGoogleAdsRefreshToken(e.target.value)}
                    placeholder="Novo Refresh Token"
                  />
                  <Button 
                    onClick={saveGoogleAdsConfig} 
                    disabled={savingGoogleAds || (!newGoogleAdsDeveloperToken && !newGoogleAdsClientId && !newGoogleAdsClientSecret && !newGoogleAdsRefreshToken)}
                  >
                    {savingGoogleAds ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Para conectar o Google Ads, você precisa de 4 credenciais:
              </p>
              <div className="grid gap-3">
                <div>
                  <Label>Developer Token</Label>
                  <Input
                    type="password"
                    value={newGoogleAdsDeveloperToken}
                    onChange={(e) => setNewGoogleAdsDeveloperToken(e.target.value)}
                    placeholder="Obtenha no Google Ads API Center"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Client ID (OAuth)</Label>
                  <Input
                    type="password"
                    value={newGoogleAdsClientId}
                    onChange={(e) => setNewGoogleAdsClientId(e.target.value)}
                    placeholder="Ex: 123456789-abc.apps.googleusercontent.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Client Secret (OAuth)</Label>
                  <Input
                    type="password"
                    value={newGoogleAdsClientSecret}
                    onChange={(e) => setNewGoogleAdsClientSecret(e.target.value)}
                    placeholder="Obtenha no Google Cloud Console"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Refresh Token</Label>
                  <Input
                    type="password"
                    value={newGoogleAdsRefreshToken}
                    onChange={(e) => setNewGoogleAdsRefreshToken(e.target.value)}
                    placeholder="Gerado via fluxo OAuth"
                    className="mt-1"
                  />
                </div>
              </div>
              <Button 
                onClick={saveGoogleAdsConfig} 
                disabled={savingGoogleAds || !newGoogleAdsDeveloperToken || !newGoogleAdsClientId || !newGoogleAdsClientSecret || !newGoogleAdsRefreshToken}
              >
                {savingGoogleAds ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar e Conectar"
                )}
              </Button>

              {googleAdsTestResult && (
                <div className={`p-3 rounded-lg border ${googleAdsTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                  <div className="flex items-center gap-2">
                    {googleAdsTestResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={`text-sm ${googleAdsTestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                      {googleAdsTestResult.message}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Ads Accounts Section */}
      {hasGoogleAdsConfig && (
        <Card>
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
                <Label className="text-xs text-muted-foreground">Customer ID</Label>
                <Input
                  placeholder="ex: 123-456-7890"
                  value={newGoogleCustomerId}
                  onChange={(e) => setNewGoogleCustomerId(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button onClick={addGoogleAdsAccount} disabled={addingGoogleAccount || !newGoogleCustomerId.trim()}>
                {addingGoogleAccount ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Vincular
                  </>
                )}
              </Button>
            </div>

            {/* Lista de contas vinculadas */}
            {linkedGoogleAdsAccounts.length > 0 ? (
              <div className="space-y-2">
                {linkedGoogleAdsAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{account.account_name || "Conta sem nome"}</p>
                        <Badge variant="outline" className="text-xs">
                          {account.currency || "BRL"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{account.customer_id}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeGoogleAdsAccount(account.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma conta vinculada. Adicione uma conta acima.
              </p>
            )}
          </CardContent>
        </Card>
      )}


      {/* OpenAI Card */}
      <Card>
        <CardHeader>
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
            <Badge variant={hasOpenAIKey ? "default" : "secondary"} className="gap-1">
              {hasOpenAIKey ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </>
              ) : (
                "Não configurado"
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasOpenAIKey ? (
            <div className="space-y-4">
              <div>
                <Label>API Key Atual</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type={showOpenAIKey ? "text" : "password"}
                    value={openAIKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                  >
                    {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={testOpenAIConnection} disabled={testingOpenAI}>
                  {testingOpenAI ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
                <Button variant="destructive" onClick={removeOpenAIKey} disabled={removingOpenAI}>
                  {removingOpenAI ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Remover Chave
                </Button>
              </div>

              {openAITestResult && (
                <div className={`p-3 rounded-lg border ${openAITestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                  <div className="flex items-center gap-2">
                    {openAITestResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={`text-sm ${openAITestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                      {openAITestResult.message}
                    </span>
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <Label>Atualizar API Key</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="password"
                    value={newOpenAIKey}
                    onChange={(e) => setNewOpenAIKey(e.target.value)}
                    placeholder="Cole a nova API Key aqui (sk-...)"
                  />
                  <Button onClick={validateAndSaveOpenAIKey} disabled={savingOpenAI || !newOpenAIKey}>
                    {savingOpenAI ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Obtenha sua API Key em{" "}
                  <a 
                    href="https://platform.openai.com/api-keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    platform.openai.com/api-keys
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>API Key da OpenAI</Label>
                <Input
                  type="password"
                  value={newOpenAIKey}
                  onChange={(e) => setNewOpenAIKey(e.target.value)}
                  placeholder="Cole sua API Key aqui (sk-...)"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Obtenha sua API Key em{" "}
                  <a 
                    href="https://platform.openai.com/api-keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    platform.openai.com/api-keys
                  </a>
                </p>
              </div>
              <Button onClick={validateAndSaveOpenAIKey} disabled={savingOpenAI || !newOpenAIKey}>
                {savingOpenAI ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validando...
                  </>
                ) : (
                  "Validar e Conectar"
                )}
              </Button>

              {openAITestResult && (
                <div className={`p-3 rounded-lg border ${openAITestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                  <div className="flex items-center gap-2">
                    {openAITestResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={`text-sm ${openAITestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                      {openAITestResult.message}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apify Card */}
      <Card>
        <CardHeader>
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
            <Badge variant={hasApifyKey ? "default" : "secondary"} className="gap-1">
              {hasApifyKey ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </>
              ) : (
                "Não configurado"
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasApifyKey ? (
            <div className="space-y-4">
              <div>
                <Label>API Key Atual</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type={showApifyKey ? "text" : "password"}
                    value={apifyApiKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApifyKey(!showApifyKey)}
                  >
                    {showApifyKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4">
                <Label>Atualizar API Key</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="password"
                    value={newApifyKey}
                    onChange={(e) => setNewApifyKey(e.target.value)}
                    placeholder="Cole a nova API Key aqui"
                  />
                  <Button onClick={saveApifyConfig} disabled={savingApify || !newApifyKey}>
                    {savingApify ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Obtenha sua API Key em{" "}
                  <a 
                    href="https://console.apify.com/account/integrations" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    console.apify.com/account/integrations
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>API Key do Apify</Label>
                <Input
                  type="password"
                  value={newApifyKey}
                  onChange={(e) => setNewApifyKey(e.target.value)}
                  placeholder="Cole sua API Key aqui"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Obtenha sua API Key em{" "}
                  <a 
                    href="https://console.apify.com/account/integrations" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    console.apify.com/account/integrations
                  </a>
                </p>
              </div>
              <Button onClick={saveApifyConfig} disabled={savingApify || !newApifyKey}>
                {savingApify ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar e Conectar"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
