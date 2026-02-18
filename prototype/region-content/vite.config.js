import { defineConfig } from 'vite';
import { resolve, join } from 'path';
import { createReadStream, existsSync, statSync } from 'fs';

const projectRoot = resolve(import.meta.dirname, '../..');

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
            res.setHeader('Content-Type', 'image/png');
            createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
  ],
});
