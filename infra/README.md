# infra

Reserved for future infrastructure-as-code (staging/production deployment
configuration, e.g. Terraform, Kubernetes manifests, or platform-specific
IaC).

**Empty as of DEV-FOUNDATION-001.** Local orchestration for this milestone
lives in the root `docker-compose.yml` and per-app `Dockerfile`s under
`apps/*/Dockerfile` — those are the approved local/dev artifacts. Production
deployment platform selection (TDR-DEPLOY-001, Dispatch Knowledge Topic 11
§22) remains open and is intentionally not implemented here.
