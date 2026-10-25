-- Rimuove lo schema e l'utente del bot di trading creati per errore nel database di Caption
-- (migrazione esterna 20261024230537, non appartenente a questo progetto).
drop schema if exists trading cascade;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'trading_bot') then
    drop role trading_bot;
  end if;
end;
$$;
