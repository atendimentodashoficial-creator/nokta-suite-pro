-- Force PostgREST schema cache reload so new columns (next_send_at) are recognized immediately
NOTIFY pgrst, 'reload schema';