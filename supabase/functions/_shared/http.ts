import type { ApiErrorBody, ApiErrorCode } from "./domain/index.ts";
import { API_ERROR_MESSAGES } from "./domain/index.ts";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  invalid_request: 400,
  no_subscription: 402,
  subscription_expired: 402,
  feature_not_in_plan: 403,
  quota_exceeded: 402,
  rate_limited: 429,
  budget_exceeded: 503,
  not_found: 404,
  content_refused: 422,
  ai_unavailable: 503,
  ai_bad_output: 502,
  internal: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly details?: Record<string, unknown>,
    message?: string,
  ) {
    super(message ?? API_ERROR_MESSAGES[code]);
    this.name = "AppError";
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export function errorResponse(err: unknown): Response {
  const appError = err instanceof AppError ? err : new AppError("internal");
  if (!(err instanceof AppError)) log("error", "unhandled_error", { error: String(err) });
  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
  };
  const headers: Record<string, string> = {};
  const retryAfter = appError.details?.retryAfterSeconds;
  if (typeof retryAfter === "number") headers["Retry-After"] = String(retryAfter);
  return json(body, appError.status, headers);
}

/** Log strutturati (JSON su una riga): mai testo dell'utente o caption. */
export function log(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("invalid_request", undefined, "JSON non valido");
  }
}

export function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) throw new AppError("unauthorized");
  return match[1];
}

/** Confronto a tempo costante per segreti condivisi (webhook). */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
