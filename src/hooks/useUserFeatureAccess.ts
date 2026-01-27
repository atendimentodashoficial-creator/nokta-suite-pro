import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Lista de todas as features disponíveis
// defaultEnabled: false significa que a feature fica desabilitada por padrão ao criar usuário
export const ALL_FEATURES = [
  { key: "calendario", label: "Calendário", href: "/", defaultEnabled: true },
  { key: "nao-compareceu", label: "Não Compareceu", href: "/nao-compareceu", defaultEnabled: true },
  { key: "leads", label: "Leads", href: "/leads", defaultEnabled: true },
  { key: "clientes", label: "Clientes", href: "/clientes", defaultEnabled: true },
  { key: "negociacao", label: "Negociação", href: "/em-negociacao", defaultEnabled: true },
  { key: "faturas", label: "Faturas", href: "/faturas", defaultEnabled: true },
  { key: "despesas", label: "Despesas", href: "/despesas", defaultEnabled: true },
  { key: "relatorios", label: "Relatórios", href: "/relatorios", defaultEnabled: true },
  { key: "whatsapp", label: "WhatsApp", href: "/whatsapp", defaultEnabled: true },
  { key: "disparos", label: "Disparos", href: "/disparos", defaultEnabled: true },
  { key: "extrator", label: "Extrator", href: "/extrator", defaultEnabled: true },
  { key: "instagram", label: "Instagram", href: "/instagram", defaultEnabled: true },
  { key: "formularios", label: "Formulários", href: "/formularios", defaultEnabled: true },
  { key: "reunioes", label: "Reuniões", href: "/reunioes", defaultEnabled: false },
  { key: "meta-ads", label: "Meta Ads", href: "/metricas-campanhas", defaultEnabled: true },
  { key: "google-ads", label: "Google Ads", href: "/google-ads", defaultEnabled: true },
  { key: "configuracoes", label: "Configurações", href: "/configuracoes", defaultEnabled: true },
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
  // Se não houver registro, usa o defaultEnabled da feature
  const isFeatureEnabled = (featureKey: string): boolean => {
    const featureConfig = ALL_FEATURES.find(f => f.key === featureKey);
    const defaultEnabled = featureConfig?.defaultEnabled ?? true;
    
    if (!featureAccess || featureAccess.length === 0) {
      // Se não há restrições, usa o valor padrão da feature
      return defaultEnabled;
    }
    
    const access = featureAccess.find(a => a.feature_key === featureKey);
    // Se não encontrou registro específico, usa o defaultEnabled
    // Se encontrou, usa o valor de enabled
    return access ? access.enabled : defaultEnabled;
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
