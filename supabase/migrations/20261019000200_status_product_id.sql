-- get_my_status espone anche product_id: serve all'app per il cambio piano su Google Play.
drop function if exists public.get_my_status();

create function public.get_my_status()
returns table (
  plan public.plan_id,
  status public.subscription_status,
  has_access boolean,
  expires_at timestamptz,
  will_renew boolean,
  store text,
  product_id text,
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
         s.product_id,
         coalesce(s.current_period_start, date_trunc('month', now())),
         s.expires_at,
         coalesce(u.credits_used, 0)
  from public.subscriptions s
  left join public.usage_periods u
    on u.user_id = s.user_id
   and u.period_start = coalesce(s.current_period_start, date_trunc('month', now()))
  where s.user_id = auth.uid();
$$;

revoke execute on function public.get_my_status() from public, anon;
grant execute on function public.get_my_status() to authenticated;
