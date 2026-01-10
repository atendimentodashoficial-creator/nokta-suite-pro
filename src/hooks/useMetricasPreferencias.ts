import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ColumnKey, Preset } from "@/components/metricas/PresetManagerDialog";
import type { MetricCardKey } from "@/components/metricas/MetricCardSelectorDialog";
import { DEFAULT_VISIBLE_CARDS } from "@/components/metricas/MetricCardSelectorDialog";
import type { Json } from "@/integrations/supabase/types";

export type FunnelColumnKey = 
  | "name" 
  | "spend" 
  | "leads" 
  | "cpl" 
  | "agendados" 
  | "cpa_agendado" 
  | "faltou" 
  | "em_negociacao" 
  | "conversoes" 
  | "cac" 
  | "faturado" 
  | "roas";

export interface MetricasPreferencias {
  id: string;
  user_id: string;
  presets: Preset[];
  visible_cards: MetricCardKey[] | null;
  selected_preset_id: string | null;
  funnel_column_order: FunnelColumnKey[] | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_COLUMNS: ColumnKey[] = ["status", "impressions", "clicks", "ctr", "cpc", "reach", "spend"];

export function useMetricasPreferencias() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: preferencias, isLoading } = useQuery({
    queryKey: ["metricas_preferencias", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from("metricas_preferencias")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      
      // Parse JSONB fields
      if (data) {
        return {
          ...data,
          presets: (data.presets as unknown as Preset[]) || [],
          visible_cards: (data.visible_cards as unknown as MetricCardKey[]) || null,
          funnel_column_order: (data.funnel_column_order as unknown as FunnelColumnKey[]) || null,
        } as MetricasPreferencias;
      }
      
      return null;
    },
    enabled: !!user?.id,
  });

  const upsertPreferencias = useMutation({
    mutationFn: async (updates: {
      presets?: Preset[];
      visible_cards?: MetricCardKey[];
      selected_preset_id?: string | null;
      funnel_column_order?: FunnelColumnKey[];
    }) => {
      if (!user?.id) throw new Error("User not authenticated");

      const { data: existing } = await supabase
        .from("metricas_preferencias")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      // Cast to Json type for Supabase
      const updatePayload: Record<string, unknown> = {};
      if (updates.presets !== undefined) {
        updatePayload.presets = updates.presets as unknown as Json;
      }
      if (updates.visible_cards !== undefined) {
        updatePayload.visible_cards = updates.visible_cards as unknown as Json;
      }
      if (updates.selected_preset_id !== undefined) {
        updatePayload.selected_preset_id = updates.selected_preset_id;
      }
      if (updates.funnel_column_order !== undefined) {
        updatePayload.funnel_column_order = updates.funnel_column_order as unknown as Json;
      }

      if (existing) {
        const { data, error } = await supabase
          .from("metricas_preferencias")
          .update(updatePayload)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("metricas_preferencias")
          .insert({ 
            user_id: user.id, 
            presets: (updates.presets || []) as unknown as Json,
            visible_cards: (updates.visible_cards || null) as unknown as Json,
            selected_preset_id: updates.selected_preset_id || null,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["metricas_preferencias", user?.id] });
    },
    onError: (error) => {
      console.error("Error saving preferences:", error);
      toast.error("Erro ao salvar preferências");
    },
  });

  // Derived values with defaults
  const presets = preferencias?.presets || [];
  const visibleCards = preferencias?.visible_cards || DEFAULT_VISIBLE_CARDS;
  const selectedPresetId = preferencias?.selected_preset_id || null;
  const funnelColumnOrder = preferencias?.funnel_column_order || null;

  // Get visible columns from selected preset
  const getVisibleColumns = (): ColumnKey[] => {
    if (!selectedPresetId) return DEFAULT_COLUMNS;
    
    // Check custom presets first
    const customPreset = presets.find(p => p.id === selectedPresetId);
    if (customPreset) return customPreset.columns;
    
    // Check default presets (these are defined in PresetManagerDialog)
    // We need to handle this since default presets aren't stored
    return DEFAULT_COLUMNS;
  };

  return {
    preferencias,
    isLoading,
    presets,
    visibleCards,
    selectedPresetId,
    funnelColumnOrder,
    getVisibleColumns,
    updatePresets: (newPresets: Preset[]) => 
      upsertPreferencias.mutateAsync({ presets: newPresets }),
    updateVisibleCards: (cards: MetricCardKey[]) => 
      upsertPreferencias.mutateAsync({ visible_cards: cards }),
    updateSelectedPreset: (presetId: string | null) => {
      return upsertPreferencias.mutateAsync({ selected_preset_id: presetId });
    },
    updateFunnelColumnOrder: (order: FunnelColumnKey[]) =>
      upsertPreferencias.mutateAsync({ funnel_column_order: order }),
    upsertPreferencias,
  };
}
