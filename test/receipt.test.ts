import { describe, expect, it } from 'vitest';
import { buildBrowserReceipt } from '../src/receipt.js';
import type { EvidenceManifest } from '../src/manifest.js';

const fixture = (name: string, width: number) => ({
  name, width, height: 844, passed: true, assertions_passed: 2, overflow: false,
  console_errors: [], page_errors: [], network_failures: [], steps: [], screenshot_paths: [],
  accessibility_snapshot_path: null, performance: {}, failure: null,
});

const manifest: EvidenceManifest = {
  contract: 'ctx.web-evidence.v1', run_id: 'run',
  journey: { contract: 'ctx.web-journey.v1', name: 'smoke', digest: 'a'.repeat(64), source_path: '/tmp/smoke.json' },
  target_url: 'https://ctx.example/app', started_at: '2026-08-31T18:00:00.000Z', finished_at: '2026-08-31T18:01:00.000Z',
  chrome: { mode: 'owned', executable: '/chrome', endpoint: null }, passed: true,
  fixtures: [fixture('desktop', 1440), fixture('phone', 390)],
  cleanup: { contract: 'ctx.chrome-cleanup.v1', owned: true, profile_dir: '/tmp/profile', process_closed: true, profile_removed: true, evidence_preserved: true },
  failure: null,
};

describe('CTX browser receipt derivation', () => {
  it('derives pass and an idempotent key from immutable evidence', () => {
    const first = buildBrowserReceipt(manifest, 1, 'smoke');
    const second = buildBrowserReceipt(manifest, 1, 'smoke');
    expect(first.passed).toBe(true);
    expect(first.receipt_key).toBe(second.receipt_key);
    expect(first.evidence.fixtures).toHaveLength(2);
  });

  it('fails closed when phone evidence overflows', () => {
    const broken = structuredClone(manifest);
    broken.fixtures[1]!.overflow = true;
    expect(buildBrowserReceipt(broken, 1).passed).toBe(false);
  });

  it('projects richer runner failures into the bounded CTX receipt shape', () => {
    const broken = structuredClone(manifest);
    broken.fixtures[1]!.passed = false;
    broken.fixtures[1]!.network_failures = [{ method: 'GET', url: 'https://ctx.example/api', status: 500, failure: null }];
    const receipt = buildBrowserReceipt(broken, 1);
    expect(receipt.passed).toBe(false);
    expect(receipt.evidence.fixtures[1]!.assertions_passed).toBe(0);
  });

  it('refuses non-HTTPS evidence for a trusted CTX receipt', () => {
    expect(() => buildBrowserReceipt({ ...manifest, target_url: 'http://127.0.0.1/' }, 1)).toThrow(/HTTPS/);
  });
});
