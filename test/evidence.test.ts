import { describe, expect, it } from 'vitest';
import { BrowserEvidence, browserEvidencePassed, DeploymentEvidence, deploymentEvidencePassed } from '../src/evidence.js';

const deployment = DeploymentEvidence.parse({
  contract: 'ctx.deployment-release-evidence.v1', base_url: 'https://ctx.example', expected_tag: 'v1',
  public_health: { contract: 'ctx.health.v1', ok: true, release_tag: 'v1' },
  app_health: { contract: 'ctx.app-health.v1', ok: true, failed_checks: [] },
});

const browser = BrowserEvidence.parse({
  contract: 'ctx.browser-smoke-evidence.v1', base_url: 'https://ctx.example',
  fixtures: [
    { name: 'desktop', width: 1440, height: 900, assertions_passed: 2, overflow: false },
    { name: 'phone', width: 390, height: 844, assertions_passed: 1, overflow: false },
  ],
  console_errors: [], page_errors: [],
});

describe('deployment evidence truth', () => {
  it('passes only when both probes are ok and the release tag matches', () => {
    expect(deploymentEvidencePassed(deployment)).toBe(true);
    expect(deploymentEvidencePassed({ ...deployment, expected_tag: 'v2' })).toBe(false);
    expect(deploymentEvidencePassed({ ...deployment, app_health: { ...deployment.app_health, ok: false } })).toBe(false);
    expect(deploymentEvidencePassed({ ...deployment, public_health: { ...deployment.public_health, release_tag: null } })).toBe(false);
  });
});

describe('browser evidence truth', () => {
  it('needs a desktop and a phone fixture, assertions on every fixture, no overflow, no errors', () => {
    expect(browserEvidencePassed(browser)).toBe(true);
    expect(browserEvidencePassed({ ...browser, fixtures: [browser.fixtures[0]!] })).toBe(false);
    expect(browserEvidencePassed({ ...browser, fixtures: [browser.fixtures[1]!] })).toBe(false);
    expect(browserEvidencePassed({ ...browser, console_errors: ['boom'] })).toBe(false);
    expect(browserEvidencePassed({ ...browser, page_errors: ['boom'] })).toBe(false);
    expect(browserEvidencePassed({ ...browser, fixtures: [browser.fixtures[0]!, { ...browser.fixtures[1]!, overflow: true }] })).toBe(false);
    expect(browserEvidencePassed({ ...browser, fixtures: [browser.fixtures[0]!, { ...browser.fixtures[1]!, assertions_passed: 0 }] })).toBe(false);
  });

  it('agrees with the receipt builder the CLI ships (same predicate, both sides)', async () => {
    const { buildBrowserReceipt } = await import('../src/receipt.js');
    const fixture = (name: string, width: number) => ({
      name, width, height: 844, passed: true, assertions_passed: 2, overflow: false,
      console_errors: [], page_errors: [], network_failures: [], steps: [], screenshot_paths: [],
      accessibility_snapshot_path: null, performance: {}, failure: null,
    });
    const receipt = buildBrowserReceipt({
      contract: 'ctx.web-evidence.v1', run_id: 'run',
      journey: { contract: 'ctx.web-journey.v1', name: 'smoke', digest: 'a'.repeat(64), source_path: '/tmp/smoke.json' },
      target_url: 'https://ctx.example/app', started_at: '2026-08-31T18:00:00.000Z', finished_at: '2026-08-31T18:01:00.000Z',
      chrome: { mode: 'owned', executable: null, endpoint: null }, passed: true,
      fixtures: [fixture('desktop', 1440), fixture('phone', 390)],
      cleanup: { contract: 'ctx.chrome-cleanup.v1', owned: true, profile_dir: null, process_closed: true, profile_removed: true, evidence_preserved: true },
      failure: null,
    }, 1);
    expect(receipt.passed).toBe(browserEvidencePassed(BrowserEvidence.parse(receipt.evidence)));
  });
});
