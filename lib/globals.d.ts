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
  }
}
