/**
 * Test scenario definitions for Wall Art dev environment.
 * Each scenario defines a video file and optional initial state.
 */

export const TEST_SCENARIOS = [
  {
    id: 'single-person',
    name: 'Single Person',
    videoSrc: '/dev-assets/single-person.mp4',
    description: 'Standard setup: one person at desk with natural movement',
    initialState: {
      overlays: []
    }
  },
  {
    id: 'empty-room',
    name: 'Empty Room',
    videoSrc: '/dev-assets/empty-room.mp4',
    description: 'No person visible - for reference frame capture testing',
    initialState: {
      overlays: []
    }
  },
  {
    id: 'two-people',
    name: 'Two People',
    videoSrc: '/dev-assets/two-people.mp4',
    description: 'Second person walks through frame - multi-person testing',
    initialState: {
      overlays: []
    }
  },
  {
    id: 'lighting-dark',
    name: 'Lighting (Dark)',
    videoSrc: '/dev-assets/lighting-dark.mp4',
    description: 'Simulated dimming for lighting compensation testing',
    initialState: {
      overlays: []
    }
  },
  {
    id: 'lighting-bright',
    name: 'Lighting (Bright)',
    videoSrc: '/dev-assets/lighting-bright.mp4',
    description: 'Simulated brightening for lighting compensation testing',
    initialState: {
      overlays: []
    }
  },
  {
    id: 'demo-placeholder',
    name: 'Demo (Built-in)',
    videoSrc: null, // Will use canvas-based demo
    description: 'Built-in animated demo - no video file required',
    initialState: {
      overlays: []
    }
  }
];

/**
 * Get scenario by ID.
 */
export function getScenario(id) {
  return TEST_SCENARIOS.find(s => s.id === id);
}

/**
 * Get scenarios that have video files available.
 */
export function getAvailableScenarios() {
  return TEST_SCENARIOS.filter(s => s.videoSrc !== null);
}
