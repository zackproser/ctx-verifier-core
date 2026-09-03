// The browser journey runner's evidence manifest (ctx.web-evidence.v1) and
// its parts. The runner itself lives in ctx-cli (it needs Playwright); this is
// the shape it produces and the receipt builder consumes.
import type { JourneyStep } from '@ctx/contracts';

export interface StepResult {
  index: number;
  action: JourneyStep['action'];
  passed: boolean;
  duration_ms: number;
  detail: string;
}

export interface FixtureResult {
  name: string;
  width: number;
  height: number;
  passed: boolean;
  assertions_passed: number;
  overflow: boolean;
  console_errors: string[];
  page_errors: string[];
  network_failures: Array<{ method: string; url: string; status: number | null; failure: string | null }>;
  steps: StepResult[];
  screenshot_paths: string[];
  accessibility_snapshot_path: string | null;
  performance: Record<string, number | null>;
  failure: string | null;
}

export interface CleanupReceipt {
  contract: 'ctx.chrome-cleanup.v1';
  owned: boolean;
  profile_dir: string | null;
  process_closed: boolean;
  profile_removed: boolean;
  evidence_preserved: boolean;
}

export interface EvidenceManifest {
  contract: 'ctx.web-evidence.v1';
  run_id: string;
  journey: { contract: 'ctx.web-journey.v1'; name: string; digest: string; source_path: string };
  target_url: string;
  started_at: string;
  finished_at: string;
  chrome: { mode: 'owned' | 'attached'; executable: string | null; endpoint: string | null };
  passed: boolean;
  fixtures: FixtureResult[];
  cleanup: CleanupReceipt;
  failure: string | null;
}
