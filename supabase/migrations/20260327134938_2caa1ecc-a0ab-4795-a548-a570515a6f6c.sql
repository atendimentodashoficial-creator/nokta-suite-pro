
CREATE OR REPLACE FUNCTION public.toggle_cron_jobs(p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job RECORD;
BEGIN
  IF p_active THEN
    -- Reactivate: read saved jobs from app_settings and reschedule
    FOR v_job IN 
      SELECT j->>'jobname' as jobname, j->>'schedule' as schedule, j->>'command' as command
      FROM app_settings, jsonb_array_elements(COALESCE((app_settings.maintenance_data::jsonb), '[]'::jsonb)) as j
      WHERE id = 'global'
    LOOP
      -- Unschedule if exists, then reschedule
      BEGIN
        PERFORM cron.unschedule(v_job.jobname);
      EXCEPTION WHEN OTHERS THEN
        NULL; -- job might not exist
      END;
      PERFORM cron.schedule(v_job.jobname, v_job.schedule, v_job.command);
    END LOOP;
  ELSE
    -- Deactivate: save current jobs to app_settings, then unschedule all
    UPDATE app_settings 
    SET maintenance_data = (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'jobname', jobname,
        'schedule', schedule,
        'command', command
      )), '[]'::jsonb)
      FROM cron.job
    )::text
    WHERE id = 'global';
    
    -- Unschedule all jobs
    FOR v_job IN SELECT jobname FROM cron.job
    LOOP
      PERFORM cron.unschedule(v_job.jobname);
    END LOOP;
  END IF;
END;
$$;
