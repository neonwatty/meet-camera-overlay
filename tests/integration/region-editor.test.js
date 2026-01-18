import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(process.cwd());
const testVideoPath = path.resolve(process.cwd(), 'tests/fixtures/videos/test-background.y4m');
const isCI = !!process.env.CI;
const videoDir = path.resolve(process.cwd(), 'test-results/videos');

/**
 * Region Editor Mock Meet Tests
 * Test the WallRegionEditor overlay component on the mock meet page
 */
test.describe('Region Editor Overlay Tests', () => {
  let context;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-video-capture=${testVideoPath}`,
        '--no-first-run',
        '--disable-gpu',
        '--enable-webgl',
        '--use-gl=swiftshader',
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

  test('WallRegionEditor is loaded on mock meet page', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available (loaded via script tag)
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    // Check if WallRegionEditor is available
    const hasEditor = await page.evaluate(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    });

    expect(hasEditor).toBe(true);
    await page.close();
  });

  test('editor overlay appears on show message', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    // Show the region editor
    await page.evaluate(() => {
      window.__mockMeet.showRegionEditor({
        topLeft: { x: 20, y: 20 },
        topRight: { x: 80, y: 20 },
        bottomLeft: { x: 20, y: 80 },
        bottomRight: { x: 80, y: 80 }
      });
    });

    // Wait for overlay to appear
    await page.waitForSelector('.region-editor-overlay', { timeout: 5000 });

    // Verify overlay is visible
    const isVisible = await page.evaluate(() => {
      return window.__mockMeet.isEditorVisible();
    });
    expect(isVisible).toBe(true);

    // Verify editor is active
    const isActive = await page.evaluate(() => {
      return window.__mockMeet.isEditorActive();
    });
    expect(isActive).toBe(true);

    await page.close();
  });

  test('corner handles are visible', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    // Show the region editor
    await page.evaluate(() => {
      window.__mockMeet.showRegionEditor();
    });

    await page.waitForSelector('.region-editor-overlay', { timeout: 5000 });

    // Verify canvas exists and has dimensions
    const canvasInfo = await page.evaluate(() => {
      const canvas = window.__mockMeet.getEditorCanvas();
      if (!canvas) return null;
      return {
        width: canvas.width,
        height: canvas.height
      };
    });

    expect(canvasInfo).not.toBeNull();
    expect(canvasInfo.width).toBeGreaterThan(0);
    expect(canvasInfo.height).toBeGreaterThan(0);

    await page.close();
  });

  test('can get current region from editor', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    const testRegion = {
      topLeft: { x: 15, y: 15 },
      topRight: { x: 85, y: 15 },
      bottomLeft: { x: 15, y: 85 },
      bottomRight: { x: 85, y: 85 }
    };

    // Show the region editor with test region
    await page.evaluate((region) => {
      window.__mockMeet.showRegionEditor(region);
    }, testRegion);

    await page.waitForSelector('.region-editor-overlay', { timeout: 5000 });

    // Get the region from editor
    const region = await page.evaluate(() => {
      return window.__mockMeet.getEditorRegion();
    });

    expect(region).not.toBeNull();
    expect(region.topLeft.x).toBe(15);
    expect(region.topLeft.y).toBe(15);
    expect(region.bottomRight.x).toBe(85);
    expect(region.bottomRight.y).toBe(85);

    await page.close();
  });

  test('save button persists region and closes editor', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    const testRegion = {
      topLeft: { x: 25, y: 25 },
      topRight: { x: 75, y: 25 },
      bottomLeft: { x: 25, y: 75 },
      bottomRight: { x: 75, y: 75 }
    };

    // Show the region editor
    await page.evaluate((region) => {
      window.__mockMeet.showRegionEditor(region);
    }, testRegion);

    await page.waitForSelector('.region-editor-overlay', { timeout: 5000 });

    // Click save button
    await page.evaluate(() => {
      return window.__mockMeet.clickEditorSave();
    });

    // Wait for overlay to close
    await page.waitForFunction(() => {
      return !window.__mockMeet.isEditorVisible();
    }, { timeout: 5000 });

    // Verify editor is closed
    const isVisible = await page.evaluate(() => {
      return window.__mockMeet.isEditorVisible();
    });
    expect(isVisible).toBe(false);

    // Verify saved region matches
    const savedRegion = await page.evaluate(() => {
      return window.__mockMeet.lastSavedRegion;
    });
    expect(savedRegion).not.toBeNull();
    expect(savedRegion.topLeft.x).toBe(25);

    await page.close();
  });

  test('cancel button closes editor without saving', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    // Clear any previous saved region
    await page.evaluate(() => {
      window.__mockMeet.lastSavedRegion = null;
    });

    // Show the region editor
    await page.evaluate(() => {
      window.__mockMeet.showRegionEditor();
    });

    await page.waitForSelector('.region-editor-overlay', { timeout: 5000 });

    // Click cancel button
    await page.evaluate(() => {
      return window.__mockMeet.clickEditorCancel();
    });

    // Wait for overlay to close
    await page.waitForFunction(() => {
      return !window.__mockMeet.isEditorVisible();
    }, { timeout: 5000 });

    // Verify editor is closed
    const isVisible = await page.evaluate(() => {
      return window.__mockMeet.isEditorVisible();
    });
    expect(isVisible).toBe(false);

    // Verify region was NOT saved
    const savedRegion = await page.evaluate(() => {
      return window.__mockMeet.lastSavedRegion;
    });
    expect(savedRegion).toBeNull();

    await page.close();
  });

  test('escape key cancels editing', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    // Show the region editor
    await page.evaluate(() => {
      window.__mockMeet.showRegionEditor();
    });

    await page.waitForSelector('.region-editor-overlay', { timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Wait for overlay to close
    await page.waitForFunction(() => {
      return !window.__mockMeet.isEditorVisible();
    }, { timeout: 5000 });

    // Verify editor is closed
    const isVisible = await page.evaluate(() => {
      return window.__mockMeet.isEditorVisible();
    });
    expect(isVisible).toBe(false);

    await page.close();
  });

  test('can drag corner to resize region', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    // Show the region editor with a known region
    await page.evaluate(() => {
      window.__mockMeet.showRegionEditor({
        topLeft: { x: 20, y: 20 },
        topRight: { x: 80, y: 20 },
        bottomLeft: { x: 20, y: 80 },
        bottomRight: { x: 80, y: 80 }
      });
    });

    await page.waitForSelector('.region-editor-overlay', { timeout: 5000 });

    // Get initial region
    const initialRegion = await page.evaluate(() => {
      return window.__mockMeet.getEditorRegion();
    });
    expect(initialRegion.topLeft.x).toBe(20);

    // Drag top-left corner 50px right and down
    await page.evaluate(() => {
      return window.__mockMeet.dragEditorCorner('topLeft', 50, 50);
    });

    // Get updated region
    const updatedRegion = await page.evaluate(() => {
      return window.__mockMeet.getEditorRegion();
    });

    // Top-left corner should have moved (exact value depends on canvas size)
    expect(updatedRegion.topLeft.x).toBeGreaterThan(initialRegion.topLeft.x);
    expect(updatedRegion.topLeft.y).toBeGreaterThan(initialRegion.topLeft.y);

    await page.close();
  });

  test('hide message closes editor', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    // Show the region editor
    await page.evaluate(() => {
      window.__mockMeet.showRegionEditor();
    });

    await page.waitForSelector('.region-editor-overlay', { timeout: 5000 });

    // Verify editor is visible
    const isVisibleBefore = await page.evaluate(() => {
      return window.__mockMeet.isEditorVisible();
    });
    expect(isVisibleBefore).toBe(true);

    // Hide via message
    await page.evaluate(() => {
      window.__mockMeet.hideRegionEditor();
    });

    // Wait for overlay to close
    await page.waitForFunction(() => {
      return !window.__mockMeet.isEditorVisible();
    }, { timeout: 5000 });

    // Verify editor is closed
    const isVisibleAfter = await page.evaluate(() => {
      return window.__mockMeet.isEditorVisible();
    });
    expect(isVisibleAfter).toBe(false);

    await page.close();
  });

  test('region updates are emitted during drag', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/tests/fixtures/mock-meet.html');

    // Wait for WallRegionEditor to be available
    await page.waitForFunction(() => {
      return typeof window.WallRegionEditor !== 'undefined';
    }, { timeout: 10000 });

    // Clear any previous update
    await page.evaluate(() => {
      window.__mockMeet.lastUpdatedRegion = null;
    });

    // Show the region editor
    await page.evaluate(() => {
      window.__mockMeet.showRegionEditor({
        topLeft: { x: 20, y: 20 },
        topRight: { x: 80, y: 20 },
        bottomLeft: { x: 20, y: 80 },
        bottomRight: { x: 80, y: 80 }
      });
    });

    await page.waitForSelector('.region-editor-overlay', { timeout: 5000 });

    // Drag a corner
    await page.evaluate(() => {
      return window.__mockMeet.dragEditorCorner('bottomRight', -30, -30);
    });

    // Wait for update message
    await page.waitForFunction(() => {
      return window.__mockMeet.lastUpdatedRegion !== null;
    }, { timeout: 5000 });

    // Verify update was received
    const updatedRegion = await page.evaluate(() => {
      return window.__mockMeet.lastUpdatedRegion;
    });
    expect(updatedRegion).not.toBeNull();
    expect(updatedRegion.bottomRight.x).toBeLessThan(80);

    await page.close();
  });
});

/**
 * Region Editor Popup Tests
 * Test the "Edit on Video" button in the extension popup
 */
test.describe('Region Editor Popup Tests', () => {
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
        `--use-file-for-fake-video-capture=${testVideoPath}`,
        '--no-first-run',
        '--enable-webgl',
        '--use-gl=swiftshader',
      ],
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 }
      }
    });

    // Get extension ID
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

  test('Edit on Video button is visible in wall art modal', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear tutorial flag
    await page.evaluate(() => {
      chrome.storage.local.set({ showTutorial: false });
    });
    await page.reload();

    // Open wall art modal
    await page.click('#add-wall-art');
    await expect(page.locator('#wall-art-modal')).toBeVisible();

    // Verify Edit on Video button exists
    await expect(page.locator('#edit-region-on-video')).toBeVisible();
    await expect(page.locator('#edit-region-on-video')).toContainText('Edit on Video');

    await page.close();
  });

  test('Edit on Video button shows error when no Meet tab', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear tutorial flag
    await page.evaluate(() => {
      chrome.storage.local.set({ showTutorial: false });
    });
    await page.reload();

    // Open wall art modal
    await page.click('#add-wall-art');
    await expect(page.locator('#wall-art-modal')).toBeVisible();

    // Click Edit on Video button (no Meet tab open)
    await page.click('#edit-region-on-video');

    // Should show error status
    await expect(page.locator('#status')).toContainText('Open Google Meet first');

    await page.close();
  });

  test('region canvas shows in wall art modal', async () => {
    test.skip(!extensionId, 'Could not get extension ID');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Clear tutorial flag
    await page.evaluate(() => {
      chrome.storage.local.set({ showTutorial: false });
    });
    await page.reload();

    // Open wall art modal
    await page.click('#add-wall-art');
    await expect(page.locator('#wall-art-modal')).toBeVisible();

    // Verify region canvas is visible
    await expect(page.locator('#wall-art-region-canvas')).toBeVisible();

    // Verify canvas has dimensions
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.getElementById('wall-art-region-canvas');
      return {
        width: canvas.width,
        height: canvas.height
      };
    });

    expect(canvasInfo.width).toBe(320);
    expect(canvasInfo.height).toBe(180);

    await page.close();
  });
});
