# Development Environment: Wall Art Testing Harness

> Standalone development environment with demo videos for rapid iteration on Wall Art feature without requiring Google Meet.

## Summary

To enable fast iteration cycles during Wall Art development, we need a mocked testing environment that closely mirrors the real Google Meet video processing pipeline. Opening actual Meet calls for every code change is too slow—joining, positioning, testing, leaving takes minutes per iteration.

This dev environment provides a standalone HTML page served via Vite with hot module reloading (HMR). It plays pre-recorded demo videos through the actual VideoProcessor code, allowing developers to see changes instantly. The environment includes a mock popup panel, debug tools, and automated visual regression testing.

The key principle is **testing real code, not simulations**. By importing the actual VideoProcessor and popup components (with Chrome API mocks), we ensure the dev environment behavior matches production.

## Requirements

### Must Have

**Core Infrastructure:**
- [ ] Standalone HTML page (no Chrome extension context needed)
- [ ] Vite dev server with hot module reloading (HMR)
- [ ] Import actual production VideoProcessor code
- [ ] Import actual popup React components
- [ ] In-memory Chrome API mocks (storage, runtime messaging)
- [ ] Local TensorFlow.js and MediaPipe model files for offline/fast loading

**Video Playback:**
- [ ] HTMLVideoElement plays demo videos into VideoProcessor pipeline
- [ ] Video resolution: 720p @ 30fps (matches Google Meet)
- [ ] Dropdown selector to switch between test scenarios
- [ ] Looping playback for continuous testing

**Mock Popup Panel:**
- [ ] Side panel/drawer containing actual popup React components
- [ ] Region selection UI (WallArtEditor)
- [ ] Wall paint controls (WallPaintEditor)
- [ ] Art gallery browser (ArtGallery)
- [ ] Setup wizard flow (SetupWizard)

**Debug Tooling:**
- [ ] Segmentation mask overlay toggle (visualize person mask)
- [ ] Real-time FPS counter
- [ ] Model inference timing (ms per frame)
- [ ] Region coordinate inspector (shows exact x,y as you drag)
- [ ] Collapsible debug panel

**Visual Regression:**
- [ ] Automated screenshot comparison against baseline images
- [ ] Capture button to save new baselines
- [ ] Diff highlighting when regression detected

### Should Have

- [ ] Keyboard shortcuts for common actions (toggle mask, capture screenshot)
- [ ] Video playback controls (pause, seek, frame-by-frame)
- [ ] Performance preset simulator (Quality/Balanced/Performance)
- [ ] Console log panel for debugging without DevTools

### Out of Scope

- Testing actual Chrome extension injection/content script loading
- Testing real getUserMedia permissions flow
- Network latency simulation
- Mobile/touch device testing
- Testing against live Google Meet (use real Meet for final verification)

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DEV ENVIRONMENT ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐     ┌──────────────────────────────────────┐   │
│  │  Vite Dev Server │     │         Browser Window               │   │
│  │  (localhost:5173)│────▶│                                      │   │
│  └─────────────────┘     │  ┌─────────────┐  ┌───────────────┐  │   │
│                          │  │ Video Player│  │ Mock Popup    │  │   │
│  ┌─────────────────┐     │  │ (demo.mp4)  │  │ Panel         │  │   │
│  │  Demo Videos    │     │  └──────┬──────┘  │               │  │   │
│  │  /dev-assets/   │     │         │         │ WallArtEditor │  │   │
│  │  - single.mp4   │     │         ▼         │ WallPaintEdit │  │   │
│  │  - empty.mp4    │     │  ┌─────────────┐  │ ArtGallery    │  │   │
│  │  - two-people   │     │  │VideoProcessor│  │ SetupWizard   │  │   │
│  │  - lighting     │     │  │ (actual code)│  └───────────────┘  │   │
│  └─────────────────┘     │  └──────┬──────┘                      │   │
│                          │         │         ┌───────────────┐   │   │
│  ┌─────────────────┐     │         ▼         │ Debug Panel   │   │   │
│  │  Local Models   │     │  ┌─────────────┐  │ - Mask toggle │   │   │
│  │  /models/       │────▶│  │ Output      │  │ - FPS meter   │   │   │
│  │  - mediapipe    │     │  │ Canvas      │  │ - Coordinates │   │   │
│  │  - midas        │     │  └─────────────┘  └───────────────┘   │   │
│  └─────────────────┘     │                                       │   │
│                          └───────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Chrome API Mocks                          │    │
│  │  window.chrome = {                                           │    │
│  │    storage: InMemoryStorage,                                 │    │
│  │    runtime: { sendMessage: MockMessenger }                   │    │
│  │  }                                                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Video Flow (mirrors production)

```
Production:                          Dev Environment:
─────────────────────────────────    ─────────────────────────────────
getUserMedia() → video stream        HTMLVideoElement → demo.mp4
       │                                    │
       ▼                                    ▼
VideoProcessor.render()              VideoProcessor.render()
       │                             (same code!)
       ▼                                    │
Canvas output → Meet                        ▼
                                     Canvas output → preview
```

### Chrome API Mock Implementation

