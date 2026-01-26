import { defineConfig } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(process.cwd());
const testVideoPath = path.resolve(process.cwd(), 'tests/fixtures/videos/test-background.y4m');

export default defineConfig({
  testDir: './tests/integration',
  timeout: 30000,
  retries: 0,
  workers: 1, // Sequential testing for consistency

  use: {
    browserName: 'chromium',
    headless: true, // Run headless with mocked Chrome APIs
    viewport: { width: 1280, height: 720 },

    // Record video of tests for visual verification
    video: 'on',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Grant camera permissions
    permissions: ['camera'],

    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream', // Use fake camera
        '--use-fake-ui-for-media-stream', // Auto-accept camera prompts
        `--use-file-for-fake-video-capture=${testVideoPath}`, // Use custom test video
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

  // Web server for serving test fixtures AND extension files
  webServer: {
    command: `node -e "
      const http = require('http');
      const fs = require('fs');
      const path = require('path');

      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.y4m': 'video/x-raw-yuv',
      };

      const server = http.createServer((req, res) => {
        let filePath;
        const url = req.url.split('?')[0];

        if (url.startsWith('/extension/')) {
          // Serve extension files from project root
          filePath = path.join('${extensionPath.replace(/\\/g, '\\\\')}', url.replace('/extension/', ''));
        } else {
          // Serve test fixtures
          filePath = path.join('${extensionPath.replace(/\\/g, '\\\\')}', 'tests/fixtures', url === '/' ? 'mock-meet.html' : url);
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not Found: ' + filePath);
            return;
          }
          const ext = path.extname(filePath);
          const mimeType = mimeTypes[ext] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mimeType });
          res.end(data);
        });
      });

      server.listen(8080, () => console.log('Test server running on http://localhost:8080'));
    "`,
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
});
