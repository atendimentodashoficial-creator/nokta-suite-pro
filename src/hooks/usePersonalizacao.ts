import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PersonalizacaoConfig {
  id: string;
  user_id: string;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  cor_background: string | null;
  cor_sidebar: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export function usePersonalizacao() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: config, isLoading, error } = useQuery({
    queryKey: ["personalizacao", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from("personalizacao_config")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data as PersonalizacaoConfig | null;
    },
    enabled: !!user?.id,
  });

  const upsertConfig = useMutation({
    mutationFn: async (updates: Partial<Omit<PersonalizacaoConfig, "id" | "user_id" | "created_at" | "updated_at">>) => {
      if (!user?.id) throw new Error("User not authenticated");

      const { data: existing } = await supabase
        .from("personalizacao_config")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("personalizacao_config")
          .update(updates)
          .eq("user_id", user.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("personalizacao_config")
          .insert({ user_id: user.id, ...updates })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personalizacao", user?.id] });
    },
    onError: (error) => {
      console.error("Error saving personalization:", error);
      toast.error("Erro ao salvar personalização");
    },
  });

  const uploadLogo = async (file: File): Promise<string | null> => {
    if (!user?.id) {
      toast.error("Usuário não autenticado");
      return null;
    }

    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/logo.${fileExt}`;

    // Delete old logo if exists
    await supabase.storage.from("logos").remove([fileName]);

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      toast.error("Erro ao fazer upload da logo");
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("logos")
      .getPublicUrl(fileName);

    return publicUrl;
  };

  return {
    config,
    isLoading,
    error,
    upsertConfig,
    uploadLogo,
  };
}
