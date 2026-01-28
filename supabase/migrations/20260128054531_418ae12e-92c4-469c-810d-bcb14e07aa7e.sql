-- Add profissional_id to reunioes table
ALTER TABLE public.reunioes 
ADD COLUMN profissional_id uuid REFERENCES public.profissionais(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX idx_reunioes_profissional_id ON public.reunioes(profissional_id);