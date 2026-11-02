import type { Request, Response } from '@playwright/test';

/**
 * Matchers for the RevoCall Admin API calls the tests wait on.
 * Taken from the app's own code. Matching on the URL path only (no host, no query)
 * keeps them stable across environments.
 */
type Traffic = Request | Response;

const pathOf = (traffic: Traffic) => new URL(traffic.url()).pathname;

/** Email check when clicking "Continue" (GET /api/auth/sso/connections?email=...). */
export const isDiscoverCall = (traffic: Traffic) => pathOf(traffic) === '/api/auth/sso/connections';

/** Sign-in with email + password (Connect RPC). */
export const isLoginCall = (traffic: Traffic) =>
  pathOf(traffic).endsWith('/admin.auth.v1.AuthService/Login');

/** Sign-out (Connect RPC). */
export const isLogoutCall = (traffic: Traffic) =>
  pathOf(traffic).endsWith('/admin.auth.v1.AuthService/Logout');

/** Change password from the sidebar dialog (Connect RPC). Returns 200 with {} on success. */
export const isChangePasswordCall = (traffic: Traffic) =>
  pathOf(traffic).endsWith('/admin.auth.v1.AuthService/ChangePassword');

/** Audit Log list, loaded on open and on every filter change (Connect RPC, POST). */
export const isAuditLogListCall = (traffic: Traffic) =>
  pathOf(traffic).endsWith('/admin.auditlog.v1.AuditLogService/ListEvents');

/** Start of the SSO sign-in when a provider button is clicked (GET /api/auth/sso/login). */
export const isSsoLoginCall = (traffic: Traffic) => pathOf(traffic) === '/api/auth/sso/login';
