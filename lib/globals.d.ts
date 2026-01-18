/**
 * Global type declarations for window properties
 * Used by wall art libraries and inject.js
 */

export {};

declare global {
  interface Window {
    // Wall Art libraries
    WallRegion: {
      createDefaultRegion: (x?: number, y?: number, width?: number, height?: number) => any;
      validateRegion: (region: any) => { valid: boolean; errors: string[] };
      regionToPixels: (region: any, canvasWidth: number, canvasHeight: number) => any;
      regionToPercent: (region: any, canvasWidth: number, canvasHeight: number) => any;
      getRegionBounds: (region: any) => any;
      isPointInRegion: (point: any, region: any) => boolean;
      findCornerAtPoint: (point: any, region: any, threshold?: number) => string | null;
      moveCorner: (region: any, corner: string, newPosition: any) => any;
      moveRegion: (region: any, deltaX: number, deltaY: number) => any;
      drawRegion: (ctx: CanvasRenderingContext2D, region: any, canvasWidth: number, canvasHeight: number, options?: any) => void;
      getRegionCenter: (region: any) => any;
      getRegionArea: (region: any) => number;
      createWallArtOverlay: (region: any, options?: any) => any;
    };

    WallPaintRenderer: {
      renderWallPaint: (ctx: CanvasRenderingContext2D, region: any, color: string, options?: any) => void;
      renderWallPaintPerspective: (ctx: CanvasRenderingContext2D, region: any, color: string, options?: any) => void;
      renderAllWallPaint: (ctx: CanvasRenderingContext2D, wallArtOverlays: any[], options?: any) => void;
    };

    WallArtRenderer: {
      renderWallArt: (ctx: CanvasRenderingContext2D, region: any, content: any, options?: any) => void;
      renderAllWallArt: (ctx: CanvasRenderingContext2D, wallArtOverlays: any[], artSources: Map<string, any>, options?: any) => void;
      isVideoSource: (source: any) => boolean;
      isAnimatedImageSource: (source: any) => boolean;
      createVideoLoop: (src: string) => Promise<HTMLVideoElement>;
      renderFilledQuad: (ctx: CanvasRenderingContext2D, region: any, color: string, canvasWidth: number, canvasHeight: number) => void;
    };

    WallSegmentation: {
      SEGMENTATION_PRESETS: any;
      WallArtSegmenter: new (options?: any) => any;
      checkSegmentationSupport: () => { supported: boolean; reason: string | null };
    };

    WallRegionEditor: {
      show: (region: any, callbacks: { onUpdate?: (region: any) => void; onSave?: (region: any) => void; onCancel?: () => void }) => void;
      hide: () => void;
      updateRegion: (region: any) => void;
      isActive: () => boolean;
      getCurrentRegion: () => any | null;
    };

    // GIF decoder (from gif-decoder.js)
    GifDecoder: any;
    AnimatedImage: any;
    isAnimatedGif: (src: string) => boolean;
    decodeGifFromDataUrl: (dataUrl: string) => Promise<any>;
    decodeGifFromUrl: (url: string) => Promise<any>;

    // Performance Monitor (from performance-monitor.js)
    PerformanceMonitor: new () => {
      fps: number;
      segmentationTime: number;
      renderTime: number;
      segmentationQuality: 'good' | 'degraded' | 'poor';
      recordFrame: (timestamp: number) => void;
      recordSegmentationTime: (timeMs: number) => void;
      recordRenderTime: (timeMs: number) => void;
      getAverageFps: () => number;
      getAverageSegmentationTime: () => number;
      getWarnings: () => Array<{ type: string; message: string; severity: string }>;
      getMetrics: () => {
        fps: number;
        avgFps: number;
        segmentationTime: number;
        avgSegmentationTime: number;
        renderTime: number;
        segmentationQuality: string;
        warnings: Array<{ type: string; message: string; severity: string }>;
      };
      reset: () => void;
    };
    PERFORMANCE_THRESHOLDS: {
      FPS_WARNING: number;
      FPS_CRITICAL: number;
      SEGMENT_WARNING: number;
      SEGMENT_CRITICAL: number;
    };
    WARNING_TYPES: {
      FPS_LOW: string;
      FPS_CRITICAL: string;
      SEGMENTATION_SLOW: string;
      SEGMENTATION_CRITICAL: string;
    };

    // Jiggle Compensator (from jiggle-compensator.js)
    JiggleCompensator: {
      new (): {
        features: Array<{ x: number; y: number; response: number }>;
        initialized: boolean;
        enabled: boolean;
        cumulativeTransform: { dx: number; dy: number; scale: number; rotation: number };
        onReset: Function | null;
        initialize: (source: HTMLVideoElement | HTMLCanvasElement, personMask?: ImageData | null) => void;
        process: (source: HTMLVideoElement | HTMLCanvasElement, personMask?: ImageData | null) => { dx: number; dy: number; scale: number; rotation: number };
        reset: () => void;
        setEnabled: (enabled: boolean) => void;
        getStatus: () => {
          initialized: boolean;
          enabled: boolean;
          featureCount: number;
          cumulativeDx: string;
          cumulativeDy: string;
        };
      };
      applyToRegion: (region: any, transform: { dx: number; dy: number; scale: number; rotation: number }) => any;
    };

    // Lighting Detector (from lighting-detector.js)
    LightingDetector: new () => {
      referenceMetrics: { brightness: number; colorTemp: number; contrast: number } | null;
      currentMetrics: { brightness: number; colorTemp: number; contrast: number } | null;
      enabled: boolean;
      initialized: boolean;
      artBrightnessMultiplier: number;
      onLightingChange: Function | null;
      initialize: (source: HTMLVideoElement | HTMLCanvasElement, personMask?: ImageData | null, region?: any) => void;
      process: (source: HTMLVideoElement | HTMLCanvasElement, personMask?: ImageData | null, region?: any) => {
        changed: boolean;
        brightnessDelta: number;
        colorTempDelta: number;
        contrastDelta: number;
        artBrightnessMultiplier: number;
      };
      reset: () => void;
      setEnabled: (enabled: boolean) => void;
      updateReference: () => void;
      getStatus: () => {
        initialized: boolean;
        enabled: boolean;
        referenceMetrics: any;
        currentMetrics: any;
        artBrightnessMultiplier: string;
        cooldownRemaining: number;
      };
    };
    LIGHTING_CONFIG: {
      BRIGHTNESS_THRESHOLD: number;
      COLOR_TEMP_THRESHOLD: number;
      CONTRAST_THRESHOLD: number;
      COOLDOWN_MS: number;
      SAMPLE_GRID_SIZE: number;
      MIN_SAMPLES: number;
      HISTORY_SIZE: number;
      MIN_BRIGHTNESS_MULTIPLIER: number;
      MAX_BRIGHTNESS_MULTIPLIER: number;
    };
  }
}
