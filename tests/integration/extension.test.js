import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(process.cwd());
const isCI = !!process.env.CI;
const videoDir = path.resolve(process.cwd(), 'test-results/videos');

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
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 }
      }
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

  test('overlays with layer and zIndex fields are received', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/mock-meet.html');

    const testOverlays = [
      { id: 'bg1', src: 'data:image/png;base64,xxx', x: 0, y: 0, width: 100, height: 100, opacity: 1, name: 'Background 1', layer: 'background', zIndex: 0, category: 'user' },
      { id: 'fg1', src: 'data:image/png;base64,xxx', x: 10, y: 10, width: 20, height: 20, opacity: 1, name: 'Foreground 1', layer: 'foreground', zIndex: 0, category: 'user' },
      { id: 'fg2', src: 'data:image/png;base64,xxx', x: 30, y: 10, width: 20, height: 20, opacity: 0.8, name: 'Foreground 2', layer: 'foreground', zIndex: 1, category: 'user' },
    ];

    await page.evaluate((overlays) => {
      window.__mockMeet.sendOverlays(overlays);
    }, testOverlays);

    await page.waitForTimeout(100);

    const receivedOverlays = await page.evaluate(() => {
      return window.__mockMeet.getOverlays();
    });

    expect(receivedOverlays).toHaveLength(3);

    const bg1 = receivedOverlays.find(o => o.id === 'bg1');
    expect(bg1.layer).toBe('background');
    expect(bg1.zIndex).toBe(0);
    expect(bg1.category).toBe('user');

    const fg1 = receivedOverlays.find(o => o.id === 'fg1');
    expect(fg1.layer).toBe('foreground');
    expect(fg1.zIndex).toBe(0);

    const fg2 = receivedOverlays.find(o => o.id === 'fg2');
    expect(fg2.layer).toBe('foreground');
    expect(fg2.zIndex).toBe(1);

    await page.close();
  });

  test('effect overlays are received with active state', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/mock-meet.html');

    const testOverlays = [
      { id: 'effect1', src: 'data:image/gif;base64,xxx', x: 0, y: 0, width: 100, height: 100, opacity: 1, name: 'Fire Effect', type: 'effect', active: false, layer: 'background', zIndex: 0 },
      { id: 'standard1', src: 'data:image/png;base64,xxx', x: 10, y: 10, width: 20, height: 20, opacity: 1, name: 'Logo', type: 'standard', layer: 'foreground', zIndex: 0 },
    ];

    await page.evaluate((overlays) => {
      window.__mockMeet.sendOverlays(overlays);
    }, testOverlays);

    await page.waitForTimeout(100);

    const receivedOverlays = await page.evaluate(() => {
      return window.__mockMeet.getOverlays();
    });

    expect(receivedOverlays).toHaveLength(2);

    const effect = receivedOverlays.find(o => o.id === 'effect1');
    expect(effect.type).toBe('effect');
    expect(effect.active).toBe(false);

    const standard = receivedOverlays.find(o => o.id === 'standard1');
    expect(standard.type).toBe('standard');

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
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 }
      }
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

    await expect(page.locator('h1')).toContainText('Camera Overlay');
    await expect(page.locator('#add-overlay')).toBeVisible();

    await page.close();
  });

  test('can add and delete an overlay with confirmation', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear existing overlays
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    // Add overlay
    await page.click('#add-overlay');
    await expect(page.locator('#add-modal')).toBeVisible();

    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.fill('#image-url', testDataUrl);
    await page.click('#confirm-add');

    await expect(page.locator('.overlay-item')).toBeVisible({ timeout: 5000 });

    // Delete overlay - now requires confirmation
    await page.click('.overlay-item .delete-btn');
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await expect(page.locator('#confirm-title')).toContainText('Delete');

    // Confirm deletion
    await page.click('#confirm-ok');
    await page.waitForTimeout(500);

    await expect(page.locator('#user-empty-state')).toBeVisible();

    await page.close();
  });

  test('can cancel delete confirmation', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear and add an overlay
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    await page.click('#add-overlay');
    await page.fill('#image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await page.click('#confirm-add');
    await expect(page.locator('.overlay-item')).toHaveCount(1);

    // Click delete, then cancel
    await page.click('.overlay-item .delete-btn');
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.click('#confirm-cancel');

    // Overlay should still exist
    await expect(page.locator('#confirm-modal')).toBeHidden();
    await expect(page.locator('.overlay-item')).toHaveCount(1);

    // Clean up
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await page.close();
  });

  test('preview page loads', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/preview.html`);

    await expect(page.locator('#start-btn')).toBeVisible();

    await page.close();
  });

  test('layer toggle switches overlay between foreground and background', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear any existing overlays first
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    // Add an overlay
    await page.click('#add-overlay');
    await expect(page.locator('#add-modal')).toBeVisible();

    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.fill('#image-url', testDataUrl);
    await page.click('#confirm-add');

    await expect(page.locator('.overlay-item')).toBeVisible({ timeout: 5000 });

    // Check initial state - should be foreground (Front button active)
    const frontBtn = page.locator('.layer-toggle .layer-btn[data-layer="foreground"]');
    await expect(frontBtn).toHaveClass(/active/);

    // Click Back button to switch to background
    const backBtn = page.locator('.layer-toggle .layer-btn[data-layer="background"]');
    await backBtn.click();

    // Verify Back is now active
    await expect(backBtn).toHaveClass(/active/);
    await expect(frontBtn).not.toHaveClass(/active/);

    // Verify status message
    await expect(page.locator('#status')).toContainText('background');

    // Clean up - confirm deletion
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await page.close();
  });

  test('duplicate button creates a copy of overlay', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear any existing overlays first
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    // Add an overlay
    await page.click('#add-overlay');
    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.fill('#image-url', testDataUrl);
    await page.click('#confirm-add');

    await expect(page.locator('.overlay-item')).toHaveCount(1);

    // Click duplicate button
    await page.click('.overlay-item .duplicate-btn');

    // Should now have 2 overlays
    await expect(page.locator('.overlay-item')).toHaveCount(2);

    // Second overlay should have (Copy) in name
    const names = await page.locator('.overlay-item .name').allTextContents();
    expect(names.some(name => name.includes('(Copy)'))).toBe(true);

    // Verify status message
    await expect(page.locator('#status')).toContainText('duplicated');

    // Clean up - confirm deletions
    await page.click('.overlay-item:first-child .delete-btn');
    await page.click('#confirm-ok');
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await page.close();
  });

  test('My Overlays section shows user overlays', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear any existing overlays first
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    // Initially should show empty state
    await expect(page.locator('#user-empty-state')).toBeVisible();
    await expect(page.locator('#user-overlay-list .overlay-item')).toHaveCount(0);

    // Add an overlay
    await page.click('#add-overlay');
    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.fill('#image-url', testDataUrl);
    await page.click('#confirm-add');

    // Empty state should be hidden, overlay should appear in user list
    await expect(page.locator('#user-empty-state')).toBeHidden();
    await expect(page.locator('#user-overlay-list .overlay-item')).toHaveCount(1);

    // Bundled section should remain hidden (no bundled overlays)
    await expect(page.locator('#bundled-section')).toBeHidden();

    // Clean up - confirm deletion
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await page.close();
  });

  test('drag handle is visible for reordering', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear and add two overlays
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    // Add first overlay
    await page.click('#add-overlay');
    await page.fill('#image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await page.click('#confirm-add');
    await expect(page.locator('.overlay-item')).toHaveCount(1);

    // Add second overlay
    await page.click('#add-overlay');
    await page.fill('#image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    await page.click('#confirm-add');
    await expect(page.locator('.overlay-item')).toHaveCount(2);

    // Verify drag handles are present
    await expect(page.locator('.overlay-item .drag-handle')).toHaveCount(2);

    // Verify items are draggable
    const firstItem = page.locator('.overlay-item').first();
    await expect(firstItem).toHaveAttribute('draggable', 'true');

    // Clean up - confirm deletions
    await page.click('.overlay-item:first-child .delete-btn');
    await page.click('#confirm-ok');
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await page.close();
  });

  test('add effect button opens modal with effect hint', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Click add effect button
    await page.click('#add-effect');

    // Modal should be visible with effect-specific content
    await expect(page.locator('#add-modal')).toBeVisible();
    await expect(page.locator('#modal-title')).toContainText('Effect');
    await expect(page.locator('#modal-hint')).toContainText('animated');

    // Cancel
    await page.click('#cancel-add');
    await expect(page.locator('#add-modal')).toBeHidden();

    await page.close();
  });

  test('undo restores deleted overlay with Ctrl+Z', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear and add an overlay
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    await page.click('#add-overlay');
    await page.fill('#image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await page.click('#confirm-add');
    await expect(page.locator('.overlay-item')).toHaveCount(1);

    // Delete with confirmation
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await expect(page.locator('.overlay-item')).toHaveCount(0);

    // Undo with Ctrl+Z
    await page.keyboard.press('Control+z');
    await expect(page.locator('.overlay-item')).toHaveCount(1);
    await expect(page.locator('#status')).toContainText('Undid');

    // Clean up
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await page.close();
  });

  test('redo restores action after undo with Ctrl+Y', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear and add an overlay
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    await page.click('#add-overlay');
    await page.fill('#image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await page.click('#confirm-add');
    await expect(page.locator('.overlay-item')).toHaveCount(1);

    // Undo the add
    await page.keyboard.press('Control+z');
    await expect(page.locator('.overlay-item')).toHaveCount(0);

    // Redo with Ctrl+Y
    await page.keyboard.press('Control+y');
    await expect(page.locator('.overlay-item')).toHaveCount(1);
    await expect(page.locator('#status')).toContainText('Redid');

    // Clean up
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await page.close();
  });

  test('Escape closes confirmation modal', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear and add an overlay
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    await page.click('#add-overlay');
    await page.fill('#image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await page.click('#confirm-add');

    // Open delete confirmation
    await page.click('.overlay-item .delete-btn');
    await expect(page.locator('#confirm-modal')).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(page.locator('#confirm-modal')).toBeHidden();

    // Overlay should still exist
    await expect(page.locator('.overlay-item')).toHaveCount(1);

    // Clean up
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await page.close();
  });

  test('clicking overlay item selects it with visual feedback', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear and add an overlay
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    await page.click('#add-overlay');
    await page.fill('#image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await page.click('#confirm-add');

    // Click on overlay item (not on a button)
    await page.click('.overlay-item .thumb');

    // Should have selected class
    await expect(page.locator('.overlay-item')).toHaveClass(/selected/);

    // Clean up
    await page.click('.overlay-item .delete-btn');
    await page.click('#confirm-ok');
    await page.close();
  });

  test('Delete key removes selected overlay', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear and add an overlay
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    await page.click('#add-overlay');
    await page.fill('#image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await page.click('#confirm-add');

    // Select the overlay
    await page.click('.overlay-item .thumb');
    await expect(page.locator('.overlay-item')).toHaveClass(/selected/);

    // Press Delete key
    await page.keyboard.press('Delete');

    // Confirmation should appear
    await expect(page.locator('#confirm-modal')).toBeVisible();

    // Confirm
    await page.click('#confirm-ok');
    await expect(page.locator('.overlay-item')).toHaveCount(0);

    await page.close();
  });

  test('undo after add removes the overlay', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear overlays
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    // Add an overlay
    await page.click('#add-overlay');
    await page.fill('#image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await page.click('#confirm-add');
    await expect(page.locator('.overlay-item')).toHaveCount(1);

    // Undo the add
    await page.keyboard.press('Control+z');
    await expect(page.locator('.overlay-item')).toHaveCount(0);
    await expect(page.locator('#status')).toContainText('Undid add');

    await page.close();
  });

  test('shows error when nothing to undo', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear overlays and any undo state by reloading
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.reload();

    // Try to undo with nothing to undo
    await page.keyboard.press('Control+z');
    await expect(page.locator('#status')).toContainText('Nothing to undo');

    await page.close();
  });

  test('bundled effects section appears when bundled effects exist', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Add a bundled effect to storage
    await page.evaluate(() => {
      const bundledEffect = {
        id: 'bundled-test',
        src: 'chrome-extension://test/assets/effects/test.gif',
        x: 0, y: 0, width: 100, height: 100,
        opacity: 1,
        type: 'effect',
        active: false,
        name: 'Test Aura',
        category: 'bundled',
        layer: 'background',
        zIndex: 0,
        createdAt: Date.now()
      };
      chrome.storage.local.set({ overlays: [bundledEffect] });
    });
    await page.reload();

    // Bundled section should be visible
    await expect(page.locator('#bundled-section')).toBeVisible();
    await expect(page.locator('#bundled-section h2')).toContainText('Bundled Effects');
    await expect(page.locator('#bundled-overlay-list .overlay-item')).toHaveCount(1);

    // Clean up
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.close();
  });

  test('bundled effects have trigger button for activation', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Add a bundled effect
    await page.evaluate(() => {
      const bundledEffect = {
        id: 'bundled-test-2',
        src: 'chrome-extension://test/assets/effects/test.gif',
        x: 0, y: 0, width: 100, height: 100,
        opacity: 1,
        type: 'effect',
        active: false,
        name: 'Test Aura',
        category: 'bundled',
        layer: 'background',
        zIndex: 0,
        createdAt: Date.now()
      };
      chrome.storage.local.set({ overlays: [bundledEffect] });
    });
    await page.reload();

    // Check trigger button exists and shows OFF state
    const triggerBtn = page.locator('#bundled-overlay-list .trigger-btn');
    await expect(triggerBtn).toBeVisible();
    await expect(triggerBtn).toContainText('OFF');

    // Clean up
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.close();
  });

  test('bundled and user overlays display in separate sections', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Add both bundled and user overlays
    await page.evaluate(() => {
      const overlays = [
        {
          id: 'user-overlay-1',
          src: 'data:image/png;base64,abc',
          x: 10, y: 10, width: 20, height: 20,
          opacity: 1,
          type: 'standard',
          name: 'User Image',
          category: 'user',
          layer: 'foreground',
          zIndex: 0,
          createdAt: Date.now()
        },
        {
          id: 'bundled-aura-1',
          src: 'chrome-extension://test/assets/effects/blue.gif',
          x: 0, y: 0, width: 100, height: 100,
          opacity: 1,
          type: 'effect',
          active: false,
          name: 'Blue Aura',
          category: 'bundled',
          layer: 'background',
          zIndex: 0,
          createdAt: Date.now()
        }
      ];
      chrome.storage.local.set({ overlays });
    });
    await page.reload();

    // User overlay in user section
    await expect(page.locator('#user-overlay-list .overlay-item')).toHaveCount(1);
    await expect(page.locator('#user-overlay-list .overlay-item .name')).toContainText('User Image');

    // Bundled overlay in bundled section
    await expect(page.locator('#bundled-overlay-list .overlay-item')).toHaveCount(1);
    await expect(page.locator('#bundled-overlay-list .overlay-item .name')).toContainText('Blue Aura');

    // Clean up
    await page.evaluate(() => {
      chrome.storage.local.set({ overlays: [] });
    });
    await page.close();
  });
});
