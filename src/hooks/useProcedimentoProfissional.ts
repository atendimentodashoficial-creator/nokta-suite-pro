import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface VinculoProcedimentoProfissional {
  id: string;
  procedimento_id: string;
  profissional_id: string;
  user_id: string;
  ordem: number | null;
  created_at: string;
}

export function useVinculos() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['procedimento-profissional', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('procedimento_profissional')
        .select(`
          *,
          procedimentos (id, nome),
          profissionais (id, nome)
        `)
        .eq('user_id', user.id)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useCreateVinculo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vinculo: { procedimento_id: string; profissional_id: string; ordem?: number }) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('procedimento_profissional')
        .insert({
          ...vinculo,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedimento-profissional'] });
      toast.success('Vínculo criado com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar vínculo: ' + error.message);
    },
  });
}

export function useUpdateVinculoOrdem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ordem }: { id: string; ordem: number }) => {
      const { error } = await supabase
        .from('procedimento_profissional')
        .update({ ordem })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedimento-profissional'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao reordenar: ' + error.message);
    },
  });
}

export function useDeleteVinculo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('procedimento_profissional')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedimento-profissional'] });
      toast.success('Vínculo removido com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover vínculo: ' + error.message);
    },
  });
}
