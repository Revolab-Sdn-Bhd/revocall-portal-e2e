import { test as base, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LoginPage } from '../pages/login/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { SidebarComponent } from '../pages/components/SidebarComponent';
import { AuditLogPage } from '../pages/audit-log/AuditLogPage';
import { ConversationLogsPage } from '../pages/conversation-logs/ConversationLogsPage';
import type { SidebarItem } from '../pages/components/SidebarComponent';

/** Where the logged-in session is saved by tests/setup/auth.setup.ts (git-ignored). */
export const AUTH_FILE = path.resolve(__dirname, '../playwright/.auth/user.json');

export type LoginUser = {
  email: string;
  password: string;
  organization?: string;
  /* Name shown in the sidebar after login. Leave empty to skip that check. */
  displayName?: string;
};

export type LoginData = {
  url: string;
  signInUrlPattern: string;
  successUrlPattern: string;
  validUser: LoginUser;
  /* Email only: the dedicated account for the failed-login test (no password needed). */
  failedLoginEmail: string;
  unknownUser: LoginUser;
  wrongPassword: string;
  invalidEmailFormat: string;
  messages: {
    invalidCredentials: string;
    signOutConfirm: string;
  };
};

export type AuditLogData = {
  page: SidebarItem;
  signIn: { filterLabel: string; eventLabel: string; resultLabel: string; verb: string };
  pollTimeoutMs: number;
};

export type ConversationLogsData = {
  page: SidebarItem;
  columns: { call: string[]; chat: string[] };
  formats: {
    dateTimePattern: string;
    durationPattern: string;
    numberPattern: string;
    conversationIdPattern: string;
  };
  outcomeValues: { call: string[]; chat: string[] };
  filters: {
    journey: string;
    disposition: string;
    outcome: string;
    secondOutcome: string;
    chatWidget: string;
    chatJourney: string;
    secondChatJourney: string;
    secondChatWidget: string;
    noRowsDisposition: string;
    noResponseDisposition: string;
    escalatedOutcome: string;
    droppedOutcome: string;
    callbackItem: string;
    notCallbackItem: string;
  };
  pageSize: { call: number; chat: number };
  filterOptions: {
    callOutcomes: string[];
    chatOutcomes: string[];
    dispositions: string[];
    dispositionsChecked: string[];
    chatWidgets: string[];
    prdCallOutcomes: string[];
  };
  requestValues: {
    outcome: Record<string, string>;
    disposition: Record<string, string>;
  };
  chipVariants: Record<string, string>;
  messages: {
    emptyCall: string;
    emptyChat: string;
    emptyHint: string;
    callbackTag: string;
    testCallContact: string;
    placeholder: string;
    searchPlaceholderCall: string;
    searchPlaceholderChat: string;
  };
  search: {
    journeyTerm: string;
    journeyTermCased: string;
    paddedTerm: string;
    noMatch: string;
    manyResults: string;
    chatWidgetTerm: string;
    scriptTerm: string;
    sqlTerm: string;
    idPrefixLength: number;
  };
  urlParams: {
    disposition: string;
    twoDispositions: string;
    unknownTab: string;
    unknownDisposition: string;
  };
  viewport: { width: number; height: number };
  access: {
    callListPath: string;
    callListMessage: Record<string, unknown>;
    callExportCountPath: string;
    chatExportPath: string;
    exportRangeDaysAgo: number;
    exportTimezone: string;
    unauthenticatedCode: string;
    /* Signed-in user and active organisation (Connect RPC, GET, cookie session). */
    profilePath: string;
    /* Details requests of one conversation (message: { callLogId }); they carry no organisation. */
    callSummaryPath: string;
    callToolCallsPath: string;
    permissionDeniedCode: string;
    /* Where the app sends a signed-in user who opens a page the role has no permission for. */
    noAccessHomePattern: string;
    homeSidebarLabel: string;
  };
  sorting: { call: string[]; callNotSortable: string[]; chat: string[] };
  detailsTabs: {
    call: string[];
    chat: string[];
    noExtraction: string;
    stillProcessing: string;
    noRating: string;
    sentimentLabels: string[];
    audioLabel: string;
    downloadLink: string;
    noCredits: string;
  };
  details: {
    call: { dialogName: string; tabs: string[] };
    chat: { dialogName: string; tabs: string[] };
  };
  export: {
    dialogName: string;
    callHeading: string;
    callFilenamePattern: string;
    chatFilenamePattern: string;
    chatNote: string;
    chatFromDaysAgo: number;
    downloadTimeoutMs: number;
  };
};

