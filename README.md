# Caption

App mobile (iOS + Android) che genera caption Instagram in italiano di alta qualità con Claude.
L'utente sceglie **tipo di post** e **tono**, aggiunge un contesto opzionale e riceve 4–6 caption
pronte da copiare, rifinire o condividere. Solo abbonamento: **nessun piano free**.

| Livello | Tecnologia |
| --- | --- |
| App | React Native + Expo SDK 58 (TypeScript strict, expo-router) |
| Backend | Supabase: Auth, Postgres + RLS, Edge Functions (Deno) |
| AI | API Anthropic, Claude Sonnet 5.5 (`claude-sonnet-5-5`), solo lato server |
| Pagamenti | RevenueCat (App Store + Google Play) |
| Analytics | PostHog (EU) |
| Build | EAS Build / Submit |

---

## Struttura del monorepo

```
.
├── apps/mobile/                  App Expo
│   ├── app/                      Schermate (expo-router)
│   │   ├── index.tsx             Gate: onboarding → login → paywall → app
│   │   ├── onboarding.tsx        3 slide (valore, esempio, azione)
│   │   ├── sign-in.tsx           Apple, Google (OAuth PKCE), email OTP
│   │   ├── paywall.tsx           Paywall custom: gate / rinnovo / upgrade
│   │   └── (tabs)/               Crea · Storico · Account
│   └── src/
│       ├── components/           CaptionCard, Chip, Button, UsageMeter, Banner, Skeleton…
│       ├── hooks/                useCaptionGenerator (generazione + rifinitura)
│       ├── lib/                  supabase, api, auth, purchases, analytics, storage
│       ├── providers/            SessionProvider (sessione + abbonamento), UpgradeProvider (upsell)
│       └── theme/                Design tokens (dark-first) + light mode
├── packages/shared/              @caption/shared → re-esporta il dominio per l'app
├── supabase/
│   ├── config.toml               Config CLI (auth, funzioni, verify_jwt)
│   ├── migrations/               Schema, RLS, RPC, cron
│   ├── seed.sql                  Utente di sviluppo con piano Standard
│   ├── tests/                    Test SQL (RLS, quote, rimborsi, rate limit, budget)
│   └── functions/
│       ├── _shared/
│       │   ├── domain/           ⭐ Fonte di verità: catalogo, piani, contratto API (puro TS)
│       │   ├── prompts/          Prompt di sistema versionato + CHANGELOG
│       │   ├── ai.ts             Adattatore Anthropic (structured output, fallback, errori)
│       │   ├── revenuecat.ts     Stato abbonamento da RevenueCat
│       │   ├── store.ts          Accesso DB (RPC atomiche)
│       │   ├── postprocess.ts    Pulizia output del modello
│       │   └── pricing.ts        Costo per token → micro-USD
│       ├── generate-captions/    Generazione + rifinitura (controllo piano e limiti)
│       ├── sync-subscription/    Sync immediato dopo acquisto/ripristino
│       ├── revenuecat-webhook/   Webhook RevenueCat (idempotente)
│       ├── delete-account/       Cancellazione account (obbligatoria per gli store)
│       └── tests/                Test unitari Deno
└── .github/workflows/ci.yml      Lint, typecheck e test
```

Il dominio vive in `supabase/functions/_shared/domain` perché il bundler delle Edge Functions
include solo file sotto `supabase/functions`; l'app lo importa tramite `@caption/shared`
(Metro è configurato per il monorepo). **Una sola definizione** di piani, toni e contratto API.

---

## Architettura e flusso di generazione

```
App ──JWT──▶ generate-captions (Edge Function)
               1. verifica JWT
               2. valida input (tipo, tono, contesto ≤ 400 caratteri)
               3. pre-check piano: tono/rifinitura inclusi? (403 + piano minimo per l'upsell)
               4. RPC reserve_generation  ── transazione con lock per utente:
                    abbonamento attivo e non scaduto · quota del periodo · tetto di costo
                    per utente · rate limit minuto/ora · budget globale mensile
                    → consuma il credito e crea la riga in `generations`
               5. Claude Sonnet 5.5 (structured output JSON, effort low, timeout 15 s)
               6a. ok   → RPC complete_generation: salva caption, token, costo, applica limite storico
               6b. errore → RPC fail_generation: credito rimborsato, costo comunque registrato
```

