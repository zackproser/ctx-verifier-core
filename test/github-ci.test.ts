import { describe, expect, it } from 'vitest';
import { assessGithubCi, type GithubCiSnapshot } from '../src/github-ci.js';
const green: GithubCiSnapshot = { head: 'a'.repeat(40), finalHead: 'a'.repeat(40), state: 'open', draft: false,
  complete: true, checks: [{ head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success' }], statuses: [] };
describe('independent GitHub CI verdict', () => {
  it('accepts checks and commit statuses only at one stable head', () => {
    expect(assessGithubCi(green).passed).toBe(true);
    expect(assessGithubCi({ ...green, checks: [], statuses: [{ state: 'success' }] }).passed).toBe(true);
  });
  it.each([
    { checks: [], statuses: [] }, { complete: false }, { finalHead: 'b'.repeat(40) },
    { checks: [{ head_sha: 'b'.repeat(40), status: 'completed', conclusion: 'success' }] },
    { checks: [{ head_sha: green.head, status: 'in_progress', conclusion: null }] },
    { statuses: [{ state: 'pending' }] },
  ])('holds incomplete or pending evidence: %j', (patch) => {
    expect(assessGithubCi({ ...green, ...patch })).toMatchObject({ passed: false, pending: true });
  });
  it.each(['failure', 'cancelled', 'timed_out', 'action_required', 'skipped', 'neutral'])('rejects %s checks', (conclusion) => {
    expect(assessGithubCi({ ...green, checks: [{ ...green.checks[0]!, conclusion }] }))
      .toMatchObject({ passed: false, pending: false });
  });
  it.each([{ state: 'closed' }, { draft: true }, { statuses: [{ state: 'failure' }] }])('rejects invalid delivery: %j', (patch) => {
    expect(assessGithubCi({ ...green, ...patch })).toMatchObject({ passed: false, pending: false });
  });
});
