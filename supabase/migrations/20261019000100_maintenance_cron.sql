-- Pianifica la manutenzione con pg_cron se disponibile (Supabase: abilitato da dashboard).
-- In ambienti senza pg_cron la migrazione è un no-op.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('caption-maintenance', '*/10 * * * *', 'select public.run_maintenance(365)');
  else
    raise notice 'pg_cron non disponibile: pianifica public.run_maintenance() altrove';
  end if;
end;
$$;
