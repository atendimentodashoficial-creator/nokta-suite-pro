import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Lista de todas as features disponíveis
export const ALL_FEATURES = [
  { key: "calendario", label: "Calendário", href: "/" },
  { key: "nao-compareceu", label: "Não Compareceu", href: "/nao-compareceu" },
  { key: "leads", label: "Leads", href: "/leads" },
  { key: "clientes", label: "Clientes", href: "/clientes" },
  { key: "negociacao", label: "Negociação", href: "/em-negociacao" },
  { key: "faturas", label: "Faturas", href: "/faturas" },
  { key: "despesas", label: "Despesas", href: "/despesas" },
  { key: "relatorios", label: "Relatórios", href: "/relatorios" },
  { key: "whatsapp", label: "WhatsApp", href: "/whatsapp" },
  { key: "disparos", label: "Disparos", href: "/disparos" },
  { key: "extrator", label: "Extrator", href: "/extrator" },
  { key: "instagram", label: "Instagram", href: "/instagram" },
  { key: "formularios", label: "Formulários", href: "/formularios" },
  { key: "meta-ads", label: "Meta Ads", href: "/metricas-campanhas" },
  { key: "google-ads", label: "Google Ads", href: "/google-ads" },
  { key: "configuracoes", label: "Configurações", href: "/configuracoes" },
] as const;

export type FeatureKey = typeof ALL_FEATURES[number]["key"];

interface UserFeatureAccess {
  id: string;
  user_id: string;
  feature_key: string;
  enabled: boolean;
}

export function useUserFeatureAccess() {
  const { user } = useAuth();

  const { data: featureAccess, isLoading } = useQuery({
    queryKey: ["user-feature-access", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("user_feature_access")
        .select("*")
        .eq("user_id", user.id);
      
      if (error) {
        console.error("Error fetching feature access:", error);
        return [];
      }
      
      return data as UserFeatureAccess[];
    },
    enabled: !!user?.id,
  });

  // Verifica se uma feature está habilitada para o usuário
  // Se não houver registro, a feature está habilitada por padrão
  const isFeatureEnabled = (featureKey: string): boolean => {
    if (!featureAccess || featureAccess.length === 0) {
      // Se não há restrições, todas as features estão habilitadas
      return true;
    }
    
    const access = featureAccess.find(a => a.feature_key === featureKey);
    // Se não encontrou registro específico, está habilitado
    // Se encontrou, usa o valor de enabled
    return access ? access.enabled : true;
  };

  // Retorna as features habilitadas
  const enabledFeatures = ALL_FEATURES.filter(f => isFeatureEnabled(f.key));

  return {
    featureAccess,
    isLoading,
    isFeatureEnabled,
    enabledFeatures,
    allFeatures: ALL_FEATURES,
  };
}
