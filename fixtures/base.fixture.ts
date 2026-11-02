/// <reference types="node" />
// The project has no tsconfig.json, so VS Code does not load Node types by default.
// This line enables them for fs, path, __dirname and process.env.
import { test as base, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LoginPage } from '../pages/login/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { AuditLogPage } from '../pages/audit-log/AuditLogPage';
import type { SidebarItem } from '../pages/dashboard/DashboardPage';

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
  successUrlPattern: string;
  validUser: LoginUser;
  unknownUser: LoginUser;
  wrongPassword: string;
  invalidEmailFormat: string;
  messages: {
    invalidCredentials: string;
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
 */
function loadLoginData(): LoginData {
  const data = readTestData<LoginData>('login/login.json');

  data.validUser = {
    email: process.env.LOGIN_EMAIL || data.validUser.email,
    password: process.env.LOGIN_PASSWORD || data.validUser.password,
    organization: process.env.LOGIN_ORGANIZATION || data.validUser.organization,
    displayName: process.env.LOGIN_DISPLAY_NAME || data.validUser.displayName,
  };

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

type BaseFixtures = {
  loginData: LoginData;
  loginPage: LoginPage;
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

  dashboardPage: async ({ page, loginData }, use) => {
    await use(new DashboardPage(page, new URL(loginData.url).origin));
  },

  auditLogData: async ({}, use) => {
    await use(readTestData<AuditLogData>('audit-log/audit-log.json'));
  },

  auditLogPage: async ({ page }, use) => {
    await use(new AuditLogPage(page));
  },
});

export { expect };
