-- get_my_status non ha bisogno di SECURITY DEFINER: legge solo righe dell'utente
-- (subscriptions e usage_periods hanno policy "read own"). Con SECURITY INVOKER
-- valgono le RLS e sparisce l'avviso del security advisor di Supabase.
alter function public.get_my_status() security invoker;
