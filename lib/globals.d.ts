/**
 * Global type declarations for window properties used by the extension.
 * These classes are attached to window for use in the inject.js context.
 */

interface Window {
  // Allow any property to be attached to window
  // This is needed because the extension attaches various classes to window
  // for use in the inject.js context
  [key: string]: unknown;
}
