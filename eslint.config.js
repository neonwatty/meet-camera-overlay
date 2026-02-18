import js from '@eslint/js';
import security from 'eslint-plugin-security';

export default [
  js.configs.recommended,
  security.configs.recommended,
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
        // Additional browser globals
        CustomEvent: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        performance: 'readonly',
        HTMLCanvasElement: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'max-len': ['error', {
        code: 120,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
      }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Effects files — slightly higher line limit for cohesive classes
    files: ['prototype/multi-region-art/effects/**/*.js'],
    rules: {
      'max-lines': ['error', { max: 350, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Large legacy files and dev environment — disable max-lines
    // TODO: refactor these lib/ files to be under 300 lines
    files: [
      'prototype/multi-region-art/multi-region.js',
      'popup.js',
      'inject.js',
      'dev/**/*.js',
      'lib/gif-decoder.js',
      'lib/jiggle-compensator.js',
      'lib/overlay-utils.js',
      'lib/wall-region-editor.js',
      'lib/wall-segmentation.js',
    ],
    rules: {
      'max-lines': 'off',
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
    rules: {
      'max-lines': 'off',
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
