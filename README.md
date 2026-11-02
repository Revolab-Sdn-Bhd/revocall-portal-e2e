# RevoCall Portal E2E

Playwright + TypeScript end-to-end tests for the RevoCall Admin portal on staging
(https://admin.stg.revocall-staging.com).

## Setup

```bash
npm ci
npx playwright install chromium
cp .env.example .env
```

Fill in `.env` with the staging test accounts. It is git-ignored: never commit it.

| Variable                                  | Used for                                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOGIN_EMAIL`, `LOGIN_PASSWORD`           | Main account, used by every test except change password                                                                                                    |
| `LOGIN_ORGANIZATION`                      | Organization picked after sign-in (`Revolab QA`)                                                                                                           |
| `LOGIN_DISPLAY_NAME`                      | Name shown in the sidebar and Audit Log (needed by AT-LOGIN-006)                                                                                           |
| `CHANGE_PWD_EMAIL`, `CHANGE_PWD_PASSWORD` | Dedicated account, only for AT-LOGIN-004. Must be its original password                                                                                    |
| `FAILED_LOGIN_EMAIL`                      | Dedicated account (email only) for the wrong-password test AT-LOGIN-010. Never the main account. The test fails fast with a clear message when it is empty |
| `BASE_URL`                                | Optional. Environment to test, defaults to staging                                                                                                         |

## Running tests

| What                                                       | Command                                    |
| ---------------------------------------------------------- | ------------------------------------------ |
| Everything                                                 | `npm test`                                 |
| Smoke (main journeys, run after each deploy; skips @flaky) | `npm run test:smoke`                       |
| Regression                                                 | `npm run test:regression`                  |
| One test case                                              | `npx playwright test --grep @AT-LOGIN-004` |
| Demo: slow, visible browser, highlighted checks            | `npm run test:demo`                        |
| Interactive UI                                             | `npm run test:ui`                          |
| Open the last report                                       | `npm run report`                           |
| Lint (ESLint + eslint-plugin-playwright)                   | `npm run lint` (`npm run lint:fix` fixes)  |
| Type check                                                 | `npm run typecheck`                        |
| Format (Prettier)                                          | `npm run format`                           |

Tests run one at a time (`workers: 1`, see Standards exceptions). A `setup` project signs in once and saves the session to
`playwright/.auth/user.json` (git-ignored). Login and logout tests start logged out.

## Project structure

```
tests/        specs, one folder per feature
pages/        page objects (all locators live here); pages/components/ for shared UI (sidebar, dialogs)
fixtures/     test fixtures (base, logged-out login, change password)
test-data/    JSON test data, one folder per feature
utils/        API matchers and helpers
```

## Conventions

- Each test has a test case ID tag, `@AT-<FEATURE>-<NNN>`, matching the automation test case workbook.
- Each test also has `@smoke` or `@regression`.
- One ID per test. ID ranges: `AT-LOGIN-001..010`, `AT-NAV-001..015` (sidebar, in `test-data/navigation/sidebar.json` order).
- Tests that fail then pass on retry are fixed within 5 working days, or tagged `@flaky` with an RV ticket. `@flaky` is excluded from the PR gate.
- No fixed waits: use web-first assertions, `waitForResponse` or `expect.poll`.

## Login coverage (RV-3809)

| ID              | Flow                                                                                   | Tag         |
| --------------- | -------------------------------------------------------------------------------------- | ----------- |
| AT-LOGIN-001    | Sign in with email and password                                                        | @smoke      |
| AT-LOGIN-002    | SSO: Google / Microsoft options, up to the IdP redirect (the IdP page is never loaded) | @smoke      |
| AT-LOGIN-003    | Stay signed in after reload                                                            | @smoke      |
| AT-LOGIN-004    | Change password, sign in with the new one (original is always restored)                | @regression |
| AT-LOGIN-005    | Sign out                                                                               | @smoke      |
| AT-LOGIN-006    | Sign-in recorded in the Audit Log                                                      | @regression |
| AT-LOGIN-007    | Empty email is blocked                                                                 | @regression |
| AT-LOGIN-008    | Invalid email format is blocked                                                        | @regression |
| AT-LOGIN-009    | Unknown email shows an error                                                           | @regression |
| AT-LOGIN-010    | Wrong password shows an error (needs `FAILED_LOGIN_EMAIL`)                             | @regression |
| AT-NAV-001..015 | One sidebar link per ID, each opens its page                                           | @smoke      |

## Branches

| Branch                       | Purpose                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `main`                       | Stable, reviewed tests. Protected: changes only through pull requests. |
| `develop`                    | Integration branch for finished feature work.                          |
| `feature/RV-<number>-<name>` | One branch per Jira ticket, e.g. `feature/RV-3809-login`.              |

Flow: `feature/...` → pull request into `develop` → pull request into `main` when stable.

## CI

GitHub Actions (`.github/workflows/playwright.yml`) follows standard CI-01:

| Trigger                            | Runs                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| Pull request to `main` / `develop` | `@smoke`                                                              |
| Push to `develop` (after merge)    | `@smoke`                                                              |
| Push to `main` (after merge)       | Full suite                                                            |
| Nightly, 02:00 MYT                 | Full suite                                                            |
| Actions tab → Run workflow         | Choose `all`, `smoke` or `regression` (run `all` before each release) |

Only one run happens at a time, because the tests share staging accounts. The HTML report is
uploaded as a build artifact.

The team standards are in `docs/Playwright_Automation_Standards_v1.0.xlsx`.

Add these repository secrets under Settings → Secrets and variables → Actions:
`LOGIN_EMAIL`, `LOGIN_PASSWORD`, `LOGIN_ORGANIZATION`, `LOGIN_DISPLAY_NAME`,
`CHANGE_PWD_EMAIL`, `CHANGE_PWD_PASSWORD`, `FAILED_LOGIN_EMAIL`. Optional repository variable: `BASE_URL`.

The workflow runs `npm run lint` and `npm run typecheck` before the tests. Pull requests use
`.github/pull_request_template.md` (the standards Review Checklist).

## Standards exceptions

Accepted differences from `docs/Playwright_Automation_Standards_v1.0.xlsx`:

| Rule                                   | Exception                                                                                                                                                                                           | Reason                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Structure & Naming (folder per module) | Test folders `tests/logout/`, `tests/audit-log/` and `tests/navigation/` have no matching `pages/` or `test-data/` folder of the same name (navigation uses `pages/components/SidebarComponent.ts`) | Kept as is by team decision. No move to `tests/login/`                               |
| CFG-03                                 | `workers: 1` in CI as well as locally                                                                                                                                                               | The tests share staging accounts, and sessions and passwords can collide in parallel |
