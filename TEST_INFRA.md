# E2E Test Infra: BlackWorld

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Player Bounties | ORIGINAL_REQUEST | 5      | 5      | ✓      |
| 2 | Player Lairs | ORIGINAL_REQUEST | 5      | 5      | ✓      |

## Test Architecture
- Test runner: Node.js scripts using native `fetch` or `node-fetch` against local dev server APIs (`http://localhost:3000`).
- Test case format: Automated programmatic scripts.
- Directory layout: `/tests/e2e` or `/scripts/tests`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | E2E Testing Suite | Create automated tests for Bounties and Lairs | none | PLANNED |
