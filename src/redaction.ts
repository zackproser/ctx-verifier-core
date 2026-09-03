// Evidence redaction: strips credentials and secret-looking values from URLs,
// text, and nested objects before anything is retained or posted. Pure.
const SENSITIVE_KEY = /(?:authorization|cookie|set-cookie|token|secret|password|api[-_]?key|client[-_]?secret)/i;
const INLINE_SECRET = /\b(authorization|cookie|token|secret|password|api[-_]?key)\b\s*[:=]\s*([^\s,;]+)/gi;

export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '[REDACTED]');
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return raw.replace(INLINE_SECRET, '$1=[REDACTED]');
  }
}

export function redactText(value: string): string {
  return value.replace(INLINE_SECRET, '$1=[REDACTED]');
}

export function redactObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactObject(entry),
    ]));
  }
  return typeof value === 'string' ? redactText(value) : value;
}