```typescript
// dev/chrome-mock.ts
interface MockStorage {
  data: Record<string, any>;
  get(keys: string[]): Promise<Record<string, any>>;
  set(items: Record<string, any>): Promise<void>;
  onChanged: { addListener: (cb: Function) => void };
}

const createChromeMock = () => ({
  storage: {
    local: createMockStorage(),
    sync: createMockStorage(),
  },
  runtime: {
    sendMessage: async (message: any) => {
      console.log('[Mock] chrome.runtime.sendMessage:', message);
      // Route to mock handlers
      return mockMessageHandler(message);
    },
    onMessage: {
      addListener: (cb: Function) => {
        mockMessageListeners.push(cb);
      }
    }
  }
});

// Inject before any extension code loads
if (typeof window !== 'undefined' && !window.chrome) {
  (window as any).chrome = createChromeMock();
}
```

### Test Scenario Configuration

```typescript
// dev/scenarios.ts
interface TestScenario {
  id: string;
  name: string;
  videoSrc: string;
  description: string;
  // Pre-configured state for this scenario
  initialState?: {
    wallArts?: WallArtOverlay[];
    setupComplete?: boolean;
  };
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'single-person',
    name: 'Single Person',
    videoSrc: '/dev-assets/single-person.mp4',
    description: 'Standard setup: one person at desk'
  },
  {
    id: 'empty-room',
    name: 'Empty Room',
    videoSrc: '/dev-assets/empty-room.mp4',
    description: 'No person - for setup wizard reference frame capture'
  },
  {
    id: 'two-people',
    name: 'Two People',
    videoSrc: '/dev-assets/two-people.mp4',
    description: 'Second person walks through frame'
  },
  {
    id: 'lighting-dark',
    name: 'Lighting Change (Dark)',
    videoSrc: '/dev-assets/lighting-dark.mp4',
    description: 'Simulated dimming for lighting compensation testing'
  },
  {
    id: 'lighting-bright',
    name: 'Lighting Change (Bright)',
    videoSrc: '/dev-assets/lighting-bright.mp4',
    description: 'Simulated brightening for lighting compensation testing'
  }
];
```

### Debug Panel Component

```typescript
// dev/components/DebugPanel.tsx
interface DebugState {
  showMask: boolean;
  fps: number;
  inferenceTime: number;
  regionCoords: WallRegion | null;
}

const DebugPanel: React.FC = () => {
  const [state, setState] = useState<DebugState>({...});

  return (
    <div className="debug-panel">
      <h3>Debug Tools</h3>

      <label>
        <input type="checkbox" checked={state.showMask} onChange={toggleMask} />
        Show Segmentation Mask
      </label>

      <div className="metrics">
        <span>FPS: {state.fps.toFixed(1)}</span>
        <span>Inference: {state.inferenceTime.toFixed(1)}ms</span>
      </div>

      {state.regionCoords && (
        <div className="coords">
          <pre>{JSON.stringify(state.regionCoords, null, 2)}</pre>
        </div>
      )}

      <button onClick={captureBaseline}>Capture Baseline</button>
      <button onClick={compareToBaseline}>Compare to Baseline</button>
    </div>
  );
};
```

### Visual Regression System

