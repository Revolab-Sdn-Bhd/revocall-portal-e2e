import { test as base, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LoginPage } from '../pages/login/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { SidebarComponent } from '../pages/components/SidebarComponent';
import { AuditLogPage } from '../pages/audit-log/AuditLogPage';
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
});

export { expect };
