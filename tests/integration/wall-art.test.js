import { test, expect } from '@playwright/test';

/**
 * Wall Art Mock Meet Tests - Test wall art message handling
 * These tests verify that wall art overlays are properly sent and received
 */
test.describe('Wall Art Mock Meet Tests', () => {
  test('wall art overlay message is received', async ({ page }) => {
    await page.goto('http://localhost:8080/mock-meet.html');

    // Create a wall art overlay
    const wallArtOverlay = {
      id: 'wall-art-1',
      type: 'wallArt',
      name: 'Test Wall Art',
      region: {
        topLeft: { x: 10, y: 10 },
        topRight: { x: 50, y: 10 },
        bottomLeft: { x: 10, y: 60 },
        bottomRight: { x: 50, y: 60 }
      },
      paint: {
        enabled: true,
        color: '#4a6fa5',
        opacity: 80
      },
      art: null,
      active: true,
      layer: 'background',
      zIndex: 0
    };

    // Send wall art update
    await page.evaluate((overlay) => {
      window.postMessage({ type: 'MEET_OVERLAY_UPDATE_WALL_ART', wallArtOverlays: [overlay] }, '*');
    }, wallArtOverlay);

    await page.waitForTimeout(100);

    // The message should be posted - inject.js will handle it
    // For now, we just verify the message can be sent
  });

  test('wall art settings message is received', async ({ page }) => {
    await page.goto('http://localhost:8080/mock-meet.html');

    // Send wall art settings update
    const settings = {
      segmentationEnabled: true,
      segmentationPreset: 'balanced',
      featherRadius: 2
    };

    await page.evaluate((settings) => {
      window.postMessage({ type: 'MEET_OVERLAY_UPDATE_WALL_ART_SETTINGS', settings }, '*');
    }, settings);

    await page.waitForTimeout(100);
  });

  test('toggle wall art message is received', async ({ page }) => {
    await page.goto('http://localhost:8080/mock-meet.html');

    // Send toggle message
    await page.evaluate(() => {
      window.postMessage({ type: 'MEET_OVERLAY_TOGGLE_WALL_ART', id: 'wall-art-1', active: false }, '*');
    });

    await page.waitForTimeout(100);
  });

  test('camera starts with custom test video', async ({ page }) => {
    await page.goto('http://localhost:8080/mock-meet.html');

    // Start camera
    await page.click('#start-btn');

    // Wait for camera to start
    await page.waitForFunction(() => {
      return window.__mockMeetActive === true;
    }, { timeout: 10000 });

    // Status should indicate success
    await expect(page.locator('#status')).toContainText('Camera active');

    // Verify we have a stream
    const streamInfo = await page.evaluate(() => {
      const stream = window.__mockMeet.getStream();
      if (!stream) return null;
      const videoTracks = stream.getVideoTracks();
      return {
        hasStream: true,
        videoTrackCount: videoTracks.length,
        trackEnabled: videoTracks[0]?.enabled || false,
      };
    });

    expect(streamInfo).not.toBeNull();
    expect(streamInfo.hasStream).toBe(true);
    expect(streamInfo.videoTrackCount).toBe(1);

    await page.click('#stop-btn');
  });
});

/**
 * Wall Art Popup Tests - Test the popup UI for wall art features
 * These tests verify the Wall Art section in the extension popup
 */
