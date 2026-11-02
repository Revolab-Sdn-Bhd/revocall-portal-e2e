import { expect, type Locator, type Page } from '@playwright/test';
import { showCheck } from '../../utils/show-check';
import { isChangePasswordCall } from '../../utils/api';

/**
 * Page Object for the "Change password" dialog, opened from the key icon in the dashboard sidebar.
 * Fields: Current password, New password, Confirm new password.
 * Policy shown in the dialog: at least 10 characters, 1 letter, 1 number, 1 special character.
 * On success the app closes the dialog (no toast was observed) and the user stays signed in.
 */
export class ChangePasswordDialog {
  readonly page: Page;
  readonly openButton: Locator;
  readonly dialog: Locator;
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly updateButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.openButton = page.getByRole('button', { name: 'Change password' });
    this.dialog = page.getByRole('dialog', { name: 'Change password' });
    this.currentPasswordInput = this.dialog.getByRole('textbox', { name: 'Current password' });
    // exact: "Confirm new password" also contains "new password".
    this.newPasswordInput = this.dialog.getByRole('textbox', { name: 'New password', exact: true });
    this.confirmPasswordInput = this.dialog.getByRole('textbox', { name: 'Confirm new password' });
    this.updateButton = this.dialog.getByRole('button', { name: 'Update password' });
    this.cancelButton = this.dialog.getByRole('button', { name: 'Cancel' });
  }

  async open() {
    await this.openButton.click();
    await expect(this.dialog).toBeVisible();
    await showCheck(this.dialog);
  }

  /**
   * Fills the form, submits it and waits for the server to accept the change.
   * Resolves only when the API answered OK and the dialog closed.
   */
  async changePassword(currentPassword: string, newPassword: string) {
    await this.currentPasswordInput.fill(currentPassword);
    await this.newPasswordInput.fill(newPassword);
    await this.confirmPasswordInput.fill(newPassword);

    const changeResponse = this.page.waitForResponse(isChangePasswordCall);
    await this.updateButton.click();
    const response = await changeResponse;
    expect(response.ok(), 'ChangePassword call should succeed').toBe(true);

    await expect(this.dialog).toBeHidden();
  }
}
