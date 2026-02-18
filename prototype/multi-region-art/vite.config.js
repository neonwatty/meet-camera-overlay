import { defineConfig } from 'vite';
import { resolve, join, extname } from 'path';
import { createReadStream, existsSync, statSync } from 'fs';

const projectRoot = resolve(import.meta.dirname, '../..');

const MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

export default defineConfig({
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
  plugins: [
    {
      name: 'serve-project-assets',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/assets/')) return next();
          const filePath = join(projectRoot, req.url);
          if (existsSync(filePath) && statSync(filePath).isFile()) {
            const mime = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
            res.setHeader('Content-Type', mime);
            createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
  ],
});
