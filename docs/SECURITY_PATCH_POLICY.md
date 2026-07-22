# Security Patch Policy

## Purpose

This document defines how dependency vulnerabilities discovered by
`scripts/security-audit.sh`, GitHub Actions CI, or manual advisory review
are handled in the Dispatch repository.

Enforcement happens in two places:

- Local review: `./scripts/security-review.sh`
- CI review: GitHub Actions job `Security — Audit & Secret Scan`

---

## Severity Handling

### CRITICAL
- **Action required before PASS.**
- Either apply a targeted patch (see Safe Patch Rules below) OR document an
  accepted-risk note in `docs/SECURITY_REVIEW_LOG.md` with justification.

### HIGH
- **Action required before PASS.**
- Same as CRITICAL: patch or document accepted-risk.
- If a HIGH/CRITICAL advisory is intentionally deferred, it must be recorded
  in `.security-accepted-risks` and explained in `docs/SECURITY_REVIEW_LOG.md`.

### MODERATE
- **Document and schedule**, unless the patch is trivially safe (patch-level
  bump, no API changes, passes full verification). Does NOT block PASS.

### LOW / INFO
- **Document only**, unless trivially safe to apply. Does NOT block PASS.

---

## Safe Patch Rules

1. **Prefer patch or minor targeted updates.** Use `npm install pkg@x.y.z`
   at the root of the workspace tree for the specific vulnerable package.
   Avoid broad `npm update`.
2. **Major version upgrades require explicit user approval.** A major
   version bump may have breaking API changes.
3. **Never run `npm audit fix --force` without explicit written user
   approval.** `--force` can install breaking major versions and create
   regressions.
4. **Prefer `overrides` in the root `package.json`** when the vulnerable
   package is a transitive dependency of a framework (e.g. Next.js's
   internal `sharp`/`postcss` copies) rather than a direct dependency —
   this repository already does this for `sharp` and `postcss`.
5. **Always run full verification after any patch:**
   ```bash
   ./scripts/verify.sh
   ./scripts/security-audit.sh
   ```
   A patch that breaks tests or build is not acceptable.
6. **Update the lockfile after patching.** Commit the updated
   `package-lock.json` alongside the `package.json` change.

---

## Rollback Policy

- If a patch causes build or test failures, revert the package to the
  previous version immediately.
- Document the failed patch attempt in `docs/SECURITY_REVIEW_LOG.md`.
- Re-evaluate with accepted-risk or an alternative mitigation.

---

## Accepted-Risk Documentation Format

When documenting accepted risk, add an entry to `docs/SECURITY_REVIEW_LOG.md`:

```
### Accepted Risk — [PACKAGE@VERSION] — [SEVERITY] — [DATE]
- CVE / Advisory: [link or advisory ID]
- Attack vector: [description]
- Why accepted: [justification]
- Review by: [task ID]
```

Also add a one-line registry entry to `.security-accepted-risks` so
automated CI and local harness runs can classify the advisory correctly.

---

## Approval Policy

| Action | Who approves |
|---|---|
| Patch-level or minor dependency bump | Claude Code may apply after verification |
| Major version upgrade | User must explicitly approve |
| `npm audit fix` (no force) | User must explicitly approve |
| `npm audit fix --force` | User must explicitly approve — use only as last resort |
| Accepted-risk note without patch | Claude documents; user reviews in next task |

## CI Notes

- The CI security job is blocking by default and should stay blocking unless
  a documented exception is approved.
- Dependabot is not yet configured — see `docs/SECURITY_HARNESS.md` § Future
  Security Enhancements.
