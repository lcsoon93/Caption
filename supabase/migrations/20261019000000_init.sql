-- =====================================================================
-- Caption — schema iniziale
-- Principi:
--   * Il client legge solo i propri dati (RLS) e non scrive mai su
--     abbonamenti, utilizzi o ledger: lo fanno le Edge Functions (service_role).
--   * Le quote vengono consumate in modo atomico da `reserve_generation`
--     (lock di riga per utente) e rimborsate da `fail_generation`.
--   * Privacy: il contesto inserito dall'utente NON viene salvato.
--     Si salvano solo le caption generate (lo storico) e metadati tecnici.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------
create type public.plan_id as enum ('base', 'standard', 'pro');

create type public.subscription_status as enum (
  'active', 'trial', 'cancelled', 'in_grace_period', 'expired', 'none'
);

create type public.generation_kind as enum ('generate', 'refine');

create type public.generation_status as enum ('pending', 'succeeded', 'failed');

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  onboarding_completed_at timestamptz,
  analytics_opt_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- subscriptions — specchio dello stato RevenueCat (scritto solo dal server)
-- ---------------------------------------------------------------------
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan public.plan_id,
  status public.subscription_status not null default 'none',
  product_id text,
  store text,
  is_sandbox boolean not null default false,
  current_period_start timestamptz,
  expires_at timestamptz,
  will_renew boolean not null default false,
  billing_issue_detected_at timestamptz,
  last_synced_at timestamptz not null default now(),
  last_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_plan_when_active check (status in ('none', 'expired') or plan is not null)
);

