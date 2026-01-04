import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        Image: 'readonly',
        MediaStream: 'readonly',
        HTMLImageElement: 'readonly',
        FileReader: 'readonly',
        URL: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        atob: 'readonly',
        Uint8Array: 'readonly',
        // Chrome extension globals
        chrome: 'readonly',
        // Canvas globals
        OffscreenCanvas: 'readonly',
        ImageData: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // Allow console for extension debugging
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
    },
  },
  {
    // Test files configuration
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    // Script files run in Node.js
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    // Inject.js runs in page context, not as module
    files: ['inject.js'],
    languageOptions: {
      sourceType: 'script',
    },
  },
  {
    ignores: ['node_modules/**', 'test-results/**'],
  },
];
