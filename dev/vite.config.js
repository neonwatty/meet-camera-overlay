/**
 * Vite configuration for Wall Art Dev Environment.
 * Simplified config that works with npx vite.
 */

export default {
  // Dev environment root is the dev/ directory
  root: '.',

  server: {
    port: 5173,
    open: true
  },

  resolve: {
    alias: {
      '@lib': '../lib',
      '@assets': '../assets'
    }
  }
};
