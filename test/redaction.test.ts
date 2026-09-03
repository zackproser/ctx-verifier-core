import { describe, expect, it } from 'vitest';
import { redactObject, redactText, redactUrl } from '../src/redaction.js';

describe('evidence redaction', () => {
  it('removes query values, credentials, and inline secrets', () => {
    expect(redactUrl('https://user:pass@example.com/path?token=abc&query=hello')).toBe('https://example.com/path?token=%5BREDACTED%5D&query=%5BREDACTED%5D');
    expect(redactText('authorization: bearer-secret')).toBe('authorization=[REDACTED]');
    expect(redactObject({ headers: { cookie: 'session=abc', accept: 'json' } })).toEqual({ headers: { cookie: '[REDACTED]', accept: 'json' } });
  });
});
