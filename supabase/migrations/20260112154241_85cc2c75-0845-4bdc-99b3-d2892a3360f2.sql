-- Force PostgREST schema cache reload (sometimes a single NOTIFY is dropped)
SELECT pg_sleep(1);
NOTIFY pgrst, 'reload schema';

SELECT pg_sleep(1);
NOTIFY pgrst, 'reload schema';