/** Reads a JSON file from the test-data folder, e.g. readTestData('login/login.json'). */
export function readTestData<T>(relativePath: string): T {
  const filePath = path.resolve(__dirname, '../test-data', relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

/**
 * Loads login test data. Credentials come from .env (LOGIN_EMAIL, LOGIN_PASSWORD,
 * LOGIN_ORGANIZATION, LOGIN_DISPLAY_NAME) and override the values in login.json.
 * FAILED_LOGIN_EMAIL is the dedicated account for the wrong-password test (DATA-03).
 */
function loadLoginData(): LoginData {
  const data = readTestData<LoginData>('login/login.json');

  data.validUser = {
    email: process.env.LOGIN_EMAIL || data.validUser.email,
    password: process.env.LOGIN_PASSWORD || data.validUser.password,
    organization: process.env.LOGIN_ORGANIZATION || data.validUser.organization,
    displayName: process.env.LOGIN_DISPLAY_NAME || data.validUser.displayName,
  };

  data.failedLoginEmail = process.env.FAILED_LOGIN_EMAIL || data.failedLoginEmail;

  return data;
}

/** Stops the test with a clear message when no credentials are configured. */
export function requireCredentials(user: LoginUser) {
  if (!user.email || !user.password) {
    throw new Error(
      'Missing credentials: copy .env.example to .env and set LOGIN_EMAIL and LOGIN_PASSWORD.',
    );
  }
}

/** Stops the wrong-password test with a clear message when its dedicated account is not configured. */
export function requireFailedLoginEmail(email: string) {
  if (!email) {
    throw new Error(
      'Missing account: set FAILED_LOGIN_EMAIL in .env (see .env.example). It must be a dedicated account, not LOGIN_EMAIL.',
    );
  }
}

type BaseFixtures = {
  loginData: LoginData;
  loginPage: LoginPage;
  sidebar: SidebarComponent;
  dashboardPage: DashboardPage;
  auditLogData: AuditLogData;
  auditLogPage: AuditLogPage;
  conversationLogsData: ConversationLogsData;
  conversationLogsPage: ConversationLogsPage;
};

/**
 * Shared fixtures for every test. Page objects are created here but not opened,
 * so each test (or a feature fixture) decides where to start.
 */
export const test = base.extend<BaseFixtures>({
  loginData: async ({}, use) => {
    await use(loadLoginData());
  },

  loginPage: async ({ page, loginData }, use) => {
    await use(new LoginPage(page, loginData.url));
  },

  sidebar: async ({ page }, use) => {
    await use(new SidebarComponent(page));
  },

  dashboardPage: async ({ page, sidebar }, use) => {
    await use(new DashboardPage(page, sidebar));
  },

  auditLogData: async ({}, use) => {
    await use(readTestData<AuditLogData>('audit-log/audit-log.json'));
  },

  auditLogPage: async ({ page, auditLogData }, use) => {
    await use(new AuditLogPage(page, auditLogData.page.heading));
  },

  conversationLogsData: async ({}, use) => {
    await use(readTestData<ConversationLogsData>('conversation-logs/conversation-logs.json'));
  },

  conversationLogsPage: async ({ page, conversationLogsData }, use) => {
    const { page: item, details, export: exportData } = conversationLogsData;
    await use(
      new ConversationLogsPage(page, {
        path: item.path,
        heading: item.heading,
        callDetailsName: details.call.dialogName,
        chatDetailsName: details.chat.dialogName,
        exportDialogName: exportData.dialogName,
        exportCallsHeading: exportData.callHeading,
      }),
    );
  },
});

export { expect };