- La chiave Anthropic esiste **solo** come secret delle Edge Functions.
- Il client non può scrivere su `subscriptions`, `usage_periods`, `generations` (RLS + privilegi
  di colonna). Le RPC di quota sono eseguibili solo da `service_role`.
- Una generazione rimasta `pending` oltre 5 minuti viene rimborsata da `run_maintenance()`
  (pg_cron ogni 10 minuti).

### Piani (`supabase/functions/_shared/domain/plans.ts`)

| | Base 0,99 € | Standard 2,99 € | Pro 4,99 € |
| --- | --- | --- | --- |
| Generazioni / mese | 30 | 150 | illimitate (fair use 1000) |
| Caption per richiesta | 4 | 5 | 6 |
| Toni | Diretto, Soft, Minimal, Poetico | tutti e 7 | tutti e 7 |
| Rifiniture | — | Più poetica, Più corta, Più ironica, Rigenera | + Più lunga, In inglese |
| Hashtag intelligenti | — | — | ✓ |
| Storico | ultime 40 caption | completo | completo |
| Rate limit | 4/min · 30/h | 6/min · 80/h | 10/min · 150/h |
| Tetto costo AI / periodo | 0,40 $ | 1,60 $ | 3,00 $ |

**1 credito = 1 richiesta** (una generazione da 4–6 caption, oppure una rifinitura). Il costo in
crediti è in `CREDIT_COST`. Il periodo di utilizzo coincide con il periodo di fatturazione
RevenueCat (si azzera al rinnovo o al cambio piano).

### Stati abbonamento

`active` · `trial` · `cancelled` (disdetto, valido fino a scadenza) · `in_grace_period`
(pagamento fallito, accesso mantenuto durante il grace period) · `expired` · `none`.
Lo stato si ricava sempre da `GET /v1/subscribers/{id}` di RevenueCat (fonte di verità), sia dal
webhook sia da `sync-subscription`: eventi duplicati o fuori ordine non creano incoerenze.

---

## Setup

### Prerequisiti

