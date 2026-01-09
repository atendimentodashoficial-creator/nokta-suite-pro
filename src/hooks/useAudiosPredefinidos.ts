import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AudioPredefinido {
  id: string;
  user_id: string;
  titulo: string;
  audio_url: string;
  duracao_segundos: number | null;
  ordem: number;
  bloco_id: string | null;
  created_at: string;
  updated_at: string;
}

export const useAudiosPredefinidos = () => {
  const queryClient = useQueryClient();

  const { data: audios, isLoading } = useQuery({
    queryKey: ["audios-predefinidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audios_predefinidos")
        .select("*")
        .order("ordem", { ascending: true });

      if (error) throw error;
      return data as AudioPredefinido[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newAudio: { titulo: string; audioFile: File; bloco_id?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get max ordem
      const { data: existing } = await supabase
        .from("audios_predefinidos")
        .select("ordem")
        .eq("user_id", user.id)
        .order("ordem", { ascending: false })
        .limit(1);

      const maxOrdem = existing?.[0]?.ordem ?? -1;

      // Upload audio file to storage
      const fileExt = newAudio.audioFile.name.split(".").pop() || "webm";
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("audios-predefinidos")
        .upload(fileName, newAudio.audioFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("audios-predefinidos")
        .getPublicUrl(fileName);

      // Get audio duration
      let duracao: number | null = null;
      try {
        const audio = new Audio(URL.createObjectURL(newAudio.audioFile));
        await new Promise<void>((resolve) => {
          audio.onloadedmetadata = () => {
            duracao = Math.round(audio.duration);
            resolve();
          };
          audio.onerror = () => resolve();
        });
      } catch {
        // Ignore duration extraction errors
      }

      // Save record to database
      const { data, error } = await supabase
        .from("audios_predefinidos")
        .insert({
          user_id: user.id,
          titulo: newAudio.titulo,
          audio_url: urlData.publicUrl,
          duracao_segundos: duracao,
          ordem: maxOrdem + 1,
          bloco_id: newAudio.bloco_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audios-predefinidos"] });
      toast.success("Áudio criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar áudio");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (audio: { id: string; titulo: string; audioFile?: File; bloco_id?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      let updateData: { titulo: string; audio_url?: string; duracao_segundos?: number | null; bloco_id?: string | null } = {
        titulo: audio.titulo,
        bloco_id: audio.bloco_id ?? null,
      };

      // If new audio file provided, upload it
      if (audio.audioFile) {
        const fileExt = audio.audioFile.name.split(".").pop() || "webm";
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("audios-predefinidos")
          .upload(fileName, audio.audioFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("audios-predefinidos")
          .getPublicUrl(fileName);

        updateData.audio_url = urlData.publicUrl;

        // Get audio duration
        try {
          const audioEl = new Audio(URL.createObjectURL(audio.audioFile));
          await new Promise<void>((resolve) => {
            audioEl.onloadedmetadata = () => {
              updateData.duracao_segundos = Math.round(audioEl.duration);
              resolve();
            };
            audioEl.onerror = () => resolve();
          });
        } catch {
          // Ignore
        }
      }

      const { error } = await supabase
        .from("audios_predefinidos")
        .update(updateData)
        .eq("id", audio.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audios-predefinidos"] });
      toast.success("Áudio atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar áudio");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("audios_predefinidos")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audios-predefinidos"] });
      toast.success("Áudio excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir áudio");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; ordem: number; bloco_id?: string | null }[]) => {
      for (const update of updates) {
        const { error } = await supabase
          .from("audios_predefinidos")
          .update({ ordem: update.ordem, bloco_id: update.bloco_id ?? null })
          .eq("id", update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audios-predefinidos"] });
    },
  });

  return {
    audios: audios || [],
    isLoading,
    createAudio: createMutation.mutate,
    updateAudio: updateMutation.mutate,
    deleteAudio: deleteMutation.mutate,
    reorderAudios: reorderMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
};