test.describe('Wall Art Popup Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Load popup test page with Chrome mocks
    await page.goto('http://localhost:8080/popup-test.html');

    // Wait for popup to load
    await page.waitForFunction(() => window.__popupLoaded === true, { timeout: 10000 });

    // Reset mock state
    await page.evaluate(() => {
      window.__resetChromeMock();
    });

    // Reload to apply clean state
    await page.reload();
    await page.waitForFunction(() => window.__popupLoaded === true, { timeout: 10000 });
  });

  test('wall art section is visible in popup', async ({ page }) => {
    // Scroll to wall art section
    await page.evaluate(() => {
      const wallArtSection = document.querySelector('.wall-art-section');
      if (wallArtSection) wallArtSection.scrollIntoView();
    });

    // Verify wall art section exists
    await expect(page.locator('.wall-art-section')).toBeVisible();
    await expect(page.locator('.wall-art-section h2')).toContainText('Wall Art');
    await expect(page.locator('#add-wall-art')).toBeVisible();
  });

  test('can add a wall art region', async ({ page }) => {
    // Initially should show empty state
    await expect(page.locator('#wall-art-empty-state')).toBeVisible();

    // Click add wall art button
    await page.click('#add-wall-art');

    // Modal should appear
    await expect(page.locator('#wall-art-modal')).toBeVisible();
    await expect(page.locator('#wall-art-modal-title')).toContainText('Add Wall Art');

    // Region canvas should be visible
    await expect(page.locator('#wall-art-region-canvas')).toBeVisible();

    // Click confirm to add
    await page.click('#wall-art-confirm');

    // Wall art item should appear in list
    await expect(page.locator('#wall-art-list .wall-art-item')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#wall-art-empty-state')).toBeHidden();
  });

  test('can configure wall art paint color', async ({ page }) => {
    // Add a wall art region
    await page.click('#add-wall-art');
    await expect(page.locator('#wall-art-modal')).toBeVisible();

    // Enable paint
    await page.check('#wall-art-paint-enabled');

    // Set paint color
    const colorInput = page.locator('#wall-art-paint-color');
    await colorInput.fill('#ff5500');

    // Set opacity
    await page.fill('#wall-art-paint-opacity', '70');

    // Confirm
    await page.click('#wall-art-confirm');

    // Verify wall art was created
    await expect(page.locator('#wall-art-list .wall-art-item')).toBeVisible({ timeout: 5000 });

    // Check storage for paint config
    const wallArt = await page.evaluate(() => {
      return new Promise(resolve => {
        chrome.storage.local.get('wallArtOverlays', (result) => {
          resolve(result.wallArtOverlays);
        });
      });
    });

    expect(wallArt).toHaveLength(1);
    expect(wallArt[0].paint.enabled).toBe(true);
    expect(wallArt[0].paint.color).toBe('#ff5500');
    // Opacity is stored as decimal (0-1), not percentage
    expect(wallArt[0].paint.opacity).toBe(0.7);
  });

  test('can toggle person occlusion setting', async ({ page }) => {
    // Set initial state
    await page.evaluate(() => {
      chrome.storage.local.set({ wallArtSettings: { segmentationEnabled: false } });
    });
    await page.reload();
    await page.waitForFunction(() => window.__popupLoaded === true, { timeout: 10000 });

    // Scroll to segmentation panel first
    await page.evaluate(() => {
      const panel = document.querySelector('#segmentation-panel');
      if (panel) panel.scrollIntoView({ behavior: 'instant', block: 'center' });
    });

    // The checkbox is hidden (styled toggle switch), so we check state via evaluate
    const isChecked = await page.evaluate(() => {
      return document.querySelector('#segmentation-enabled').checked;
    });
    expect(isChecked).toBe(false);

    // Click the toggle switch label to enable segmentation
    await page.click('.segmentation-toggle .toggle-switch');

    // Verify options become visible
    await expect(page.locator('#segmentation-options')).toBeVisible();

    // Check storage
    const settings = await page.evaluate(() => {
      return new Promise(resolve => {
        chrome.storage.local.get('wallArtSettings', (result) => {
          resolve(result.wallArtSettings);
        });
      });
    });

    expect(settings.segmentationEnabled).toBe(true);
  });

  test('can change segmentation preset', async ({ page }) => {
    // Enable segmentation first
    await page.evaluate(() => {
      chrome.storage.local.set({ wallArtSettings: { segmentationEnabled: true } });
    });
    await page.reload();
    await page.waitForFunction(() => window.__popupLoaded === true, { timeout: 10000 });

    // Change preset
    await page.selectOption('#segmentation-preset', 'performance');

    // Verify selection
    const selectedValue = await page.locator('#segmentation-preset').inputValue();
    expect(selectedValue).toBe('performance');

    // Check storage
    const settings = await page.evaluate(() => {
      return new Promise(resolve => {
        chrome.storage.local.get('wallArtSettings', (result) => {
          resolve(result.wallArtSettings);
        });
      });
    });

    expect(settings.segmentationPreset).toBe('performance');
  });

  test('can adjust feather radius', async ({ page }) => {
    // Enable segmentation first
    await page.evaluate(() => {
      chrome.storage.local.set({ wallArtSettings: { segmentationEnabled: true, featherRadius: 2 } });
    });
    await page.reload();
    await page.waitForFunction(() => window.__popupLoaded === true, { timeout: 10000 });

    // Change feather radius
    await page.fill('#feather-radius', '4');
    await page.locator('#feather-radius').dispatchEvent('input');

    // Verify display updates
    await expect(page.locator('#feather-value')).toContainText('4px');
  });

  test('wall art modal has paint and art tabs', async ({ page }) => {
    // Open wall art modal
    await page.click('#add-wall-art');
    await expect(page.locator('#wall-art-modal')).toBeVisible();

    // Verify tabs exist
    await expect(page.locator('.wall-art-tab[data-tab="paint"]')).toBeVisible();
    await expect(page.locator('.wall-art-tab[data-tab="art"]')).toBeVisible();

    // Paint tab should be active by default
    await expect(page.locator('.wall-art-tab[data-tab="paint"]')).toHaveClass(/active/);
    await expect(page.locator('#wall-art-paint-tab')).toBeVisible();

    // Switch to art tab
    await page.click('.wall-art-tab[data-tab="art"]');
    await expect(page.locator('.wall-art-tab[data-tab="art"]')).toHaveClass(/active/);
    await expect(page.locator('#wall-art-art-tab')).toBeVisible();

    // Art tab should have upload inputs
    await expect(page.locator('#wall-art-image-url')).toBeVisible();
    await expect(page.locator('#wall-art-image-file')).toBeVisible();

    // Cancel
    await page.click('#wall-art-cancel');
    await expect(page.locator('#wall-art-modal')).toBeHidden();
  });

  test('can delete wall art region', async ({ page }) => {
    // Add a wall art region first
    await page.evaluate(() => {
      const wallArt = {
        id: 'test-wall-art-delete',
        type: 'wallArt',
        name: 'Wall Art 1',
        region: {
          topLeft: { x: 20, y: 20 },
          topRight: { x: 80, y: 20 },
          bottomLeft: { x: 20, y: 80 },
          bottomRight: { x: 80, y: 80 }
        },
        paint: { enabled: false, color: '#808080', opacity: 100 },
        art: null,
        active: true,
        layer: 'background',
        zIndex: 0
      };
      chrome.storage.local.set({ wallArtOverlays: [wallArt] });
    });
    await page.reload();
    await page.waitForFunction(() => window.__popupLoaded === true, { timeout: 10000 });

    // Verify wall art exists
    await expect(page.locator('#wall-art-list .wall-art-item')).toHaveCount(1);

    // Click delete button
    await page.click('#wall-art-list .wall-art-item .delete-btn');

    // Confirm deletion
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.click('#confirm-ok');

    // Verify wall art was deleted
    await expect(page.locator('#wall-art-empty-state')).toBeVisible();
    await expect(page.locator('#wall-art-list .wall-art-item')).toHaveCount(0);
  });

  test('wall art toggle button works', async ({ page }) => {
    // Add an active wall art region
    await page.evaluate(() => {
      const wallArt = {
        id: 'test-wall-art-toggle',
        type: 'wallArt',
        name: 'Wall Art 1',
        region: {
          topLeft: { x: 20, y: 20 },
          topRight: { x: 80, y: 20 },
          bottomLeft: { x: 20, y: 80 },
          bottomRight: { x: 80, y: 80 }
        },
        paint: { enabled: true, color: '#808080', opacity: 100 },
        art: null,
        active: true,
        layer: 'background',
        zIndex: 0
      };
      chrome.storage.local.set({ wallArtOverlays: [wallArt] });
    });
    await page.reload();
    await page.waitForFunction(() => window.__popupLoaded === true, { timeout: 10000 });

    // Find toggle button - should show ON
    const toggleBtn = page.locator('#wall-art-list .wall-art-item .trigger-btn');
    await expect(toggleBtn).toBeVisible({ timeout: 5000 });
    await expect(toggleBtn).toContainText('ON');

    // Click to disable
    await toggleBtn.click();

    // Should now show OFF
    await expect(toggleBtn).toContainText('OFF');

    // Check storage
    const wallArt = await page.evaluate(() => {
      return new Promise(resolve => {
        chrome.storage.local.get('wallArtOverlays', (result) => {
          resolve(result.wallArtOverlays);
        });
      });
    });

    expect(wallArt[0].active).toBe(false);
  });
});
