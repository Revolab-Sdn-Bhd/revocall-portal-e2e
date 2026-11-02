import { test, expect } from '../../fixtures/login.fixture';
import { readTestData } from '../../fixtures/base.fixture';

type SsoProvider = { name: string; buttonLabel: string; idpHost: string };
type SsoData = { headingName: string; providers: SsoProvider[] };

const ssoData = readTestData<SsoData>('login/sso.json');

/*
 * Scope: up to the redirect to the identity provider (IdP). The test never loads or
 * interacts with the IdP page: the app's redirect is intercepted and read from the
 * response headers (see LoginPage.interceptSsoRedirect), so the IdP is never requested. Uses the main account's email only (no password).
 */
test.describe('Login - SSO', { tag: '@smoke' }, () => {
  for (const provider of ssoData.providers) {
    test(
      `should redirect to ${provider.name} when choosing it`,
      { tag: '@AT-LOGIN-002' },
      async ({ loginPage, loginData, page }) => {
        const { email } = loginData.validUser;
        // The app's origin, read while on the sign-in page (works for any BASE_URL).
        const appOrigin = new URL(page.url()).origin;
        expect(email, 'Set LOGIN_EMAIL in .env').toBeTruthy();

        const sso = await loginPage.interceptSsoRedirect(ssoData.providers.map((p) => p.idpHost));

        await test.step('Enter email and see the provider listed', async () => {
          const connections = await loginPage.discoverSsoConnections(email);
          expect(connections).toContain(provider.name);
        });

        await test.step('See the sign-in method choice', async () => {
          await loginPage.expectSsoOptions(ssoData.headingName, provider.buttonLabel);
        });

        await test.step('Choose the provider and reach the IdP redirect', async () => {
          const ssoRequest = await loginPage.clickSsoProvider(provider.buttonLabel);
          expect(new URL(ssoRequest.url()).origin).toBe(appOrigin);

          const idpUrl = await sso.redirect;
          expect(idpUrl.hostname).toBe(provider.idpHost);
          // OAuth-style parameters are present (values are not logged).
          expect(idpUrl.searchParams.has('client_id')).toBe(true);
          expect(idpUrl.searchParams.has('redirect_uri')).toBe(true);
          // The browser never requested the IdP, and stayed on the app.
          expect(sso.blockedIdpRequests).toHaveLength(0);
          expect(new URL(page.url()).origin).toBe(appOrigin);
        });
      },
    );
  }
});
