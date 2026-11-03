-- Beta aperta: ogni nuovo account (anche ospite, senza email) riceve subito l'accesso beta.
--
-- Spegnere / riaccendere (Supabase → SQL Editor):
--   update public.beta_config set open_access = false;            -- stop ai nuovi ingressi liberi
--   update public.beta_config set open_access = true, plan = 'standard', days = 14;
-- Gli account già creati mantengono l'accesso fino alla scadenza (revocabile con revoke_beta_access
-- per chi ha un'email; per gli ospiti vedi sotto).

create table public.beta_config (
  id boolean primary key default true check (id), -- una sola riga
  open_access boolean not null default false,
  plan public.plan_id not null default 'pro',
  days int not null default 30 check (days between 1 and 365)
);
insert into public.beta_config (open_access, plan, days) values (true, 'pro', 30);

alter table public.beta_config enable row level security;
revoke all on public.beta_config from public, anon, authenticated;

-- La riga abbonamento vuota nasce da handle_new_user: qui la trasformiamo in accesso beta.
create or replace function public.apply_open_beta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.beta_config;
begin
  select * into cfg from public.beta_config where id;
  if found and cfg.open_access and new.status = 'none' then
    new.plan := cfg.plan;
    new.status := 'trial';
    new.product_id := 'beta_' || cfg.plan;
    new.store := 'manual';
    new.current_period_start := now();
    new.expires_at := now() + make_interval(days => cfg.days);
    new.will_renew := false;
  end if;
  return new;
end;
$$;

create trigger subscriptions_apply_open_beta
  before insert on public.subscriptions
  for each row execute function public.apply_open_beta();

-- Gli ospiti non si possono "ritrovare" da un altro browser: si puliscono quelli inattivi.
--   select public.cleanup_guest_users(30);   -- elimina ospiti senza accessi da 30 giorni
create or replace function public.cleanup_guest_users(p_inactive_days int default 30)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  delete from auth.users
   where is_anonymous
     and coalesce(last_sign_in_at, created_at) < now() - make_interval(days => p_inactive_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.apply_open_beta() from public, anon, authenticated;
revoke all on function public.cleanup_guest_users(int) from public, anon, authenticated;
