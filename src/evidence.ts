// Verifier evidence truth functions. Pure. The envelope schemas live in
// @ctx/contracts; CTX stores what these compute, never the caller's `passed`,
// and the runner's own assertion is only checked for agreement at the service
// boundary. Runs anywhere: Worker, Node, browser.
import type { BrowserEvidence, DeploymentEvidence } from '@ctx/contracts';

export { BrowserEvidence, BrowserFixture, DeploymentEvidence, ErrorList, HttpsUrl } from '@ctx/contracts';

export function deploymentEvidencePassed(evidence: DeploymentEvidence) {
  return evidence.public_health.ok && evidence.app_health.ok
    && evidence.public_health.release_tag === evidence.expected_tag;
}

export function browserEvidencePassed(evidence: BrowserEvidence) {
  return evidence.fixtures.some((fixture) => fixture.width > 720)
    && evidence.fixtures.some((fixture) => fixture.width <= 480)
    && evidence.console_errors.length === 0
    && evidence.page_errors.length === 0
    && evidence.fixtures.every((fixture) => fixture.assertions_passed > 0 && !fixture.overflow);
}
