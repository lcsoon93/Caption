# Changelog dei prompt

Ogni generazione salva `prompt_version` nella tabella `generations`, così qualità, costi e latenza si possono
confrontare per versione:

```sql
select prompt_version, count(*), avg(latency_ms), avg(output_tokens), avg(cost_micros)
from generations where status = 'succeeded' group by 1;
```

Regole:

1. Mai modificare un prompt già rilasciato: crea `caption.vN.ts` e aggiorna `index.ts`.
2. Bump semantico: major = cambia lo schema JSON, minor = cambiano regole/stile, patch = refusi.
3. Il system prompt resta statico (niente date o dati utente) per non invalidare il prompt caching.

## caption-v1.0.0 — 2026-10-19

- Prima versione: system prompt in italiano con guida per 7 toni e 9 tipi di post.
- Output strutturato `{"captions":[{"text","hashtags"}]}` tramite `output_config.format`.
- Delimitatori `<contesto_utente>` / `<caption_originale>` contro prompt injection.
- Azioni di rifinitura: più poetica, più corta, più ironica, rigenera, più lunga, in inglese.
