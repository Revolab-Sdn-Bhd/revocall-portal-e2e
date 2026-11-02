import { expect, type Locator, type Page, type Request, type Response } from '@playwright/test';
import { showCheck } from '../../utils/show-check';
import { isLoginCall, isDiscoverCall, isSsoLoginCall } from '../../utils/api';
import { SidebarComponent } from '../components/SidebarComponent';

// Longest redirect chain followed when the SSO login call is intercepted.
const MAX_SSO_HOPS = 5;

/**
 * Page Object for the RevoCall Admin sign-in flow.
 *
 * The sign-in is a multi-step form on the same URL:
 *   1. Email step        -> "Sign in"
 *   2. Password step     -> "Welcome back" (or "Choose sign-in method" when SSO is set up)
 *   3. Organization step -> "Choose an organization" (only for users in several organizations)
 */
export class LoginPage {
  readonly page: Page;
  /** Sign-in path, relative to baseURL. */
  readonly url: string;

  /* Step 1 - email */
  readonly signInHeading: Locator;
  readonly emailInput: Locator;
  readonly continueButton: Locator;
  readonly forgotPasswordLink: Locator;

  /* Step 2 - password */
  readonly passwordStepHeading: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly backButton: Locator;

  /* Step 3 - organization */
  readonly organizationHeading: Locator;

  /* SSO provider choice (shown on the password step when SSO is set up) */
  readonly ssoHeading: Locator;

  /* Only exists once signed in (the sign out button). Used to know that sign-in finished. */
  readonly sidebar: SidebarComponent;

  constructor(page: Page, url: string) {
    this.page = page;
    this.url = url;

    this.signInHeading = page.getByRole('heading', { name: 'Sign in', exact: true });
    this.emailInput = page.getByLabel('Email address');
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot your password?' });

    this.passwordStepHeading = page.getByRole('heading', {
      name: /^(Welcome back|Choose sign-in method)$/,
    });
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back' });

    this.organizationHeading = page.getByRole('heading', { name: 'Choose an organization' });

    this.ssoHeading = page.getByRole('heading', { name: 'Choose sign-in method' });

    this.sidebar = new SidebarComponent(page);
  }

  async goto() {
    await this.page.goto(this.url);
    await expect(this.signInHeading).toBeVisible();
  }

  /** Types the email and clicks Continue. Does not wait for the next step (used by validation tests). */
  async submitEmail(email: string) {
    await this.emailInput.fill(email);
    await this.continueButton.click();
  }

  /** Enters a valid email and waits until the password step is shown. */
  async enterEmail(email: string) {
    await this.submitEmail(email);
    await expect(this.passwordInput).toBeVisible();
  }

  /**
   * Types the password, clicks Sign in and waits for the server's sign-in response.
   * Returns the response so tests can sync on it before checking the UI.
   */
  async submitPassword(password: string): Promise<Response> {
    await expect(this.passwordInput).toBeVisible();
    await this.passwordInput.fill(password);

    const loginResponse = this.page.waitForResponse(isLoginCall);
    await this.signInButton.click();
    return loginResponse;
  }

  /**
   * After a successful sign-in the app shows either the dashboard or, for users in several
   * organizations, the organization chooser. Waits for whichever appears and handles it.
   */
  async finishSignIn(organization?: string) {
    await expect(this.sidebar.signOutButton.or(this.organizationHeading)).toBeVisible();

    // Safe to check without waiting: one of the two is already visible at this point.
    if (await this.organizationHeading.isVisible()) {
      if (!organization) {
        throw new Error(
          'This account belongs to several organizations: set LOGIN_ORGANIZATION in .env.',
        );
      }
      await this.selectOrganization(organization);
    }
  }