-- ---------------------------------------------------------------------
-- usage_periods — contatore crediti per periodo di fatturazione
-- ---------------------------------------------------------------------
create table public.usage_periods (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz,
  plan public.plan_id not null,
  credits_used integer not null default 0 check (credits_used >= 0),
  credits_limit integer, -- snapshot del limite visibile; null = illimitato
  cost_micros bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

-- ---------------------------------------------------------------------
-- generations — ledger tecnico (token, costi, latenza). Nessun contenuto utente.
-- ---------------------------------------------------------------------
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.generation_kind not null,
  status public.generation_status not null default 'pending',
  plan public.plan_id not null,
  period_start timestamptz not null,
  credits integer not null check (credits >= 0),
  post_type text not null,
  tone text not null,
  refine_action text,
  parent_caption_id uuid,
  model text not null,
  model_served text,
  prompt_version text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_micros bigint not null default 0,
  latency_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index generations_user_created_idx on public.generations (user_id, created_at desc);
create index generations_pending_idx on public.generations (created_at) where status = 'pending';

-- ---------------------------------------------------------------------
-- captions — lo storico visibile all'utente
-- ---------------------------------------------------------------------
create table public.captions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_id uuid not null references public.generations (id) on delete cascade,
  parent_caption_id uuid references public.captions (id) on delete set null,
  post_type text not null,
  tone text not null,
  refine_action text,
  text text not null check (char_length(text) between 1 and 1200),
  hashtags text[] not null default '{}',
  position smallint not null default 0,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create index captions_user_created_idx on public.captions (user_id, created_at desc);
create index captions_generation_idx on public.captions (generation_id);
create index captions_parent_idx on public.captions (parent_caption_id);

-- ---------------------------------------------------------------------
-- Budget di spesa e aggregati (solo server)
-- ---------------------------------------------------------------------
create table public.spend_budgets (
  scope text primary key,                -- 'global'
  monthly_limit_micros bigint not null check (monthly_limit_micros >= 0),
  alert_threshold_pct smallint not null default 80 check (alert_threshold_pct between 1 and 100),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.spend_budgets (scope, monthly_limit_micros) values ('global', 500000000); -- 500 $

create table public.spend_monthly (
  month date primary key,
  cost_micros bigint not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  generations integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- revenuecat_events — idempotenza webhook (payload non salvato)
-- ---------------------------------------------------------------------
create table public.revenuecat_events (
  id text primary key,
  type text not null,
  app_user_id text,
  environment text,
  received_at timestamptz not null default now()
);

-- =====================================================================
-- Trigger
-- =====================================================================
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

-- Alla registrazione: profilo + riga abbonamento vuota.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_periods enable row level security;
alter table public.generations enable row level security;
alter table public.captions enable row level security;
alter table public.spend_budgets enable row level security;
alter table public.spend_monthly enable row level security;
alter table public.revenuecat_events enable row level security;

-- Privilegi di colonna: il client può toccare solo ciò che serve.
revoke all on public.profiles, public.subscriptions, public.usage_periods, public.generations,
  public.captions, public.spend_budgets, public.spend_monthly, public.revenuecat_events
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, onboarding_completed_at, analytics_opt_out) on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.usage_periods to authenticated;
grant select, delete on public.captions to authenticated;
grant update (is_favorite) on public.captions to authenticated;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "usage: read own" on public.usage_periods
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "captions: read own" on public.captions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "captions: update own" on public.captions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "captions: delete own" on public.captions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- generations, spend_*, revenuecat_events: nessuna policy => accesso negato ai client.

-- =====================================================================
-- RPC
-- =====================================================================

-- Helper: solleva un errore applicativo con codice leggibile dall'Edge Function.
create or replace function public.raise_app_error(p_code text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_detail::text;
end;
$$;

-- ---------------------------------------------------------------------
-- reserve_generation: controllo piano + limiti + rate limit + budget,
-- e consumo atomico del credito. Chiamata solo dal service_role.
-- ---------------------------------------------------------------------
create or replace function public.reserve_generation(
  p_user_id uuid,
  p_kind public.generation_kind,
  p_expected_plan public.plan_id,
  p_credits integer,
  p_enforced_limit integer,          -- limite applicato (fair use per Pro)
  p_visible_limit integer,           -- limite mostrato all'utente (null = illimitato)
  p_rate_per_minute integer,
  p_rate_per_hour integer,
  p_period_cost_cap_micros bigint,
  p_post_type text,
  p_tone text,
  p_refine_action text,
  p_parent_caption_id uuid,
  p_model text,
  p_prompt_version text
)
returns table (
  generation_id uuid,
  credits_used integer,
  credits_limit integer,
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_sub public.subscriptions%rowtype;
  v_period_start timestamptz;
  v_usage public.usage_periods%rowtype;
  v_recent_minute integer;
  v_recent_hour integer;
  v_budget public.spend_budgets%rowtype;
  v_month_cost bigint;
  v_generation_id uuid;
begin
  select * into v_sub from public.subscriptions s where s.user_id = p_user_id;

  if not found or v_sub.plan is null or v_sub.status = 'none' then
    perform public.raise_app_error('no_subscription');
  end if;
  if v_sub.status = 'expired' or v_sub.expires_at is null or v_sub.expires_at <= now() then
    perform public.raise_app_error('subscription_expired',
      jsonb_build_object('expiredAt', v_sub.expires_at));
  end if;
  if v_sub.plan <> p_expected_plan then
    perform public.raise_app_error('plan_changed', jsonb_build_object('plan', v_sub.plan));
  end if;

  v_period_start := coalesce(v_sub.current_period_start, date_trunc('month', now()));

  -- Riga del periodo + lock: serializza le richieste concorrenti dello stesso utente.
  insert into public.usage_periods as u (user_id, period_start, period_end, plan, credits_limit)
  values (p_user_id, v_period_start, v_sub.expires_at, v_sub.plan, p_visible_limit)
  on conflict on constraint usage_periods_pkey do update
    set period_end = excluded.period_end, plan = excluded.plan, credits_limit = excluded.credits_limit;

  select * into v_usage from public.usage_periods u
  where u.user_id = p_user_id and u.period_start = v_period_start
  for update;

  if v_usage.credits_used + p_credits > p_enforced_limit then
    perform public.raise_app_error('quota_exceeded', jsonb_build_object(
      'used', v_usage.credits_used, 'limit', coalesce(p_visible_limit, p_enforced_limit),
      'periodEnd', v_usage.period_end));
  end if;

  if v_usage.cost_micros >= p_period_cost_cap_micros then
    perform public.raise_app_error('quota_exceeded', jsonb_build_object('reason', 'cost_cap'));
  end if;

  select count(*) filter (where g.created_at > now() - interval '1 minute'),
         count(*)
    into v_recent_minute, v_recent_hour
  from public.generations g
  where g.user_id = p_user_id and g.created_at > now() - interval '1 hour';

  if v_recent_minute >= p_rate_per_minute or v_recent_hour >= p_rate_per_hour then
    perform public.raise_app_error('rate_limited', jsonb_build_object(
      'retryAfterSeconds', case when v_recent_minute >= p_rate_per_minute then 60 else 600 end));
  end if;

  select * into v_budget from public.spend_budgets b where b.scope = 'global' and b.enabled;
  if found then
    select coalesce(m.cost_micros, 0) into v_month_cost
    from public.spend_monthly m where m.month = (date_trunc('month', now() at time zone 'utc'))::date;
    if coalesce(v_month_cost, 0) >= v_budget.monthly_limit_micros then
      perform public.raise_app_error('budget_exceeded');
    end if;
  end if;

  insert into public.generations (
    user_id, kind, plan, period_start, credits, post_type, tone, refine_action,
    parent_caption_id, model, prompt_version
  ) values (
    p_user_id, p_kind, v_sub.plan, v_period_start, p_credits, p_post_type, p_tone, p_refine_action,
    p_parent_caption_id, p_model, p_prompt_version
  ) returning id into v_generation_id;

  update public.usage_periods u
     set credits_used = u.credits_used + p_credits, updated_at = now()
   where u.user_id = p_user_id and u.period_start = v_period_start;

  return query select v_generation_id, v_usage.credits_used + p_credits, p_visible_limit,
                      v_period_start, v_usage.period_end;
end;
$$;

-- ---------------------------------------------------------------------
-- complete_generation: salva caption, token, costi; applica il limite storico.
-- p_captions: [{ "text": "...", "hashtags": ["#..."] }, ...]
-- ---------------------------------------------------------------------
create or replace function public.complete_generation(
  p_generation_id uuid,
  p_captions jsonb,
  p_model_served text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_read_tokens integer,
  p_cache_write_tokens integer,
  p_cost_micros bigint,
  p_latency_ms integer,
  p_history_limit integer           -- null = storico completo
)
returns setof public.captions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gen public.generations%rowtype;
begin
  select * into v_gen from public.generations g where g.id = p_generation_id for update;
  if not found then
    perform public.raise_app_error('not_found');
  end if;
  if v_gen.status <> 'pending' then
    perform public.raise_app_error('generation_not_pending');
  end if;
  if jsonb_typeof(p_captions) <> 'array' or jsonb_array_length(p_captions) = 0 then
    perform public.raise_app_error('ai_bad_output');
  end if;

  update public.generations g set
    status = 'succeeded',
    model_served = p_model_served,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    cache_read_tokens = p_cache_read_tokens,
    cache_write_tokens = p_cache_write_tokens,
    cost_micros = p_cost_micros,
    latency_ms = p_latency_ms,
    completed_at = now()
  where g.id = p_generation_id;

  update public.usage_periods u
     set cost_micros = u.cost_micros + p_cost_micros, updated_at = now()
   where u.user_id = v_gen.user_id and u.period_start = v_gen.period_start;

  insert into public.spend_monthly as m (month, cost_micros, input_tokens, output_tokens, generations)
  values ((date_trunc('month', now() at time zone 'utc'))::date, p_cost_micros,
          p_input_tokens + p_cache_read_tokens + p_cache_write_tokens, p_output_tokens, 1)
  on conflict (month) do update set
    cost_micros = m.cost_micros + excluded.cost_micros,
    input_tokens = m.input_tokens + excluded.input_tokens,
    output_tokens = m.output_tokens + excluded.output_tokens,
    generations = m.generations + 1,
    updated_at = now();

  insert into public.captions (user_id, generation_id, parent_caption_id, post_type, tone,
                               refine_action, text, hashtags, position)
  select v_gen.user_id, v_gen.id, v_gen.parent_caption_id, v_gen.post_type, v_gen.tone,
         v_gen.refine_action, c.value ->> 'text',
         coalesce(array(select jsonb_array_elements_text(coalesce(c.value -> 'hashtags', '[]'::jsonb))), '{}'),
         (c.ordinality - 1)::smallint
  from jsonb_array_elements(p_captions) with ordinality as c(value, ordinality);

  if p_history_limit is not null then
    delete from public.captions c
    where c.user_id = v_gen.user_id
      and c.id not in (
        select k.id from public.captions k
        where k.user_id = v_gen.user_id
        order by k.created_at desc, k.position asc
        limit p_history_limit
      );
  end if;

  return query
    select * from public.captions c where c.generation_id = p_generation_id order by c.position;
end;
$$;

-- ---------------------------------------------------------------------
-- fail_generation: marca come fallita e rimborsa il credito.
-- ---------------------------------------------------------------------
create or replace function public.fail_generation(
  p_generation_id uuid,
  p_error_code text,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_cost_micros bigint default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gen public.generations%rowtype;
begin
  select * into v_gen from public.generations g where g.id = p_generation_id for update;
  if not found or v_gen.status <> 'pending' then
    return;
  end if;

  update public.generations g set
    status = 'failed', error_code = left(p_error_code, 64), completed_at = now(),
    input_tokens = p_input_tokens, output_tokens = p_output_tokens, cost_micros = p_cost_micros
  where g.id = p_generation_id;

  update public.usage_periods u set
    credits_used = greatest(u.credits_used - v_gen.credits, 0),
    cost_micros = u.cost_micros + p_cost_micros,
    updated_at = now()
  where u.user_id = v_gen.user_id and u.period_start = v_gen.period_start;

  if p_cost_micros > 0 then
    insert into public.spend_monthly as m (month, cost_micros, input_tokens, output_tokens, generations)
    values ((date_trunc('month', now() at time zone 'utc'))::date, p_cost_micros,
            p_input_tokens, p_output_tokens, 0)
    on conflict (month) do update set
      cost_micros = m.cost_micros + excluded.cost_micros,
      input_tokens = m.input_tokens + excluded.input_tokens,
      output_tokens = m.output_tokens + excluded.output_tokens,
      updated_at = now();
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- get_my_status: stato abbonamento + utilizzo del periodo (per l'app).
-- ---------------------------------------------------------------------
create or replace function public.get_my_status()
returns table (
  plan public.plan_id,
  status public.subscription_status,
  has_access boolean,
  expires_at timestamptz,
  will_renew boolean,
  store text,
  period_start timestamptz,
  period_end timestamptz,
  credits_used integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.plan,
         s.status,
         coalesce(s.plan is not null and s.status not in ('none', 'expired') and s.expires_at > now(), false),
         s.expires_at,
         s.will_renew,
         s.store,
         coalesce(s.current_period_start, date_trunc('month', now())),
         s.expires_at,
         coalesce(u.credits_used, 0)
  from public.subscriptions s
  left join public.usage_periods u
    on u.user_id = s.user_id
   and u.period_start = coalesce(s.current_period_start, date_trunc('month', now()))
  where s.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Manutenzione: rimborsa generazioni bloccate e applica la retention.
-- ---------------------------------------------------------------------
create or replace function public.run_maintenance(p_caption_retention_days integer default 365)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stale integer := 0;
  v_purged integer := 0;
  r record;
begin
  for r in
    select g.id from public.generations g
    where g.status = 'pending' and g.created_at < now() - interval '5 minutes'
  loop
    perform public.fail_generation(r.id, 'timeout_stale');
    v_stale := v_stale + 1;
  end loop;

  delete from public.captions c
  where c.created_at < now() - make_interval(days => p_caption_retention_days)
    and not c.is_favorite;
  get diagnostics v_purged = row_count;

  delete from public.revenuecat_events e where e.received_at < now() - interval '90 days';

  return jsonb_build_object('staleRefunded', v_stale, 'captionsPurged', v_purged);
end;
$$;

-- Permessi di esecuzione: in Postgres le funzioni sono eseguibili da PUBLIC per default.
revoke execute on function public.raise_app_error(text, jsonb) from public, anon, authenticated;
revoke execute on function public.reserve_generation(uuid, public.generation_kind, public.plan_id, integer,
  integer, integer, integer, integer, bigint, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.complete_generation(uuid, jsonb, text, integer, integer, integer, integer,
  bigint, integer, integer) from public, anon, authenticated;
revoke execute on function public.fail_generation(uuid, text, integer, integer, bigint) from public, anon, authenticated;
revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.get_my_status() from public, anon;

grant execute on function public.reserve_generation(uuid, public.generation_kind, public.plan_id, integer,
  integer, integer, integer, integer, bigint, text, text, text, uuid, text, text) to service_role;
grant execute on function public.complete_generation(uuid, jsonb, text, integer, integer, integer, integer,
  bigint, integer, integer) to service_role;
grant execute on function public.fail_generation(uuid, text, integer, integer, bigint) to service_role;
grant execute on function public.run_maintenance(integer) to service_role;
grant execute on function public.raise_app_error(text, jsonb) to service_role;
grant execute on function public.get_my_status() to authenticated;
