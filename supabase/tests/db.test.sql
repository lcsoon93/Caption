-- Test SQL dello schema: RLS, quote, rimborsi, rate limit, budget.
-- Eseguito da run-local.sh dopo le migrazioni. Ogni blocco fallisce con RAISE EXCEPTION.
\set ON_ERROR_STOP on

grant all on all tables in schema public to service_role;
-- I test di base partono senza beta aperta (blocco 10).
update public.beta_config set open_access = false;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.it'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.it');

-- 1) Il trigger crea profilo e abbonamento vuoto.
do $$ begin
  if (select count(*) from public.subscriptions where status = 'none') <> 2 then
    raise exception 'FAIL: trigger handle_new_user';
  end if;
end $$;

-- 2) Senza abbonamento: no_subscription.
do $$ begin
  begin
    perform * from public.reserve_generation('00000000-0000-0000-0000-00000000000a', 'generate', 'base',
      1, 30, 30, 4, 30, 400000, 'selfie', 'diretto', null, null, 'm', 'v1');
    raise exception 'FAIL: expected no_subscription';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'no_subscription' then raise exception 'FAIL: got %', sqlerrm; end if;
  end;
end $$;

-- 3) Abbonamento scaduto: subscription_expired.
update public.subscriptions set plan = 'base', status = 'active', expires_at = now() - interval '1 day',
  current_period_start = now() - interval '31 days'
where user_id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  begin
    perform * from public.reserve_generation('00000000-0000-0000-0000-00000000000a', 'generate', 'base',
      1, 30, 30, 4, 30, 400000, 'selfie', 'diretto', null, null, 'm', 'v1');
    raise exception 'FAIL: expected subscription_expired';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'subscription_expired' then raise exception 'FAIL: got %', sqlerrm; end if;
  end;
end $$;

-- 4) Attivo: prenota, completa, quota e storico.
update public.subscriptions set expires_at = now() + interval '20 days', current_period_start = now() - interval '10 days'
where user_id = '00000000-0000-0000-0000-00000000000a';
do $$
declare r record; c int;
begin
  select * into r from public.reserve_generation('00000000-0000-0000-0000-00000000000a', 'generate', 'base',
      1, 2, 2, 10, 100, 400000, 'selfie', 'diretto', null, null, 'm', 'v1');
  if r.credits_used <> 1 then raise exception 'FAIL: credits_used %', r.credits_used; end if;

  perform * from public.complete_generation(r.generation_id,
    '[{"text":"uno","hashtags":["#a"]},{"text":"due","hashtags":[]},{"text":"tre"}]'::jsonb,
    'm', 100, 50, 0, 0, 1234, 900, 2);
  select count(*) into c from public.captions where user_id = '00000000-0000-0000-0000-00000000000a';
  if c <> 2 then raise exception 'FAIL: history limit, got %', c; end if;
  if (select cost_micros from public.spend_monthly limit 1) <> 1234 then raise exception 'FAIL: spend_monthly'; end if;

  -- secondo credito (limite 2) poi quota_exceeded
  select * into r from public.reserve_generation('00000000-0000-0000-0000-00000000000a', 'generate', 'base',
      1, 2, 2, 10, 100, 400000, 'selfie', 'diretto', null, null, 'm', 'v1');
  -- fallimento => rimborso
  perform public.fail_generation(r.generation_id, 'ai_unavailable');
  if (select credits_used from public.usage_periods where user_id = '00000000-0000-0000-0000-00000000000a') <> 1 then
    raise exception 'FAIL: refund';
  end if;
  select * into r from public.reserve_generation('00000000-0000-0000-0000-00000000000a', 'generate', 'base',
      1, 2, 2, 10, 100, 400000, 'selfie', 'diretto', null, null, 'm', 'v1');
  begin
    perform * from public.reserve_generation('00000000-0000-0000-0000-00000000000a', 'generate', 'base',
      1, 2, 2, 10, 100, 400000, 'selfie', 'diretto', null, null, 'm', 'v1');
    raise exception 'FAIL: expected quota_exceeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'quota_exceeded' then raise exception 'FAIL: got %', sqlerrm; end if;
  end;
end $$;

-- 5) Piano cambiato rispetto a quello atteso.
do $$ begin
  begin
    perform * from public.reserve_generation('00000000-0000-0000-0000-00000000000a', 'generate', 'pro',
      1, 1000, null, 10, 100, 400000, 'selfie', 'diretto', null, null, 'm', 'v1');
    raise exception 'FAIL: expected plan_changed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'plan_changed' then raise exception 'FAIL: got %', sqlerrm; end if;
  end;
end $$;

-- 6) Rate limit e budget globale (utente B).
update public.subscriptions set plan = 'pro', status = 'active', expires_at = now() + interval '20 days',
  current_period_start = now() - interval '10 days'
where user_id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  perform * from public.reserve_generation('00000000-0000-0000-0000-00000000000b', 'generate', 'pro',
      1, 1000, null, 1, 100, 3000000, 'cibo', 'ironico', null, null, 'm', 'v1');
  begin
    perform * from public.reserve_generation('00000000-0000-0000-0000-00000000000b', 'generate', 'pro',
      1, 1000, null, 1, 100, 3000000, 'cibo', 'ironico', null, null, 'm', 'v1');
    raise exception 'FAIL: expected rate_limited';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rate_limited' then raise exception 'FAIL: got %', sqlerrm; end if;
  end;
  update public.spend_budgets set monthly_limit_micros = 1000 where scope = 'global';
  begin
    perform * from public.reserve_generation('00000000-0000-0000-0000-00000000000b', 'generate', 'pro',
      1, 1000, null, 100, 100, 3000000, 'cibo', 'ironico', null, null, 'm', 'v1');
    raise exception 'FAIL: expected budget_exceeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'budget_exceeded' then raise exception 'FAIL: got %', sqlerrm; end if;
  end;
  update public.spend_budgets set monthly_limit_micros = 500000000 where scope = 'global';
