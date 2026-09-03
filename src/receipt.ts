// Trusted-receipt builder for the browser smoke verifier. Node only
// (node:crypto), hence the separate @ctx/verifier-core/receipt entry point:
// the Worker imports the root, which stays platform-neutral.
import { createHash } from 'node:crypto';
import type { EvidenceManifest } from './manifest.js';

export function buildBrowserReceipt(manifest: EvidenceManifest, attempt: number, keyPrefix = 'web') {
  const base = new URL(manifest.target_url);
  if (base.protocol !== 'https:') throw new Error('CTX browser receipts require an HTTPS target URL');
  const consoleErrors = manifest.fixtures.flatMap((fixture) => fixture.console_errors).slice(0, 50);
  const pageErrors = manifest.fixtures.flatMap((fixture) => fixture.page_errors).slice(0, 50);
  const fixtures = manifest.fixtures.map((fixture) => ({
    name: fixture.name.slice(0, 120), width: fixture.width, height: fixture.height,
    // The v1 CTX receipt contract intentionally has a small evidence shape.
    // Collapse any richer runner failure into zero passing assertions so CTX
    // can never accept a receipt that the full manifest rejected.
    assertions_passed: fixture.passed ? fixture.assertions_passed : 0,
    overflow: fixture.overflow,
  }));
  const passed = fixtures.some((fixture) => fixture.width > 720)
    && fixtures.some((fixture) => fixture.width <= 480)
    && fixtures.every((fixture) => fixture.assertions_passed > 0 && !fixture.overflow)
    && consoleErrors.length === 0 && pageErrors.length === 0;
  const digest = createHash('sha256').update(`${attempt}\n${manifest.journey.digest}`).digest('hex').slice(0, 24);
  return {
    attempt,
    receipt_key: `${keyPrefix}-${digest}`.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 128),
    verifier_id: 'ctx.browser-smoke-verifier' as const,
    verifier_version: '1' as const,
    passed,
    observed_at: manifest.finished_at,
    evidence: {
      contract: 'ctx.browser-smoke-evidence.v1' as const,
      base_url: `${base.protocol}//${base.host}`,
      fixtures,
      console_errors: consoleErrors,
      page_errors: pageErrors,
      failure: passed ? null : manifest.failure ?? 'one or more browser evidence conditions failed',
    },
  };
}
