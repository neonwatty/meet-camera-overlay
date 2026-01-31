# SAM Web Deployment Research

## Summary

After researching available options for running Segment Anything Model in the browser, **Transformers.js + SlimSAM** emerges as the recommended approach for our use case.

---

## Options Evaluated

### 1. Transformers.js + SlimSAM (RECOMMENDED)

**What it is:** SlimSAM is a compressed version of SAM that reduces the model from 637M to 5.5M parameters (100x+ compression) while maintaining good segmentation quality.

**Key Stats:**
- Parameters: 5.5M (vs 637M original) - **1.4% of original**
- MACs: 23G (vs 2866G original) - **0.8% of original**
- Training data needed: Only 0.1% of SAM training data
- Runs 100% client-side, no server required

**Resources:**
- Demo: [segment-anything-web](https://huggingface.co/spaces/Xenova/segment-anything-web)
- Model: `Xenova/slimsam-77-uniform`
- npm: `@xenova/transformers` (v2.14+)

**Example Code:**
```javascript
import { SamModel, AutoProcessor, RawImage } from '@xenova/transformers';

const model = await SamModel.from_pretrained('Xenova/slimsam-77-uniform');
const processor = await AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform');

// Load image
const img = await RawImage.read('image.jpg');
const inputs = await processor(img);

// Generate image embeddings
const { image_embeddings } = await model.get_image_embeddings(inputs);

// Segment with point prompt
const points = [[450, 600]];  // [x, y] coordinates
const labels = [1];  // 1 = foreground, 0 = background

const { pred_masks } = await model({
  ...inputs,
  image_embeddings,
  input_points: [points],
  input_labels: [labels],
});
```

**Pros:**
- Smallest model size, fastest inference
- Works in all modern browsers (WASM backend)
- Well-documented with working demos
- npm package with good API
- 100% client-side processing

**Cons:**
- Slightly lower quality than full SAM (but still good)
- No SAM2 support yet in Transformers.js

---

### 2. WebGPU SAM2

**What it is:** Full SAM2 running in browser via WebGPU and ONNX Runtime.

**Project:** [webgpu-sam2](https://github.com/lucasgelfond/webgpu-sam2)

**Key Stats:**
- Decoder size: ~20MB each
- Encoder size: >100MB
- Fixed input: 1024x1024 pixels
- Output masks: 256x256 pixels

**Requirements:**
- WebGPU support required (Chrome/Edge, experimental in others)
- Models cached in browser storage (up to 2GB)

**Pros:**
- Full SAM2 quality
- GPU acceleration via WebGPU
- Supports video segmentation

**Cons:**
- Large model download (100MB+)
- WebGPU not universally supported
- More complex setup
- Experimental ONNX Runtime builds needed

---

### 3. MobileSAM in Browser

**Project:** [MobileSAM-in-the-Browser](https://github.com/akbartus/MobileSAM-in-the-Browser)

**What it is:** MobileSAM (lighter than SAM but heavier than SlimSAM) running via ONNX Runtime Web.

**Notes:**
- Requires ONNX Runtime Web 1.14.0 specifically
- Newer versions have compatibility issues
- Less documentation than Transformers.js approach

**Pros:**
- Better quality than SlimSAM
- Proven to work in browser

**Cons:**
- Pinned to old ONNX Runtime version
- Less active development
- Larger than SlimSAM

---

### 4. @antv/sam (SAMJS)

**npm:** `@antv/sam`

**Demo:** http://samjs.antv.vision/demos

**Features:**
- WASM with multi-threading (SharedArrayBuffer, Web Worker, SIMD128)
- Framework support (React/Vue/Angular)
- GeoJSON export for mapping applications

**Pros:**
- Good for GIS/mapping use cases
- Multi-threaded performance

**Cons:**
- Less documentation
- Primarily focused on remote sensing
- Requires SharedArrayBuffer (needs specific headers)

---

### 5. API-Based (Replicate)

**Service:** [Replicate SAM API](https://replicate.com/meta/sam-2)

**Pricing:** ~$0.0016 per run (~625 runs per $1)

**Latency:** 2-3 seconds per segmentation

**Pros:**
- No client-side model loading
- Full quality SAM/SAM2
- Simple to integrate

**Cons:**
- Requires internet connection
- Per-request cost
- 2-3 second latency per click (not suitable for real-time)
- Privacy concerns (images sent to server)

---

## Recommendation

**Use Transformers.js + SlimSAM** for the following reasons:

1. **Size**: At 5.5M parameters, it's practical for browser download
2. **Speed**: Fast enough for interactive use
3. **Simplicity**: Well-documented npm package with good API
4. **Privacy**: 100% client-side, no data leaves the browser
5. **Compatibility**: Works in all modern browsers via WASM
6. **Proven**: Working demo exists that we can reference

**Implementation approach:**
1. Use `@xenova/transformers` npm package (or CDN)
2. Load `Xenova/slimsam-77-uniform` model
3. Capture frame from webcam
4. Compute image embeddings once per frame
5. On user click, run decoder with point prompt
6. Convert mask to usable format for compositing

---

## Performance Expectations

Based on the existing demos and documentation:

| Operation | Expected Time | Notes |
|-----------|--------------|-------|
| Model load (first time) | 5-10 seconds | Cached after first load |
| Image embedding | 500ms-2s | Run once per captured frame |
| Point-to-mask decode | 50-200ms | Run on each click |

These times are estimates for a typical laptop. WebGPU (when available) would improve these significantly.

---

## Next Steps

1. Create proof-of-concept playground using Transformers.js + SlimSAM
2. Verify performance on target hardware
3. Test click-to-segment workflow
4. Evaluate mask quality for our use case

---

## Sources

- [Transformers.js SAM announcement](https://huggingface.co/posts/Xenova/240458016943176)
- [SlimSAM GitHub](https://github.com/czg1225/SlimSAM)
- [WebGPU SAM2](https://github.com/lucasgelfond/webgpu-sam2)
- [MobileSAM in Browser](https://github.com/akbartus/MobileSAM-in-the-Browser)
- [SAM2 Browser Tutorial](https://medium.com/@geronimo7/in-browser-image-segmentation-with-segment-anything-model-2-c72680170d92)
- [Replicate SAM API](https://replicate.com/meta/sam-2)
