import { defineConfig } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(process.cwd());
const testVideoPath = path.resolve(process.cwd(), 'tests/fixtures/videos/test-background.y4m');

export default defineConfig({
  testDir: './tests/integration',
  timeout: 30000,
  retries: 0,
  workers: 1, // Extensions require sequential testing

  use: {
    // Use Chrome with extension
    browserName: 'chromium',
    headless: false, // Extensions don't work in headless mode
    viewport: { width: 1280, height: 720 },

    // Record video of tests for visual verification
    video: 'on',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Grant camera permissions
    permissions: ['camera'],

    // Use persistent context for extension loading
    launchOptions: {
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--use-fake-device-for-media-stream', // Use fake camera in CI
        '--use-fake-ui-for-media-stream', // Auto-accept camera prompts
        `--use-file-for-fake-video-capture=${testVideoPath}`, // Use custom test video
        // WebGL support for headless canvas rendering
        '--enable-webgl',
        '--use-gl=swiftshader',
      ],
    },
  },

  projects: [
    {
      name: 'extension-tests',
      testMatch: '**/*.test.js',
    },
  ],

  // Web server for serving test fixtures and extension files
  webServer: {
    command: 'python3 -m http.server 8080',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
});
