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

/** Conversation Logs, Call tab list: loaded on open and on every filter or page change (Connect RPC, GET). */
export const isCallLogListCall = (traffic: Traffic) =>
  pathOf(traffic).endsWith('/admin.calllog.v2.CallLogService/List');

/** Conversation Logs, Chat tab list (Connect RPC, GET). */
export const isChatLogListCall = (traffic: Traffic) =>
  pathOf(traffic).endsWith('/admin.chatlog.v1.ChatLogService/List');

/** Call export download (GET /api/calllog/v2/export). The "/count" call made when the dialog opens does not match. */
export const isCallLogExportCall = (traffic: Traffic) =>
  pathOf(traffic) === '/api/calllog/v2/export';

/** Chat export download (GET /api/chatlog/v1/export.csv, text/csv). */
export const isChatLogExportCall = (traffic: Traffic) =>
  pathOf(traffic) === '/api/chatlog/v1/export.csv';

/** Call export, count of calls in the range, made when the Export dialog opens (GET /api/calllog/v2/export/count). */
export const isCallLogExportCountCall = (traffic: Traffic) =>
  pathOf(traffic) === '/api/calllog/v2/export/count';

/** Filters, search, sort and paging the UI sent with a list call (the JSON in the "message" query parameter). */
export const listRequestOf = (traffic: Traffic): Record<string, unknown> =>
  JSON.parse(new URL(traffic.url()).searchParams.get('message') ?? '{}') as Record<string, unknown>;

/** A Call details request by RPC name, e.g. GetCallSummary, GetTranscription, GetCallRating (Connect RPC, GET). */
export const isCallLogRpc = (name: string) => (traffic: Traffic) =>
  pathOf(traffic).endsWith(`/admin.calllog.v2.CallLogService/${name}`);

/** A Chat details request by RPC name, e.g. GetConversationAnalytics, GetConversationToolCalls (Connect RPC, GET). */
export const isChatAnalyticsRpc = (name: string) => (traffic: Traffic) =>
  pathOf(traffic).endsWith(`/admin.chatanalytics.v1.ChatAnalyticsService/${name}`) ||
  pathOf(traffic).endsWith(`/ChatAnalyticsService/${name}`);

/** All journeys of the organisation, drafts included (Connect RPC, GET). */
export const isJourneyListCall = (traffic: Traffic) =>
  pathOf(traffic).endsWith('/admin.journey.v1.JourneyService/List');

/** Published journeys, the list the Journey filters are built from (Connect RPC, GET). */
export const isPublishedJourneyListCall = (traffic: Traffic) =>
  pathOf(traffic).endsWith('/admin.journey.v1.JourneyService/ListPublished');

/** Audio of one call, requested when Call details opens (GET /api/calllog/v2/recordings/<id>/audio). */
export const isRecordingAudioCall = (traffic: Traffic) =>
  /^\/api\/calllog\/v2\/recordings\/[^/]+\/audio$/.test(pathOf(traffic));

/** Chat widgets of the organisation, loaded when the Chat tab opens (Connect RPC, POST). */
export const isWidgetListCall = (traffic: Traffic) =>
  pathOf(traffic).endsWith('/chat.external.widget.v2.WidgetService/ListWidgets');
