// GitHub snapshots are obtained by the Worker; this pure rule never trusts an
// executor's conclusion. Every reported check must finish successfully and at
// least one check/status must exist. Neutral/skipped is deliberately not green.
export interface GithubCiSnapshot {
  head: string; finalHead: string; state: string; draft: boolean; merged?: boolean;
  checks: Array<{ head_sha: string; status: string; conclusion: string | null }>;
  statuses: Array<{ state: string }>;
  complete: boolean;
}
export function assessGithubCi(value: GithubCiSnapshot) {
  if (!value.complete || !/^[a-f0-9]{40}$/i.test(value.head) || value.head !== value.finalHead
      || value.checks.some((check) => check.head_sha !== value.head)) {
    return { passed: false, pending: true, reason: 'GitHub snapshot is incomplete or the PR head changed.' };
  }
  if ((value.state !== 'open' && !(value.state === 'closed' && value.merged === true)) || value.draft) {
    return { passed: false, pending: false, reason: 'The delivered PR must be ready for review or merged; closed unmerged PRs do not count.' };
  }
  if (value.checks.length + value.statuses.length === 0) {
    return { passed: false, pending: true, reason: 'GitHub has not reported any CI checks for this head.' };
  }
  const failed = value.checks.some((check) => check.status === 'completed' && check.conclusion !== 'success')
    || value.statuses.some((status) => ['failure', 'error'].includes(status.state));
  if (failed) return { passed: false, pending: false, reason: 'At least one CI check did not succeed.' };
  const passed = value.checks.every((check) => check.status === 'completed' && check.conclusion === 'success')
    && value.statuses.every((status) => status.state === 'success');
  return { passed, pending: !passed, reason: passed ? 'All reported CI checks passed at the current PR head.' : 'CI is still pending.' };
}
