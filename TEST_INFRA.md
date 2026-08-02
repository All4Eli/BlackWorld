# E2E Test Infra: BlackWorld Expansion Project

## Test Philosophy
- Opaque-box, requirement-driven end-to-end testing against real PostgreSQL database and business logic layer.
- Zero fake/mocked assertions: Genuine state verification in database tables (`players`, `hero_stats`, `player_education`, `inventory`, `player_bazaar`, `player_investments`, `crime_logs`).
- Methodology: Category-Partition + Boundary Value Analysis + Cross-Feature Interaction + Complete Player Lifecycle.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|---------------------|:------:|:------:|:------:|:------:|
| 1 | Crimes | Torn City Parity | 5 | 5 | ✓ | ✓ |
| 2 | Gym | Torn City Parity | 5 | 5 | ✓ | ✓ |
| 3 | Education | Torn City Parity | 5 | 5 | ✓ | ✓ |
| 4 | Economy Bazaar | Torn City Parity | 5 | 5 | ✓ | ✓ |
| 5 | Economy Stocks | Torn City Parity | 5 | 5 | ✓ | ✓ |
| 6 | Dungeon Lockouts | Torn City Parity | — | 7 | ✓ | ✓ |

## Test Architecture
- Test runner: Node.js standard runtime script `scripts/tests/expansion_e2e.test.js`.
- Database: Direct connection to PostgreSQL database instance configured in `.env.local` or environment variables (`DATABASE_URL`).
- Directory layout: `/scripts/tests/expansion_e2e.test.js`.

## Milestones & Status
| # | Name | Scope | Execution Command | Status |
|---|------|-------|-------------------|--------|
| 1 | Expansion E2E Test Suite | Automated end-to-end verification for Crimes, Gym, Education, Bazaar, Stocks, Jail Locks | `node scripts/tests/expansion_e2e.test.js` | COMPLETED (66/66 PASS) |
