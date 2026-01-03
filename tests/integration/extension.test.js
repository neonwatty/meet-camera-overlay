import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(process.cwd());

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
      ],
    });

    // Get extension ID from service worker
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    extensionId = background.url().split('/')[2];
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('popup loads correctly', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Check popup elements exist
    await expect(page.locator('h1')).toContainText('Meet Overlay');
    await expect(page.locator('#add-overlay')).toBeVisible();
    await expect(page.locator('#empty-state')).toBeVisible();

    await page.close();
  });

  test('can add an overlay via popup', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Click add overlay button
    await page.click('#add-overlay');

    // Modal should appear
    await expect(page.locator('#add-modal')).toBeVisible();

    // Enter a test image URL
    await page.fill('#image-url', 'https://via.placeholder.com/100x100.png');

    // Confirm add
    await page.click('#confirm-add');

    // Wait for overlay to be added
    await expect(page.locator('.overlay-item')).toBeVisible({ timeout: 5000 });

    // Empty state should be hidden
    await expect(page.locator('#empty-state')).toBeHidden();

    await page.close();
  });

  test('preview page loads with camera', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/preview.html`);

    // Check preview elements
    await expect(page.locator('#startCamera')).toBeVisible();

    // Start camera
    await page.click('#startCamera');

    // Wait for video to be playing
    await page.waitForFunction(() => {
      const video = document.getElementById('video');
      return video && video.readyState >= 2;
    }, { timeout: 10000 });

    await page.close();
  });

  test('overlays persist in storage', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Add overlay
    await page.click('#add-overlay');
    await page.fill('#image-url', 'https://via.placeholder.com/50x50.png');
    await page.click('#confirm-add');
    await expect(page.locator('.overlay-item')).toBeVisible({ timeout: 5000 });

    // Reload page
    await page.reload();

    // Overlay should still be there
    await expect(page.locator('.overlay-item')).toBeVisible();

    await page.close();
  });

  test('can delete an overlay', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Should have overlays from previous test
    const overlayCount = await page.locator('.overlay-item').count();

    if (overlayCount > 0) {
      // Delete first overlay
      await page.click('.overlay-item .delete-btn');

      // Should have one less overlay
      await expect(page.locator('.overlay-item')).toHaveCount(overlayCount - 1);
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
      ],
    });
  });

  test.afterAll(async () => {
    await context.close();
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
