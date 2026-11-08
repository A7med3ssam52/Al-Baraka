/**
 * User-facing errors must never show technical reasons.
 *
 * Server / network / database messages are in English codes (e.g. PostgREST,
 * Postgres, auth, network failures). They are translated to friendly Arabic
 * at the API layer. This helper makes translation idempotent: API layers
 * already throw Arabic, and UI layers call translate again — the Arabic
 * message must be kept instead of falling through to a generic fallback.
 *
 * Raw technical details are kept in the browser console during development
 * only (for diagnosis), never in a toast / dialog / inline message.
 */
export function isFriendlyArabicMessage(message: string): boolean {
  return /[\u0600-\u06FF]/.test(message)
}

export function logTechnicalError(error: unknown): void {
  if (!import.meta.env.DEV) return
  const raw =
    error instanceof Error ? error.message : String(error ?? '')
  if (raw && !isFriendlyArabicMessage(raw)) {
    console.debug('[technical-error hidden from UI]', raw)
  }
}

/** Wrap a friendly message so UI can detect and display it as-is. */
export function friendlyError(message: string): Error {
  return new Error(message)
}

/**
 * Extract a friendly Arabic message from an error.
 * `map` converts a known technical code to Arabic; anything unknown or
 * already Arabic is returned as generic Arabic (never the raw technical text).
 */
export function toFriendlyMessage(
  error: unknown,
  map: (technical: string) => string | null,
  fallback = 'تعذر إكمال العملية. حاول مرة أخرى.',
): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const key = raw.trim()
  if (!key) return fallback
  if (isFriendlyArabicMessage(key)) return key
  const mapped = map(key)
  if (mapped) return mapped
  logTechnicalError(error)
  return fallback
}