end $$;

-- 7) RLS: B non vede le caption di A; il client non può chiamare reserve né scrivere abbonamenti.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.captions) <> 0 then raise exception 'FAIL: RLS captions leak'; end if;
  if (select count(*) from public.subscriptions) <> 1 then raise exception 'FAIL: RLS subscriptions'; end if;
  if (select plan from public.get_my_status()) <> 'pro' then raise exception 'FAIL: get_my_status'; end if;
  begin
    update public.subscriptions set plan = 'pro';
    raise exception 'FAIL: client updated subscriptions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.reserve_generation('00000000-0000-0000-0000-00000000000b', 'generate', 'pro',
      1, 1000, null, 100, 100, 3000000, 'cibo', 'ironico', null, null, 'm', 'v1');
    raise exception 'FAIL: client called reserve_generation';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.generations;
    raise exception 'FAIL: client read generations';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare n int; begin
  if (select count(*) from public.captions) <> 2 then raise exception 'FAIL: owner cannot read captions'; end if;
  update public.captions set is_favorite = true;
  begin
    update public.captions set text = 'hack';
    raise exception 'FAIL: client edited caption text';
  exception when insufficient_privilege then null;
  end;
  get diagnostics n = row_count;
end $$;
reset role;

-- 8) Manutenzione: pending vecchi rimborsati.
update public.generations set created_at = now() - interval '10 minutes' where status = 'pending';
do $$ declare res jsonb; begin
  res := public.run_maintenance(365);
  if (res ->> 'staleRefunded')::int < 1 then raise exception 'FAIL: maintenance %', res; end if;
end $$;

-- 9) Beta chiusa: accesso manuale, protetto dalle sync RevenueCat, revocabile, non chiamabile dal client.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'Beta@Test.it');
do $$ declare r text; s record; begin
  r := public.grant_beta_access('beta@test.it');
  select * into s from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000c';
  if s.plan <> 'pro' or s.status <> 'trial' or s.store <> 'manual' or s.expires_at < now() + interval '29 days' then
    raise exception 'FAIL: grant_beta_access %', row_to_json(s);
  end if;
  perform * from public.reserve_generation('00000000-0000-0000-0000-00000000000c', 'generate', 'pro',
    1, null, 1000, 6, 30, 3000000, 'selfie', 'diretto', null, null, 'm', 'v1');
  -- sync RevenueCat senza abbonamento: l'accesso beta resta
  update public.subscriptions set plan = null, status = 'none', store = null, expires_at = null
   where user_id = '00000000-0000-0000-0000-00000000000c';
  if (select status from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000c') <> 'trial' then
    raise exception 'FAIL: RC sync wiped beta access';
  end if;
  -- un acquisto vero invece sostituisce l'accesso beta
  update public.subscriptions set plan = 'standard', status = 'active', store = 'app_store'
   where user_id = '00000000-0000-0000-0000-00000000000c';
  if (select store from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000c') <> 'app_store' then
    raise exception 'FAIL: real purchase blocked by beta guard';
  end if;
  r := public.grant_beta_access('beta@test.it', 'standard', 7);
  r := public.revoke_beta_access('beta@test.it');
  if (select status from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000c') <> 'expired' then
    raise exception 'FAIL: revoke_beta_access';
  end if;
  begin
    r := public.grant_beta_access('nessuno@test.it');
    raise exception 'FAIL: grant for unknown email';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'Nessun account%' then raise exception 'FAIL: got %', sqlerrm; end if;
  end;
end $$;
set role authenticated;
do $$ begin
  begin
    perform public.grant_beta_access('a@test.it');
    raise exception 'FAIL: client called grant_beta_access';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.beta_testers;
    raise exception 'FAIL: client read beta_testers';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 10) Beta aperta: i nuovi account (anche ospiti) ricevono subito l'accesso; pulizia ospiti inattivi.
update public.beta_config set open_access = true, plan = 'standard', days = 14;
insert into auth.users (id, email, is_anonymous, created_at) values
  ('00000000-0000-0000-0000-00000000000d', null, true, now()),
  ('00000000-0000-0000-0000-00000000000e', null, true, now() - interval '60 days');
do $$ declare s record; n int; begin
  select * into s from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000d';
  if s.plan <> 'standard' or s.status <> 'trial' or s.store <> 'manual'
     or s.expires_at < now() + interval '13 days' or s.expires_at > now() + interval '15 days' then
    raise exception 'FAIL: open beta grant %', row_to_json(s);
  end if;
  n := public.cleanup_guest_users(30);
  if n <> 1 or exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000e') then
    raise exception 'FAIL: cleanup_guest_users removed %', n;
  end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000d') then
    raise exception 'FAIL: cleanup removed an active guest';
  end if;
end $$;
update public.beta_config set open_access = false;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000f', 'chiuso@test.it');
do $$ begin
  if (select status from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000f') <> 'none' then
    raise exception 'FAIL: grant with open beta off';
  end if;
end $$;
set role authenticated;
do $$ begin
  begin
    perform * from public.beta_config;
    raise exception 'FAIL: client read beta_config';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cleanup_guest_users(1);
    raise exception 'FAIL: client called cleanup_guest_users';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'ALL DB TESTS PASSED'
