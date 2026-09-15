<p align="center">
  <img src="docs/hero.png" alt="" width="100%">
</p>

# @ctx/verifier-core

The part of [CTX](https://github.com/zackproser/ctx)'s verification loop that both sides must agree on: the **truth functions** that decide whether a piece of evidence passes, the **redaction** that scrubs credentials before evidence is retained, the **evidence manifest** the browser runner produces, and the **receipt builder** that turns a manifest into a trusted-verifier receipt.

The control plane and the CLI used to each carry their own copy of the browser-evidence predicate. If the two ever disagreed, CTX would either store a pass the runner had rejected or reject a pass the runner had proven. Now there is one predicate, imported by both, and a test that asserts the receipt builder and the server-side truth function agree on the same evidence.

## Dependency direction

```
   ┌───────────────────────┐        ┌────────────────────────┐
   │  ctx  (control plane) │        │  ctx-cli  (runner)     │
   │  stores receipts,     │        │  runs journeys, posts  │
   │  recomputes `passed`  │        │  receipts              │
   └──────────┬────────────┘        └───────────┬────────────┘
              │ root entry                      │ root + ./receipt
              ▼                                 ▼
   ┌────────────────────────────────────────────────────────┐
   │  @ctx/verifier-core                       ◀── this     │
   │  evidence truth · redaction · manifest    (root: pure) │
   │  ./receipt: buildBrowserReceipt           (Node only)  │
   └───────────────────────────┬────────────────────────────┘
                               │ exact pin
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │  @ctx/contracts   evidence envelopes · vocabulary      │
   └────────────────────────────────────────────────────────┘
```

Two entry points on purpose. The root (`@ctx/verifier-core`) is platform-neutral and is what the Cloudflare Worker bundles. `@ctx/verifier-core/receipt` uses `node:crypto` and is only imported by Node clients such as `ctx-cli`. A browser journey *runner* (Playwright) is deliberately not here; it stays in `ctx-cli` until it earns its own `@ctx/verifier-browser` package.

## Install

Not on the public npm registry yet. Pin a commit; npm builds `dist/` on install via `prepare`:

```sh
npm install "git+https://github.com/zackproser/ctx-verifier-core.git#<commit-sha>"
```

npm records git dependencies as `git+ssh://`; on a CI runner without an SSH key add
`git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"` before `npm ci`.
`zod ^3.25` is a peer dependency.

## API

### Truth functions

```ts
import { BrowserEvidence, browserEvidencePassed, DeploymentEvidence, deploymentEvidencePassed } from '@ctx/verifier-core';

const evidence = BrowserEvidence.parse(body.evidence);   // schema re-exported from @ctx/contracts
if (body.passed !== browserEvidencePassed(evidence)) reject('runner and evidence disagree');
```

* `deploymentEvidencePassed(e)`: public health ok **and** app health ok **and** `release_tag === expected_tag`.
* `browserEvidencePassed(e)`: a fixture wider than 720px **and** one at or below 480px, every fixture with `assertions_passed > 0` and no overflow, zero console errors, zero page errors.

CTX stores what these return, never the caller's `passed`.

### Redaction

```ts
import { redactUrl, redactText, redactObject } from '@ctx/verifier-core';

redactUrl('https://user:pass@host/p?token=abc');   // 'https://host/p?token=%5BREDACTED%5D'
redactText('authorization: bearer-secret');        // 'authorization=[REDACTED]'
redactObject({ headers: { cookie: 'x', accept: 'json' } }); // cookie → '[REDACTED]'
```

Keys matching `authorization|cookie|set-cookie|token|secret|password|api[-_]?key|client[-_]?secret` are replaced; inline `key: value` / `key=value` secrets in strings are masked; every query-string value is masked and URL credentials dropped.

### Evidence manifest

```ts
import type { EvidenceManifest, FixtureResult, StepResult, CleanupReceipt } from '@ctx/verifier-core';
```

`EvidenceManifest` is `ctx.web-evidence.v1`: the journey digest, target URL, per-fixture results (assertions, overflow, console/page/network errors, screenshots, accessibility snapshot, performance), and a `ctx.chrome-cleanup.v1` receipt proving the runner closed and removed what it owned.

### Receipt builder (Node)

```ts
import { buildBrowserReceipt } from '@ctx/verifier-core/receipt';

const receipt = buildBrowserReceipt(manifest, attempt, 'smoke');
receipt.receipt_key;        // 'smoke-<24 hex>' — idempotent for the same journey digest + attempt
receipt.verifier_id;        // 'ctx.browser-smoke-verifier'
receipt.evidence.contract;  // 'ctx.browser-smoke-evidence.v1'
receipt.passed;             // same predicate as browserEvidencePassed
```

Refuses non-HTTPS targets. Collapses a fixture the runner failed into `assertions_passed: 0`, so CTX can never accept a receipt the full manifest rejected. Posting the receipt (auth, retries) stays in the client.

## Versioning and compatibility

| `@ctx/verifier-core` | `@ctx/contracts` | `ctx` | `ctx-cli` |
|---|---|---|---|
| 0.1.x | 0.1.x (exact pin) | pins exact commit; root entry only | pins exact commit; root + `./receipt` |

* Changing what a truth function returns for existing evidence is a **major** bump: it changes which stored receipts would pass, and `ctx` must re-evaluate.
* Widening redaction is a minor bump; narrowing it is major.
* `receipt_key` derivation is frozen (it is an idempotency key in CTX).

## Contributing

```sh
npm ci
npm test          # truth functions, redaction, receipt builder, cross-check — 8 tests
npm run typecheck
```

Keep the root entry free of Node built-ins; the Worker bundle depends on it.

Optional form submit confirmations are part of the authorized plan digest. Their prompts are not saved-state evidence. Plans with a confirmation step require fresh-context readback for both submission and reconciliation; legacy plans retain their existing verdicts.

## License

MIT, see [LICENSE](LICENSE). Extracted from `ctx` and `ctx-cli`; see [NOTICE](NOTICE).

AlphaSights API confirmations verify fresh saved state against the endpoint, advisor, timezone and baseline bound to authorization. Exact interval unions must preserve current/future availability and add only the approved hours. The shared payload validator enforces the same change before the trusted runner forwards a PUT; no UI banner can satisfy this verifier.