  organizationButton(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  async selectOrganization(name: string) {
    await expect(this.organizationHeading).toBeVisible();

    const loginResponse = this.page.waitForResponse(isLoginCall);
    await this.organizationButton(name).click();
    await loginResponse;

    await expect(this.sidebar.signOutButton).toBeVisible();
  }

  /** Full login: email -> password -> (organization) -> signed in. */
  async login(email: string, password: string, organization?: string) {
    await this.enterEmail(email);
    await this.submitPassword(password);
    await this.finishSignIn(organization);
  }

  ssoButton(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  /**
   * Types the email, clicks Continue and returns the body of the SSO connections
   * response (GET /api/auth/sso/connections), which lists the providers for that email.
   */
  async discoverSsoConnections(email: string): Promise<string> {
    const discoverResponse = this.page.waitForResponse(isDiscoverCall);
    await this.submitEmail(email);
    const response = await discoverResponse;
    expect(response.ok()).toBe(true);
    return response.text();
  }

  async expectSsoOptions(heading: string, buttonLabel: string) {
    await expect(this.ssoHeading).toHaveText(heading);
    await showCheck(this.ssoHeading);
    const button = this.ssoButton(buttonLabel);
    await expect(button).toBeVisible();
    await showCheck(button);
  }

  /**
   * SSO tests must never load the identity provider (IdP) page. The app answers
   * GET /api/auth/sso/login with a redirect chain that ends at the IdP, and Playwright
   * cannot reliably block redirect hops inside the browser. So instead:
   *  - the app's SSO login call is fetched by Playwright WITHOUT following redirects,
   *    and the browser gets an empty stub, so it never leaves the app;
   *  - the redirect chain is then followed hop by hop (no redirects followed automatically)
   *    until the next hop is an IdP host. That IdP URL is returned but never requested;
   *  - as a safety net, any browser request to an IdP host is aborted and recorded.
   * Returns:
   *  - redirect: resolves to the first IdP URL in the chain (never requested)
   *  - blockedIdpRequests: URLs the browser tried to load from an IdP host (should stay empty)
   */
  async interceptSsoRedirect(idpHosts: string[]) {
    const context = this.page.context();
    const blockedIdpRequests: string[] = [];
    // The app's own host, read while the browser is on the sign-in page.
    const appHostname = new URL(this.page.url()).hostname;

    await context.route(
      (url) => idpHosts.includes(url.hostname),
      async (route) => {
        blockedIdpRequests.push(route.request().url());
        await route.abort();
      },
    );

    let resolveRedirect!: (url: URL) => void;
    let rejectRedirect!: (error: Error) => void;
    const redirect = new Promise<URL>((resolve, reject) => {
      resolveRedirect = resolve;
      rejectRedirect = reject;
    });
    redirect.catch(() => {}); // reported by whoever awaits it

    await context.route(
      (url) => url.hostname === appHostname && isSsoLoginCall({ url: () => url.href } as Request),
      async (route) => {
        try {
          let response = await route.fetch({ maxRedirects: 0 });
          for (let hop = 0; hop < MAX_SSO_HOPS; hop++) {
            const location = response.headers()['location'];
            if (!location)
              throw new Error(
                `SSO redirect chain ended without reaching an IdP (status ${response.status()})`,
              );
            const next = new URL(location, response.url());
            if (idpHosts.includes(next.hostname)) {
              resolveRedirect(next);
              break;
            }
            response = await context.request.get(next.href, { maxRedirects: 0 });
          }
        } catch (error) {
          rejectRedirect(error as Error);
        }
        // Empty stub: the browser stays on the app page.
        await route.fulfill({ status: 200, body: '' });
      },
    );

    return { redirect, blockedIdpRequests };
  }

  /** Clicks an SSO provider button and returns the app's SSO login request. */
  async clickSsoProvider(label: string) {
    const ssoRequest = this.page.waitForRequest(isSsoLoginCall);
    await this.ssoButton(label).click();
    return ssoRequest;
  }

  async goBack() {
    await this.backButton.click();
  }

  /** Browser (HTML5) validation state of the email field. */
  private async getEmailValidity() {
    return this.emailInput.evaluate((input: HTMLInputElement) => ({
      valueMissing: input.validity.valueMissing,
      typeMismatch: input.validity.typeMismatch,
    }));
  }

  /** Checks the browser blocked the email as empty (valueMissing) or badly formatted (typeMismatch). */
  async expectEmailInvalid(kind: 'valueMissing' | 'typeMismatch') {
    await expect.poll(async () => (await this.getEmailValidity())[kind]).toBe(true);
  }

  async expectOnEmailStep() {
    await expect(this.signInHeading).toBeVisible();
    await showCheck(this.signInHeading);
    await expect(this.emailInput).toBeVisible();
    await showCheck(this.emailInput);
    await expect(this.passwordInput).toBeHidden();
  }

  emailChip(email: string): Locator {
    return this.page.getByText(email, { exact: true });
  }

  errorMessage(message: string): Locator {
    return this.page.getByText(message, { exact: true });
  }

  async expectOnPasswordStep(email: string) {
    await expect(this.passwordStepHeading).toBeVisible();
    await showCheck(this.passwordStepHeading);
    await expect(this.passwordInput).toBeVisible();
    // The chosen email is shown as a chip above the password field.
    const emailChip = this.emailChip(email);
    await expect(emailChip).toBeVisible();
    await showCheck(emailChip);
  }

  async expectErrorMessage(message: string) {
    const error = this.errorMessage(message);
    await expect(error).toBeVisible();
    await showCheck(error);
  }
}
