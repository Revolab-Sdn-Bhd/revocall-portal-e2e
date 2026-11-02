## What changed

<!-- Jira key (RV-xxxx), test case IDs added or changed, and why. -->

## Review checklist

Result: Yes / No / N/A. Source: `docs/Playwright_Automation_Standards_v1.0.xlsx`, sheet "Review Checklist".

| #   | Check                                                                                 | Result | Standard          |
| --- | ------------------------------------------------------------------------------------- | ------ | ----------------- |
| 1   | Files are in the right folder and named per 'Structure & Naming'.                     |        | Structure         |
| 2   | describe / test titles follow '<Module> - <function>' and 'should <result>'.          |        | Structure         |
| 3   | Tests are tagged (@smoke / @regression / @e2e / @security) and with the test case ID. |        | TRC-01            |
| 4   | Locators use getByRole / getByLabel / getByText first; any CSS has a comment why.     |        | LOC-01            |
| 5   | New locators are defined in the POM, not in the spec.                                 |        | LOC-03            |
| 6   | No waitForTimeout used to wait for the app.                                           |        | WAIT-01           |
| 7   | Assertions are web-first (await expect(locator)...).                                  |        | WAIT-02           |
| 8   | Server actions wait for the response before checking the UI.                          |        | WAIT-03           |
| 9   | Each test checks the visible outcome and the important side effect.                   |        | AST-01            |
| 10  | No credentials, tokens or personal data in code or JSON.                              |        | DATA-01           |
| 11  | Test data is in test-data/*.json; created data is unique and cleaned up.              |        | DATA-02 / DATA-04 |
| 12  | Test passes alone and in any order (run with --repeat-each=3 locally).                |        | IND-01            |
| 13  | No test.only; any test.skip has a reason.                                             |        | IND-02            |
| 14  | Multi-step tests use test.step.                                                       |        | STR-01            |
| 15  | Automation Test Cases sheet updated (status Automated + evidence).                    |        | TRC-01            |
| 16  | Lint passes and tests pass in CI.                                                     |        | CFG-02 / CI-01    |

## Reviewer comments

<!-- Anything marked No needs a comment. -->
