import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(process.cwd());
const isCI = !!process.env.CI;

/**
 * Mock Meet Page Tests - These work reliably in CI
 * Tests the mock page that simulates Meet's camera behavior
 */
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

  test('camera stream is properly created', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/mock-meet.html');

    // Start camera
    await page.click('#start-btn');

    // Wait for camera to start
    await page.waitForFunction(() => window.__mockMeetActive === true, { timeout: 10000 });

    // Verify stream exists and has video track
    const streamInfo = await page.evaluate(() => {
      const stream = window.__mockMeet.getStream();
      if (!stream) return null;
      const videoTracks = stream.getVideoTracks();
      return {
        hasStream: true,
        videoTrackCount: videoTracks.length,
        trackLabel: videoTracks[0]?.label || '',
        trackEnabled: videoTracks[0]?.enabled || false,
      };
    });

    expect(streamInfo).not.toBeNull();
    expect(streamInfo.hasStream).toBe(true);
    expect(streamInfo.videoTrackCount).toBe(1);
    expect(streamInfo.trackEnabled).toBe(true);

    await page.click('#stop-btn');
    await page.close();
  });

  test('overlay updates with opacity are received', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/mock-meet.html');

    // Send overlay update with opacity
    const testOverlay = {
      id: 'test-overlay-1',
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      opacity: 0.75,
      name: 'Test Overlay'
    };

    await page.evaluate((overlay) => {
      window.__mockMeet.sendOverlays([overlay]);
    }, testOverlay);

    // Wait a moment for message to be processed
    await page.waitForTimeout(100);

    // Verify overlay was received
    const receivedOverlays = await page.evaluate(() => {
      return window.__mockMeet.getOverlays();
    });

    expect(receivedOverlays).toHaveLength(1);
    expect(receivedOverlays[0].id).toBe('test-overlay-1');
    expect(receivedOverlays[0].opacity).toBe(0.75);
    expect(receivedOverlays[0].x).toBe(10);
    expect(receivedOverlays[0].y).toBe(20);

    await page.close();
  });

  test('multiple overlays with varying opacities are handled', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/mock-meet.html');

    const testOverlays = [
      { id: 'full', src: 'data:image/png;base64,xxx', x: 0, y: 0, width: 20, height: 20, opacity: 1, name: 'Full' },
      { id: 'half', src: 'data:image/png;base64,xxx', x: 30, y: 0, width: 20, height: 20, opacity: 0.5, name: 'Half' },
      { id: 'quarter', src: 'data:image/png;base64,xxx', x: 60, y: 0, width: 20, height: 20, opacity: 0.25, name: 'Quarter' },
    ];

    await page.evaluate((overlays) => {
      window.__mockMeet.sendOverlays(overlays);
    }, testOverlays);

    await page.waitForTimeout(100);

    const receivedOverlays = await page.evaluate(() => {
      return window.__mockMeet.getOverlays();
    });

    expect(receivedOverlays).toHaveLength(3);
    expect(receivedOverlays.find(o => o.id === 'full').opacity).toBe(1);
    expect(receivedOverlays.find(o => o.id === 'half').opacity).toBe(0.5);
    expect(receivedOverlays.find(o => o.id === 'quarter').opacity).toBe(0.25);

    await page.close();
  });
});

/**
 * Extension Popup Tests - Only run locally, skipped in CI
 * CI environments have issues with chrome://extensions shadow DOM
 */
test.describe('Extension Popup Tests', () => {
  test.skip(isCI, 'Extension popup tests are skipped in CI - run locally');

  let context;
  let extensionId;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--no-first-run',
      ],
    });

    // Get extension ID from chrome://extensions page
    const page = await context.newPage();
    await page.goto('chrome://extensions');
    await page.waitForTimeout(1000);

    extensionId = await page.evaluate(() => {
      const manager = document.querySelector('extensions-manager');
      if (manager?.shadowRoot) {
        const itemsList = manager.shadowRoot.querySelector('extensions-item-list');
        if (itemsList?.shadowRoot) {
          const item = itemsList.shadowRoot.querySelector('extensions-item');
          return item?.id || null;
        }
      }
      return null;
    });

    await page.close();
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

    await expect(page.locator('h1')).toContainText('Meet Overlay');
    await expect(page.locator('#add-overlay')).toBeVisible();

    await page.close();
  });

  test('can add and delete an overlay', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Add overlay
    await page.click('#add-overlay');
    await expect(page.locator('#add-modal')).toBeVisible();

    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.fill('#image-url', testDataUrl);
    await page.click('#confirm-add');

    await expect(page.locator('.overlay-item')).toBeVisible({ timeout: 5000 });

    // Delete overlay
    await page.click('.overlay-item .delete-btn');
    await page.waitForTimeout(500);

    await expect(page.locator('#empty-state')).toBeVisible();

    await page.close();
  });

  test('preview page loads', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/preview.html`);

    await expect(page.locator('#startCamera')).toBeVisible();

    await page.close();
  });
});
