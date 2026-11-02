# RevoCall Portal E2E

Playwright + TypeScript end-to-end tests for the RevoCall Admin portal on staging
(https://admin.stg.revocall-staging.com).

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Fill in `.env` with the staging test accounts. It is git-ignored: never commit it.

| Variable | Used for |
|---|---|
| `LOGIN_EMAIL`, `LOGIN_PASSWORD` | Main account, used by every test except change password |
| `LOGIN_ORGANIZATION` | Organization picked after sign-in (`Revolab QA`) |
| `LOGIN_DISPLAY_NAME` | Name shown in the sidebar and Audit Log (needed by AT-LOGIN-006) |
| `CHANGE_PWD_EMAIL`, `CHANGE_PWD_PASSWORD` | Dedicated account, only for AT-LOGIN-004. Must be its original password |

## Running tests

| What | Command |
|---|---|
| Everything | `npm test` |
| Smoke (main journeys, run after each deploy) | `npm run test:smoke` |
| Regression | `npm run test:regression` |
| One test case | `npx playwright test --grep @AT-LOGIN-004` |
| Demo: slow, visible browser, highlighted checks | `npm run test:demo` |
| Interactive UI | `npm run test:ui` |
| Open the last report | `npm run report` |

Tests run one at a time (`workers: 1`). A `setup` project signs in once and saves the session to
`playwright/.auth/user.json` (git-ignored). Login and logout tests start logged out.

## Project structure

```
tests/        specs, one folder per feature
pages/        page objects (all locators live here)
fixtures/     test fixtures (base, logged-out login, change password)
test-data/    JSON test data, one folder per feature
utils/        API matchers and helpers
```

## Conventions

- Each test has a test case ID tag, `@AT-<FEATURE>-<NNN>`, matching the automation test case workbook.
- Each test also has `@smoke` or `@regression`.
- No fixed waits: use web-first assertions, `waitForResponse` or `expect.poll`.

## Login coverage (RV-3809)

| ID | Flow | Tag |
|---|---|---|
| AT-LOGIN-001 | Sign in with email and password | @smoke |
| AT-LOGIN-002 | SSO: Google / Microsoft options, up to the IdP redirect (the IdP page is never loaded) | @smoke |
| AT-LOGIN-003 | Stay signed in after reload | @smoke |
| AT-LOGIN-004 | Change password, sign in with the new one (original is always restored) | @regression |
| AT-LOGIN-005 | Sign out | @smoke |
| AT-LOGIN-006 | Sign-in recorded in the Audit Log | @regression |

## Branches

| Branch | Purpose |
|---|---|
| `main` | Stable, reviewed tests. Protected: changes only through pull requests. |
| `develop` | Integration branch for finished feature work. |
| `feature/RV-<number>-<name>` | One branch per Jira ticket, e.g. `feature/RV-3809-login`. |

Flow: `feature/...` → pull request into `develop` → pull request into `main` when stable.

## CI

GitHub Actions (`.github/workflows/playwright.yml`) follows standard CI-01:

| Trigger | Runs |
|---|---|
| Pull request to `main` / `develop` | `@smoke` |
| Push to `develop` (after merge) | `@smoke` |
| Push to `main` (after merge) | Full suite |
| Nightly, 02:00 MYT | Full suite |
| Actions tab → Run workflow | Choose `all`, `smoke` or `regression` (run `all` before each release) |

Only one run happens at a time, because the tests share staging accounts. The HTML report is
uploaded as a build artifact.

The team standards are in `docs/Playwright_Automation_Standards_v1.0.xlsx`.

Add these repository secrets under Settings → Secrets and variables → Actions:
`LOGIN_EMAIL`, `LOGIN_PASSWORD`, `LOGIN_ORGANIZATION`, `LOGIN_DISPLAY_NAME`,
`CHANGE_PWD_EMAIL`, `CHANGE_PWD_PASSWORD`.
