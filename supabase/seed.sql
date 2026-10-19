-- Seed per sviluppo locale (`supabase db reset`).
-- Crea un utente di test con abbonamento Standard attivo per provare la generazione
-- senza passare dallo store. Login: OTP via Inbucket (http://127.0.0.1:54324).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'dev@caption.local', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict do nothing;

update public.subscriptions
   set plan = 'standard', status = 'active', product_id = 'dev_standard', store = 'dev',
       current_period_start = date_trunc('month', now()), expires_at = date_trunc('month', now()) + interval '1 month',
       will_renew = true
 where user_id = '00000000-0000-4000-8000-000000000001';