```typescript
// dev/visual-regression.ts
import pixelmatch from 'pixelmatch';

class VisualRegression {
  private baselines: Map<string, ImageData> = new Map();

  async captureBaseline(name: string, canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.baselines.set(name, imageData);

    // Save to localStorage for persistence
    localStorage.setItem(`baseline:${name}`, canvas.toDataURL());
  }

  async compare(name: string, canvas: HTMLCanvasElement): Promise<{
    match: boolean;
    diffPixels: number;
    diffImage: ImageData | null;
  }> {
    const baseline = this.baselines.get(name);
    if (!baseline) return { match: false, diffPixels: -1, diffImage: null };

    const ctx = canvas.getContext('2d')!;
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const diff = new ImageData(canvas.width, canvas.height);
    const diffPixels = pixelmatch(
      baseline.data,
      current.data,
      diff.data,
      canvas.width,
      canvas.height,
      { threshold: 0.1 }
    );

    const match = diffPixels < (canvas.width * canvas.height * 0.01); // 1% threshold
    return { match, diffPixels, diffImage: diff };
  }
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `dev/index.html` | Entry point HTML page |
| `dev/main.tsx` | React app entry, mounts dev environment |
| `dev/App.tsx` | Main dev environment layout |
| `dev/chrome-mock.ts` | In-memory Chrome API mocks |
| `dev/scenarios.ts` | Test scenario definitions |
| `dev/components/VideoPlayer.tsx` | Video playback with scenario switching |
| `dev/components/MockPopup.tsx` | Side panel with actual popup components |
| `dev/components/DebugPanel.tsx` | Debug tools UI |
| `dev/components/VisualDiff.tsx` | Visual regression comparison UI |
| `dev/visual-regression.ts` | Screenshot capture and comparison |
| `dev/vite.config.ts` | Vite configuration for dev environment |
| `dev-assets/` | Directory for demo video files |
| `dev-assets/README.md` | Instructions for recording demo videos |

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `dev:wall-art` script, pixelmatch dependency |
| `vite.config.ts` | Add dev environment build target |
| `.gitignore` | Add `dev-assets/*.mp4` (large video files) |

## Video Assets Required

Record these videos in your actual work environment at **720p @ 30fps**:

| File | Duration | Content |
|------|----------|---------|
| `dev-assets/single-person.mp4` | 30-60 sec | You at desk, natural movement (typing, looking around) |
| `dev-assets/empty-room.mp4` | 10 sec | Same camera angle, no person visible |
| `dev-assets/two-people.mp4` | 30 sec | Someone walks behind you or sits next to you |

**Post-processed from single-person.mp4:**

| File | Processing |
|------|------------|
| `dev-assets/lighting-dark.mp4` | Reduce brightness by 30-40% (simulates dimming) |
| `dev-assets/lighting-bright.mp4` | Increase brightness by 30-40% (simulates light turning on) |

### Video Recording Tips

1. **Match your actual Meet setup** - Same desk, chair, background
2. **Natural movement** - Don't sit frozen, move like you would on a real call
3. **Consistent framing** - Keep camera position identical across all clips
4. **Good lighting** - Well-lit for the base clip (easier to darken than brighten)

### Post-Processing Commands (FFmpeg)

```bash
# Create darkened version
ffmpeg -i single-person.mp4 -vf "eq=brightness=-0.15:saturation=1" lighting-dark.mp4

# Create brightened version
ffmpeg -i single-person.mp4 -vf "eq=brightness=0.15:saturation=1" lighting-bright.mp4
```

## Implementation Plan

### Phase 1: Basic Infrastructure

1. Create `dev/` directory structure
2. Set up Vite config with HMR for dev environment
3. Create `chrome-mock.ts` with storage and messaging mocks
4. Create basic `index.html` and `main.tsx` entry points
5. Verify VideoProcessor imports without extension context errors

### Phase 2: Video Playback

1. Create `VideoPlayer.tsx` component
2. Wire HTMLVideoElement to VideoProcessor input
3. Add scenario dropdown selector
4. Implement video looping
5. Record initial demo videos (single-person, empty-room)

### Phase 3: Mock Popup Panel

1. Create `MockPopup.tsx` container
2. Import and render actual WallArtEditor component
3. Import and render WallPaintEditor component
4. Wire up mock Chrome messaging between popup and "content script"
5. Verify region selection works on video preview

### Phase 4: Debug Tooling

1. Create `DebugPanel.tsx` component
2. Add segmentation mask overlay toggle
3. Add FPS counter (requestAnimationFrame timing)
4. Add inference timing measurement
5. Add region coordinate display

### Phase 5: Visual Regression

1. Add pixelmatch dependency
2. Create `visual-regression.ts` system
3. Create UI for capturing baselines
4. Create UI for comparing against baselines
5. Add diff visualization overlay

### Phase 6: Polish

1. Add keyboard shortcuts
2. Add video playback controls (pause, seek)
3. Add scenario-specific initial states
4. Write `dev-assets/README.md` with recording instructions
5. Add npm script `dev:wall-art`

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Video file not found | Show clear error message with recording instructions |
| Model fails to load | Graceful fallback, log detailed error |
| Browser doesn't support required APIs | Check on startup, show compatibility message |
| Video aspect ratio mismatch | Scale to fit, maintain aspect ratio |
| Visual regression baseline missing | Prompt to capture baseline first |

## Testing the Dev Environment Itself

- Verify HMR works (change code, see update without refresh)
- Verify VideoProcessor produces output matching real extension
- Verify mock Chrome storage persists across page reloads (in-memory)
- Verify all popup components render and function
- Verify debug panel metrics are accurate (compare to DevTools)

## Design Decisions Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Standalone page, not fake Meet | Fastest iteration, no extension reload | Fake meet.google.com (triggers injection but complex) |
| Import actual VideoProcessor | Tests real code paths, no mock drift | Simplified standalone copy (drift risk) |
| In-memory Chrome mocks | Controlled test state, injectable | localStorage polyfill (persists, less control) |
| Local model files | Offline, fast, consistent | CDN (matches prod but slower) |
| 720p/30fps video | Matches Meet, realistic perf testing | Lower res (faster but unrealistic) |
| Record own videos | Matches actual environment | Stock videos (more diverse but different setup) |
| Post-process lighting videos | Precise brightness control | Record with lights (harder to get exact curves) |
| Vite with HMR | Instant feedback loop | Simple static server (manual refresh) |
| Automated visual diff | Catches regressions automatically | Manual inspection only (misses subtle changes) |
| Dropdown scenario selector | Easy to switch, discoverable UI | URL routing (bookmarkable but more complex) |

## Success Criteria

- [ ] Dev environment loads in < 3 seconds
- [ ] HMR updates appear in < 500ms
- [ ] VideoProcessor output matches production behavior
- [ ] Can complete full wall art setup flow in dev environment
- [ ] Debug tools show accurate real-time metrics
- [ ] Visual regression catches intentional changes
- [ ] Documented video recording process is easy to follow
