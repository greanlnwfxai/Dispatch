## Summary

<!-- What does this PR change, and why? Reference the Task ID (e.g. DEV-FOUNDATION-001) and any Dispatch Knowledge Topic / TDR / BDR it relates to. -->

## Scope check

- [ ] No business workflow logic was added unless explicitly in scope for this task
- [ ] No open Business Decision Register (BDR) item was resolved via a technical/design choice
- [ ] Business rules (BR-xxx / VR-xxx) referenced, not reinvented — see `Dispatch Knowledge/`

## Verification run locally

- [ ] `./scripts/verify.sh`
- [ ] `./scripts/docker-verify.sh`
- [ ] `./scripts/api-smoke-test.sh`
- [ ] `./scripts/verify:mobile` (`./scripts/mobile-verify.sh`)
- [ ] `./scripts/security-review.sh`
- [ ] `./scripts/e2e-local.sh` (if this PR affects an executable user flow)

## Docker / Git safety

- [ ] No destructive Docker command was run (`docker compose down`, volume/image/container prune or rm)
- [ ] No Git mutation was performed by an AI agent — Git writes are manual only
- [ ] Stack was left running after local verification (if Docker was used)

## Security review

- [ ] Auth impact reviewed (guarded endpoints, if any)
- [ ] RBAC impact reviewed
- [ ] Data privacy / PII exposure reviewed
- [ ] No secrets, tokens, or password values in logs, responses, or source
- [ ] Dependency audit clean, or accepted-risk entries documented in `.security-accepted-risks` + `docs/SECURITY_REVIEW_LOG.md`

## Remote CI

- [ ] I understand GitHub Actions status is authoritative only after this PR is pushed — it is not claimed as passing before that
