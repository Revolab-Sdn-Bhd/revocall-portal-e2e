import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'playwright-report/',
      'test-results/',
      'blob-report/',
      'Claude outputs/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/**/*.ts', 'fixtures/**/*.ts', 'pages/**/*.ts', 'utils/**/*.ts'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // CFG-02 required rules (all error).
      'playwright/missing-playwright-await': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      // AST-02: reusable checks live in the POM as expect*() methods, so they count as assertions.
      'playwright/expect-expect': [
        'error',
        { assertFunctionPatterns: ['^expect[A-Z]', '\\.expect[A-Z]'] },
      ],
      // IND-02: a skip is allowed only when it is conditional (and carries a reason).
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
    },
  },
  prettier,
);
