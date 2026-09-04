# Changelog

## 1.0.0

Independent GitHub CI verification accepts a merged pull request with a complete,
green snapshot at its stable head. Closing a pull request without merging still
fails. This prevents merging one parallel lane from invalidating its evidence
while the remaining graph continues. CTX introduces this rule with its initial
CI verifier rollout and evaluation migration 053; no deployed CI receipts use
the earlier 0.2.0 rule.