- Node 22+, pnpm 10 (`corepack enable`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (installata come devDependency) e Docker per lo stack locale
- [Deno 2](https://deno.com) per lint e test delle funzioni
- Account: Supabase, Anthropic (Console), RevenueCat, Apple Developer, Google Play Console, Expo/EAS

### 1. Installazione

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
cp supabase/functions/.env.example supabase/functions/.env
```

### 2. Supabase in locale

```bash
pnpm db:start                     # avvia lo stack (Postgres, Auth, Studio su :54323)
pnpm db:reset                     # applica migrazioni + seed
pnpm functions:serve              # Edge Functions su http://127.0.0.1:54321/functions/v1
```

Il seed crea `dev@caption.local` con piano Standard attivo: accedi con OTP (le email locali sono
su Inbucket, http://127.0.0.1:54324) e puoi generare senza passare dallo store.

Prova rapida con curl (prendi l'access token dall'app o da Studio):

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/generate-captions \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"generate","postType":"viaggio","tone":"ironico","context":"weekend a Lisbona, pioggia"}'
```

### 3. Supabase in produzione

```bash
supabase link --project-ref <ref>
supabase db push
supabase secrets set --env-file supabase/functions/.env
pnpm deploy:functions             # revenuecat-webhook è deployata con --no-verify-jwt
```

Da dashboard: abilita **pg_cron** (Database → Extensions) e riesegui la migrazione
`20261019000100_maintenance_cron.sql`, oppure schedula `select public.run_maintenance(365)`.
In Auth → Providers abilita Email (OTP), Apple e Google; in Auth → URL Configuration aggiungi
`caption://auth-callback` ai redirect consentiti (login Google via browser di sistema).

### 4. RevenueCat

1. Crea i prodotti negli store (abbonamenti mensili auto-rinnovabili), ad es.
   `caption_base_monthly`, `caption_standard_monthly`, `caption_pro_monthly`, in un unico gruppo
   di abbonamento (così upgrade/downgrade sono gestiti dallo store).
2. In RevenueCat crea gli **entitlement** con identificatori esatti `base`, `standard`, `pro`
   (mappati in `_shared/revenuecat.ts → ENTITLEMENT_TO_PLAN`) e collega ciascun prodotto.
3. Crea un'**Offering** `default` con i tre package. Il paywall è custom: ogni package viene
   associato al piano cercando `base` / `standard` / `pro` nell'identificatore del prodotto
   (`src/lib/purchases.ts → getPlanPackages`), e il prezzo mostrato è quello localizzato dello store.
4. Webhook (Integrations → Webhooks):
   URL `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization header = valore di `REVENUECAT_WEBHOOK_AUTH`.
5. Copia la **Secret API key** in `REVENUECAT_SECRET_API_KEY` e le **public SDK key** iOS/Android
   in `apps/mobile/.env`.

L'`app_user_id` RevenueCat è sempre l'id utente Supabase (`Purchases.configure({ appUserID })`):
il login avviene prima del paywall. Gli acquisti sandbox (TestFlight, revisione Apple) sono
accettati e marcati con `is_sandbox`.

### 5. App

```bash
pnpm --filter @caption/mobile build:dev   # development build (serve per RevenueCat, non Expo Go)
pnpm mobile                               # Metro con dev client
```

---

### 6. Versione web

La stessa app gira nel browser (Expo per il web), utile per test e come canale aggiuntivo.

```bash
pnpm --filter @caption/mobile build:web   # → apps/mobile/dist (con una pagina per ogni rotta)
```

Hosting: sito statico (es. Render) con
- build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @caption/mobile build:web`
- publish directory: `apps/mobile/dist`
- variabili: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `NODE_VERSION=22`, `CI=1`

Differenze sul web: niente acquisti (l'abbonamento si attiva dall'app mobile e vale anche
sul web; RevenueCat Web Billing è un passo successivo), login con email o Google (redirect su
`/auth-callback`, da aggiungere agli URL consentiti in Supabase), niente Sign in with Apple.

### 7. Beta chiusa (web su GitHub Pages + Groq)

- **Sito:** `.github/workflows/deploy-pages.yml` pubblica la build web in modalità beta su
  `https://lcsoon93.github.io/Caption/`. Una tantum: Settings → Pages → Source = *GitHub Actions*.
  Pages con repo privato richiede un piano GitHub a pagamento; su repo privato il workflow
  parte solo a mano (Actions → *Deploy web beta* → Run workflow).
- **Modalità beta** (`EXPO_PUBLIC_CLOSED_BETA=true`): il paywall diventa "accesso solo su invito",
  niente prezzi né acquisti.
- **Invitare un tester:** il tester accede una volta (si crea l'account), poi in SQL Editor:
  ```sql
  select public.grant_beta_access('email@tester.it');               -- Pro, 30 giorni
  select public.grant_beta_access('email@tester.it', 'standard', 14);
  select public.revoke_beta_access('email@tester.it');
  select * from public.beta_testers;
  ```
- **AI:** secrets `AI_PROVIDER=groq` e `GROQ_API_KEY` (console.groq.com). Per la versione
  pubblica si torna a Claude con `AI_PROVIDER=anthropic`.
- **Email:** l'SMTP integrato di Supabase (piano gratuito) invia solo ai membri del team del
  progetto: per tester esterni serve un SMTP proprio (es. Resend con un dominio).

## Variabili d'ambiente

### Edge Functions (secrets Supabase)

| Variabile | Obbl. | Default | Descrizione |
| --- | --- | --- | --- |
| `AI_PROVIDER` | | `anthropic` | `groq` per la beta chiusa, `gemini` solo per sviluppo/test |
| `ANTHROPIC_API_KEY` | ✓¹ | | Chiave API Anthropic (solo server) |
| `ANTHROPIC_MODEL` | | `claude-sonnet-5-5` | Modello |
| `ANTHROPIC_EFFORT` | | `low` | `low` / `medium` / `high` |
| `ANTHROPIC_THINKING` | | `adaptive` | `between_tools` disattiva il ragionamento (latenza minima) |
| `ANTHROPIC_MAX_TOKENS` | | `2048` | Tetto output |
| `ANTHROPIC_TIMEOUT_MS` | | `15000` | Timeout della chiamata |
| `ANTHROPIC_SERVER_FALLBACK` | | `true` | Fallback server-side se i classificatori rifiutano |
| `REVENUECAT_SECRET_API_KEY` | ✓ | | Secret API key v1 |
| `REVENUECAT_WEBHOOK_AUTH` | ✓ | | Segreto condiviso del webhook |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | auto | | Iniettate da Supabase |
| `GROQ_API_KEY` | ✓³ | | Chiave Groq (console.groq.com) |
| `GROQ_MODEL` | | `openai/gpt-oss-120b` | Modello con output JSON "strict" |
| `GROQ_REASONING_EFFORT` | | `low` | `low` / `medium` / `high` (solo gpt-oss) |
| `GROQ_TIMEOUT_MS` | | `20000` | Timeout della chiamata |
| `GROQ_PRICE_INPUT_PER_MTOK`, `GROQ_PRICE_OUTPUT_PER_MTOK` | | `0.15` / `0.6` | Prezzi di listino per il contatore costi |
| `GEMINI_API_KEY` | ✓² | | Chiave Google AI Studio |
| `GEMINI_MODEL` | | `gemini-3.8-flash` | Modello Gemini |
| `GEMINI_THINKING_LEVEL` | | `LOW` | `MINIMAL` / `LOW` / `MEDIUM` / `HIGH` |
| `GEMINI_PRICE_INPUT_PER_MTOK`, `GEMINI_PRICE_OUTPUT_PER_MTOK` | | `0` | Prezzi per il contatore costi (0 = piano gratuito) |

¹ con `AI_PROVIDER=anthropic` · ² con `AI_PROVIDER=gemini` · ³ con `AI_PROVIDER=groq`

**Gemini è solo per sviluppo e test.** Il piano gratuito consente a Google di usare i testi
inviati per migliorare i propri prodotti: non usarlo con utenti reali. Il prompt è calibrato
per Claude, quindi qualità e tempi con Gemini non sono indicativi del prodotto finale.
Per tornare a Claude: `AI_PROVIDER=anthropic` (o rimuovi la variabile) e imposta `ANTHROPIC_API_KEY`.

### App (`EXPO_PUBLIC_*`, finiscono nel bundle: solo valori pubblici)

`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY`,
`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`,
`EXPO_PUBLIC_CLOSED_BETA` (beta chiusa), `EXPO_PUBLIC_BASE_URL` (sito in sottocartella, es. `/Caption`).

---

## API

`POST /functions/v1/generate-captions` (JWT utente)

```jsonc
// Generazione
{ "action": "generate", "postType": "cibo", "tone": "ironico", "context": "carbonara della nonna", "includeHashtags": false }
// Rifinitura di una caption dello storico
{ "action": "refine", "captionId": "<uuid>", "refineAction": "shorter" }
```

Risposta `200`:

```jsonc
{
  "generationId": "…",
  "captions": [{ "id": "…", "text": "…", "hashtags": [], "postType": "cibo", "tone": "ironico",
                 "refineAction": null, "parentCaptionId": null, "createdAt": "…" }],
  "usage": { "plan": "standard", "used": 12, "limit": 150, "remaining": 138, "periodStart": "…", "periodEnd": "…" }
}
```

Errori: `{ "error": { "code", "message", "details?" } }` con messaggio in italiano pronto per la UI.

| Codice | HTTP | Quando |
| --- | --- | --- |
| `unauthorized` | 401 | JWT mancante o scaduto |
| `invalid_request` | 400 | Input non valido |
| `no_subscription` / `subscription_expired` | 402 | Nessun abbonamento / scaduto → paywall |
| `quota_exceeded` | 402 | Crediti del mese esauriti → upgrade |
| `feature_not_in_plan` | 403 | Tono/rifinitura non inclusi (`details.requiredPlan`) |
| `rate_limited` | 429 | Troppe richieste (`Retry-After`) |
| `not_found` | 404 | Caption da rifinire inesistente o di un altro utente |
| `content_refused` | 422 | Contenuto rifiutato dai filtri di sicurezza |
| `ai_bad_output` | 502 | Output non valido (credito rimborsato) |
| `ai_unavailable` / `budget_exceeded` | 503 | AI sovraccarica / budget globale raggiunto |

Altre funzioni: `sync-subscription` (POST, JWT), `delete-account` (POST, JWT),
`revenuecat-webhook` (POST, segreto condiviso). Stato e contatore: RPC `get_my_status()`.

---

## Costi, budget e monitoraggio

Stima per generazione con Sonnet 5.5 ($2 / $10 per milione di token): ~1k token di system
prompt (in cache dopo la prima richiesta), ~150 token di input, ~400–500 di output →
**≈ 0,005 $**. Base ≈ 0,15 $/mese, Standard ≈ 0,75 $/mese a pieno utilizzo.

- Ogni chiamata registra in `generations` token (input, output, cache read/write), costo in
  micro-USD, latenza, modello effettivo e `prompt_version`.
- Budget globale mensile in `spend_budgets` (default 500 $):
  `update spend_budgets set monthly_limit_micros = 300000000 where scope = 'global';`
- Tetto di costo per utente e periodo in `plans.ts` (`periodCostCapMicros`).

```sql
-- Spesa del mese
select * from spend_monthly order by month desc;
-- Latenza p50/p95 e costo medio per versione del prompt
select prompt_version, percentile_cont(0.5) within group (order by latency_ms) p50,
       percentile_cont(0.95) within group (order by latency_ms) p95, avg(cost_micros) avg_cost
from generations where status = 'succeeded' and created_at > now() - interval '7 days' group by 1;
```

Se la p95 supera i 7 s, imposta `ANTHROPIC_THINKING=between_tools`.

## Privacy

- Il **contesto** scritto dall'utente non viene mai salvato: va solo al modello.
- Salviamo le caption generate (lo storico) e metadati tecnici senza contenuti.
- Retention: caption non preferite cancellate dopo 365 giorni, eventi webhook dopo 90.
- Base conserva solo le ultime 40 caption. L'utente può cancellare caption e account.
- I log delle funzioni non contengono testo dell'utente né caption.

## Test

```bash
pnpm functions:test      # 30 test unitari (handler, piani, RevenueCat, webhook, post-processing)
pnpm functions:check     # typecheck Deno
pnpm db:test             # migrazioni + test SQL su Postgres usa-e-getta (RLS, quote, rimborsi, budget)
pnpm typecheck           # app + shared
```

## Roadmap

- **Fase 1 ✅:** schema + RLS · generazione con controllo piano/limiti · RevenueCat (webhook,
  sync, paywall custom, ripristino, cambio piano) · prompt versionato · auth Apple/Google/email ·
  onboarding · Crea (tipo, tono, contesto, card con copia/condividi) · storico (preferiti,
  eliminazione, paginazione) · account (utilizzo, gestione abbonamento, privacy, eliminazione).
- **Fase 2 ✅ (UI):** rifiniture per piano con upsell, micro-interazioni (molle, haptics,
  skeleton), contatore utilizzi, stati scaduto / grace period / quota esaurita.
- **Fase 3:** streaming delle caption, condivisione della card come immagine, ottimizzazione
  costi (Haiku per rifiniture/hashtag, da valutare con dati reali), test E2E su device (Maestro).

### Da fare prima della pubblicazione

- Pagine **Privacy** e **Termini** reali (URL in `apps/mobile/src/constants/links.ts`).
- Icona e splash definitivi (`apps/mobile/assets/` contiene segnaposto).
- Prodotti negli store + RevenueCat configurati come sopra; test acquisti in sandbox su device.
