// La fonte di verità vive in supabase/functions/_shared/domain perché il bundler delle
// Edge Functions include solo file sotto supabase/functions. Questo pacchetto la espone all'app.
export * from "../../../supabase/functions/_shared/domain/index.ts";
