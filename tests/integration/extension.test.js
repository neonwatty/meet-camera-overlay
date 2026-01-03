import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const extensionPath = path.resolve(process.cwd());

// Read extension ID from manifest
function getExtensionId(context) {
  // Extension ID is generated from the path - we'll get it from the extensions page
  return new Promise(async (resolve) => {
    const page = await context.newPage();
    await page.goto('chrome://extensions');

    // Enable developer mode to see extension IDs
    await page.evaluate(() => {
      const manager = document.querySelector('extensions-manager');
      if (manager && manager.shadowRoot) {
        const toolbar = manager.shadowRoot.querySelector('extensions-toolbar');
        if (toolbar && toolbar.shadowRoot) {
          const toggle = toolbar.shadowRoot.querySelector('#devMode');
          if (toggle && !toggle.checked) {
            toggle.click();
          }
        }
      }
    });

    await page.waitForTimeout(500);

    // Get the extension ID
    const extensionId = await page.evaluate(() => {
      const manager = document.querySelector('extensions-manager');
      if (manager && manager.shadowRoot) {
        const itemsList = manager.shadowRoot.querySelector('extensions-item-list');
        if (itemsList && itemsList.shadowRoot) {
          const item = itemsList.shadowRoot.querySelector('extensions-item');
          if (item) {
            return item.id;
          }
        }
      }
      return null;
    });

    await page.close();
    resolve(extensionId);
  });
}

test.describe('Extension Integration Tests', () => {
  let context;
  let extensionId;

  test.beforeAll(async () => {
    // Launch browser with extension
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--no-first-run',
        '--disable-gpu',
      ],
    });

    // Get extension ID
    extensionId = await getExtensionId(context);
    console.log('Extension ID:', extensionId);
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test('popup loads correctly', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Check popup elements exist
    await expect(page.locator('h1')).toContainText('Meet Overlay');
    await expect(page.locator('#add-overlay')).toBeVisible();

    await page.close();
  });

  test('can add an overlay via popup', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Click add overlay button
    await page.click('#add-overlay');

    // Modal should appear
    await expect(page.locator('#add-modal')).toBeVisible();

    // Enter a test image URL (use a data URL to avoid network issues)
    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.fill('#image-url', testDataUrl);

    // Confirm add
    await page.click('#confirm-add');

    // Wait for overlay to be added
    await expect(page.locator('.overlay-item')).toBeVisible({ timeout: 5000 });

    await page.close();
  });

  test('preview page loads', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/preview.html`);

    // Check preview elements
    await expect(page.locator('#startCamera')).toBeVisible();

    await page.close();
  });

  test('overlays persist in storage', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Should have overlay from previous test
    await expect(page.locator('.overlay-item').first()).toBeVisible({ timeout: 5000 });

    // Reload page
    await page.reload();

    // Overlay should still be there
    await expect(page.locator('.overlay-item').first()).toBeVisible();

    await page.close();
  });

  test('can delete an overlay', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Get initial count
    await page.waitForTimeout(500);
    const initialCount = await page.locator('.overlay-item').count();

    if (initialCount > 0) {
      // Delete first overlay
      await page.click('.overlay-item .delete-btn');
      await page.waitForTimeout(500);

      // Should have one less overlay
      const newCount = await page.locator('.overlay-item').count();
      expect(newCount).toBe(initialCount - 1);
    }

    await page.close();
  });
});

test.describe('Mock Meet Page Tests', () => {
  let context;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--no-first-run',
        '--disable-gpu',
      ],
    });
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test('mock meet page loads', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/mock-meet.html');

    await expect(page.locator('h1')).toContainText('Mock Google Meet');
    await expect(page.locator('#start-btn')).toBeVisible();

    await page.close();
  });

  test('mock meet can start camera with fake device', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/mock-meet.html');

    // Start camera
    await page.click('#start-btn');

    // Wait for camera to start
    await page.waitForFunction(() => {
      return window.__mockMeetActive === true;
    }, { timeout: 10000 });

    // Status should indicate success
    await expect(page.locator('#status')).toContainText('Camera active');

    // Stop camera
    await page.click('#stop-btn');

    await page.close();
  });
});
