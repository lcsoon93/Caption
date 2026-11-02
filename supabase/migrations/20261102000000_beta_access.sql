-- Beta chiusa: accesso concesso a mano ai tester, senza passare dagli store.
--
-- Uso (Supabase → SQL Editor):
--   select public.grant_beta_access('tester@example.com');               -- Pro per 30 giorni
--   select public.grant_beta_access('tester@example.com', 'standard', 14);
--   select public.revoke_beta_access('tester@example.com');
--   select * from public.beta_testers;                                     -- elenco
-- Il tester deve prima aver fatto l'accesso almeno una volta (l'account deve esistere).

create or replace function public.grant_beta_access(
  p_email text,
  p_plan public.plan_id default 'pro',
  p_days int default 30
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'p_days deve essere tra 1 e 365';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Nessun account per %: il tester deve prima accedere una volta all''app', p_email;
  end if;

  insert into public.subscriptions as s
    (user_id, plan, status, product_id, store, current_period_start, expires_at, will_renew, last_synced_at)
  values
    (v_user, p_plan, 'trial', 'beta_' || p_plan, 'manual', now(), now() + make_interval(days => p_days), false, now())
  on conflict (user_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    product_id = excluded.product_id,
    store = excluded.store,
    -- un nuovo periodo azzera il contatore solo se il precedente accesso beta era scaduto
    current_period_start = case
      when s.store = 'manual' and s.expires_at > now() then s.current_period_start
      else excluded.current_period_start
    end,
    expires_at = excluded.expires_at,
    will_renew = false,
    billing_issue_detected_at = null,
    last_synced_at = now(),
    updated_at = now();

  return format('Beta %s attiva per %s fino al %s', p_plan, p_email,
                to_char(now() + make_interval(days => p_days), 'DD/MM/YYYY'));
end;
$$;

create or replace function public.revoke_beta_access(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.subscriptions s
     set status = 'expired', expires_at = now(), will_renew = false, updated_at = now()
   from auth.users u
   where u.id = s.user_id and lower(u.email) = lower(trim(p_email)) and s.store = 'manual';
  get diagnostics n = row_count;
  return case when n = 0 then 'Nessun accesso beta per ' || p_email else 'Accesso beta revocato per ' || p_email end;
end;
$$;

-- Solo da SQL Editor / service role: mai dall'app.
revoke all on function public.grant_beta_access(text, public.plan_id, int) from public, anon, authenticated;
revoke all on function public.revoke_beta_access(text) from public, anon, authenticated;

create or replace view public.beta_testers
with (security_invoker = true) as
select u.email, s.plan, s.status, s.expires_at, s.expires_at > now() as attivo
  from public.subscriptions s
  join auth.users u on u.id = s.user_id
 where s.store = 'manual'
 order by s.expires_at desc;

revoke all on public.beta_testers from public, anon, authenticated;

-- Un accesso beta ancora valido non viene cancellato da una sincronizzazione
-- RevenueCat "senza abbonamento" (es. tester su TestFlight che non ha acquistato).
create or replace function public.keep_manual_access()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.store = 'manual' and old.expires_at > now()
     and new.store is distinct from 'manual'
     and new.status in ('none', 'expired') then
    return old;
  end if;
  return new;
end;
$$;

create trigger subscriptions_keep_manual_access
  before update on public.subscriptions
  for each row execute function public.keep_manual_access();
