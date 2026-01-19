-- Add field to track CompleteRegistration event for agendamentos (idempotency)
ALTER TABLE public.agendamentos 
ADD COLUMN IF NOT EXISTS meta_event_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.agendamentos.meta_event_sent_at IS 'Timestamp when CompleteRegistration event was sent to Meta CAPI';