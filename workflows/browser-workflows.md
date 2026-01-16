# Browser Workflows - Wall Art Dev Environment

> Auto-generated workflow documentation for Wall Art Chrome Extension Dev Environment
> Last updated: 2025-01-15

## Quick Reference

| Workflow | Purpose | Steps |
|----------|---------|-------|
| Enter Dev Environment | Access and verify initial state | 4 |
| Setup Wizard | Test setup wizard modal flow | 6 |
| Video Playback Controls | Test video player functionality | 6 |
| Add Wall Art Region | Create and configure regions | 7 |
| Resize and Move Regions | Drag corner handles and reposition | 5 |
| Configure Wall Paint | Set paint color for region | 8 |
| Use Eyedropper Tool | Sample color from video | 6 |
| Upload Wall Art Content | Add image/GIF/video to region | 7 |
| Enable Segmentation | Activate person detection | 5 |
| Simulate Virtual Background | Test VB detection behavior | 6 |
| Add Image Overlay | Create overlay from URL | 5 |
| Add Text Banner | Create text overlay | 4 |
| Full Wall Art Pipeline | End-to-end wall art setup | 12 |
| Reset State | Clear all configuration | 3 |

---

## Core Workflows

### Workflow: Enter Dev Environment

> Tests accessing the dev environment and verifying initial UI state loads correctly.

**Expected Web Conventions:**
- Page should load without errors
- All panels visible in sidebar
- Video placeholder shown until scenario selected

1. Navigate to the dev environment
   - Open http://localhost:5183/dev/index.html
   - Verify page title shows "Wall Art Dev Environment"
   - Verify header shows "Wall Art Dev Environment" heading

2. Verify sidebar panels are present
   - Verify "Virtual Background" panel is visible
   - Verify "Debug Tools" panel is visible
   - Verify "Wall Art Regions" panel is visible
   - Verify "Wall Paint" panel is visible
   - Verify "Wall Art Content" panel is visible
   - Verify "Overlay Controls" panel is visible

3. Verify scenario dropdown
   - Find the scenario dropdown in header
   - Verify it contains "Demo (Built-in)" option
   - Verify it contains other scenario options

4. Verify initial video state
   - Demo mode should auto-start
   - Canvas should show animated demo content
   - Play/Pause button should show "Play" or be active

---

### Workflow: Setup Wizard

> Tests the setup wizard modal that guides users through background capture and performance benchmarking.

**Expected Web Conventions:**
- Modal should overlay the page with backdrop blur
- Progress steps should be clearly visible
- Buttons should have hover states
- Cancel should close the modal

1. Verify Setup panel exists
   - Find "Setup" panel at top of sidebar
   - Verify "Start Setup Wizard" button is visible
   - Verify status shows "Not configured"

2. Open the setup wizard
   - Click "Start Setup Wizard" button
   - Verify modal appears with backdrop blur
   - Verify "Setup Wizard" title is visible
   - Verify 4 step indicators: Capture, Process, Regions, Confirm

3. Verify Step 1 - Capture
   - Step 1 should be highlighted/active
   - Verify "Capturing Background" heading appears
   - Verify capture progress text shows percentage
   - Verify Cancel and Next buttons are visible

4. Test Cancel functionality
   - Click "Cancel" button
   - Verify modal closes
   - Verify page returns to normal state
   - Verify Setup status still shows "Not configured"

5. Reopen wizard and verify state reset
   - Click "Start Setup Wizard" again
   - Verify modal opens fresh
   - Verify capture restarts from beginning
   - Verify progress resets

6. Verify web platform conventions
   - Verify modal has visible focus ring when tabbing
   - Verify buttons have hover states
   - Verify modal is centered on screen
   - Verify backdrop prevents interaction with background

---

### Workflow: Video Playback Controls

> Tests video playback, seeking, and keyboard controls.

**Prerequisites:**
- Dev environment loaded with demo mode running

1. Test play/pause button
   - Find the "Play" button in video controls
   - Click the Play/Pause button
   - Verify button text toggles between "Play" and "Pause"

2. Test seek bar
   - Find the seek bar slider
   - Drag seek bar to approximately 50%
   - Verify time display updates

3. Test time display format
   - Verify time shows format "m:ss / m:ss"
   - Verify current time updates during playback

4. Test keyboard play/pause
   - Click on the video area to focus
   - Press Space key
   - Verify playback state toggles

5. Test keyboard seeking
   - Press Right Arrow key
   - Verify time advances by ~5 seconds
   - Press Left Arrow key
   - Verify time goes back by ~5 seconds

6. Verify final state
   - Video controls remain responsive
   - Time display is accurate

---

### Workflow: Select Test Scenario

> Tests loading different video scenarios from the dropdown.

1. Open scenario dropdown
   - Find scenario dropdown in header (next to "Reset State" button)
   - Click to open dropdown

2. Select "Demo (Built-in)" scenario
   - Click on "Demo (Built-in)" option
   - Verify video placeholder hides
   - Verify animated demo canvas appears

3. Verify demo mode features
   - Verify gradient background animates
   - Verify simulated person silhouette is visible
   - Verify floating shapes animate
   - Verify "Demo Mode" text is visible at bottom

4. Reset if needed
   - Can select different scenarios if video files exist
   - Demo mode works without any video files

---

## Feature Workflows

### Workflow: Add Wall Art Region

> Tests creating a new wall art region and seeing it on the canvas.

**Expected Web Conventions:**
- Button click should immediately create region
- Region should be visible on canvas
- Region should appear in region list

1. Navigate to Wall Art Regions panel
   - Scroll sidebar to find "Wall Art Regions" panel
   - Verify panel header shows "Wall Art Regions"

2. Add a new region
   - Click the "+ Add Region" button (primary red button)
   - Verify a new region appears on the canvas
   - Verify region shows as red rectangle overlay

3. Verify region in list
   - Look for region entry in panel
   - Should show "Region 1" with dimensions
   - Dimensions shown as percentage (e.g., "20% x 60%")

4. Select the region
   - Click on the region in the canvas area
   - Verify region border becomes highlighted (red/selected)
   - Verify "Selected: Region 1" appears in panel

5. Test aspect ratio dropdown
   - Find aspect ratio dropdown in panel
   - Click to open dropdown
   - Verify options: "Stretch", "Fit (Letterbox)", "Crop (Fill)"
   - Select "Fit (Letterbox)"

6. Add a second region
   - Click "+ Add Region" again
   - Verify second region appears on canvas
   - Verify "Region 2" appears in list
   - Two regions should be visible simultaneously

7. Verify final state
   - Two regions visible on canvas
   - Both listed in region list with dimensions
   - One region can be selected at a time

---

### Workflow: Resize and Move Regions

> Tests dragging region corners to resize and moving entire regions.

**Prerequisites:**
- At least one wall art region exists

1. Select a region
   - Click on a region in the canvas
   - Verify corner handles appear (4 corners)
   - Handles should be visible as small squares

2. Resize by dragging corner
   - Move mouse to top-right corner handle
   - Cursor should change to grab cursor
   - Click and drag corner outward
   - Verify region expands in real-time
   - Release mouse button
   - Verify region maintains new size

3. Drag different corner
   - Drag bottom-left corner inward
   - Verify region shrinks from that corner
   - Verify dimensions update in region list

4. Move entire region
   - Click inside the region (not on a corner)
   - Drag the region to a new position
   - Verify entire region moves together
   - All 4 corners should move proportionally

5. Verify persistence
   - Verify region stays at new position
   - Verify new dimensions shown in region list
   - Region selection persists after resize

---

### Workflow: Delete Wall Art Region

> Tests removing a wall art region.

**Prerequisites:**
- At least one wall art region exists

1. Select region to delete
   - Click on a region in the canvas to select it
   - Verify "Selected: Region X" shows in panel

2. Delete the region
   - Find the "Delete" button in Wall Art Regions panel
   - Button should be enabled (not grayed out)
   - Click "Delete" button

3. Verify deletion
   - Region disappears from canvas
   - Region disappears from region list
   - Delete button becomes disabled (no selection)

---

### Workflow: Configure Wall Paint

> Tests setting wall paint color for a region using color picker.

**Prerequisites:**
- At least one wall art region exists

1. Navigate to Wall Paint panel
   - Scroll sidebar to find "Wall Paint" panel
   - Verify panel header shows "Wall Paint"

2. Select a region
   - Find the region dropdown at top of panel
   - Click dropdown to open
   - Select "Region 1" (or first available region)

3. Enable paint
   - Find "Enable Paint" checkbox
   - Check the checkbox to enable
   - Verify checkbox becomes checked

4. Open color picker
   - Find the color input (square color box)
   - Click on the color input
   - Browser color picker should open

5. Select a color
   - Choose a distinctive color (e.g., bright blue #0088FF)
   - Close the color picker
   - Verify color preview box shows selected color

6. Verify hex code display
   - Hex code should display below color picker
   - Format should be "#RRGGBB"
   - Text color should contrast with background

7. Adjust opacity
   - Find opacity slider
   - Drag slider to approximately 70%
   - Verify opacity value updates

8. Verify visual result
   - Look at the canvas
   - Selected region should show color overlay
   - Person (if visible) should be in front of paint
   - Paint should be semi-transparent per opacity setting

---

### Workflow: Use Eyedropper Tool

> Tests sampling a color from the video using the eyedropper.

**Prerequisites:**
- At least one wall art region exists
- Region selected in Wall Paint panel

1. Enable eyedropper mode
   - Find "Eyedropper" button in Wall Paint panel (has droplet icon)
   - Click the button
   - Verify button shows active/pressed state
   - Verify hint text appears: "Click on the video to sample a color"

2. Observe cursor change
   - Move mouse over video canvas area
   - Cursor should change to crosshair

3. Sample a color
   - Click on a point in the video
   - Should sample the color at that pixel
   - Color picker should update to sampled color

4. Verify color update
   - Color preview box shows sampled color
   - Hex code updates to new value
   - Hint text should disappear

5. Verify eyedropper deactivates
   - Cursor returns to normal
   - Eyedropper button no longer shows active state

6. Verify paint applies
   - If paint is enabled, region shows sampled color
   - Color matches what was clicked

---

### Workflow: Detect Wall Color

> Tests the AI-based dominant wall color detection.

**Prerequisites:**
- At least one wall art region exists
- Region selected in Wall Paint panel

1. Click detect wall button
   - Find "Detect Wall" button in Wall Paint panel (has paint palette icon)
   - Click the button
   - Button may briefly show loading state

2. Wait for detection
   - Detection runs k-means clustering on region
   - Should complete within 1-2 seconds

3. Verify color result
   - Color picker updates to detected dominant color
   - This should be the most common color in the region
   - Usually a wall/background color

4. Apply detected color
   - If paint not enabled, check "Enable Paint"
   - Region should now show detected color
   - Provides baseline for matching room color

---

### Workflow: Upload Wall Art Content

> Tests uploading an image, GIF, or video as wall art content.

**Prerequisites:**
- At least one wall art region exists

1. Navigate to Wall Art Content panel
   - Scroll sidebar to find "Wall Art Content" panel
   - Verify panel header shows "Wall Art Content"

2. Select a region
   - Find the region dropdown at top of panel
   - Click dropdown to open
   - Select "Region 1" (or first available region)

3. Upload an image file
   - Find the file input in the panel
   - Click "Choose File" or the file input
   - [MANUAL] Select an image file from your computer
   - Supported: PNG, JPG, GIF, MP4, WebM

4. Verify upload success
   - Source info should show file type (e.g., "Image loaded")
   - Preview section should show uploaded image
   - Preview displayed below file input

5. Enable art display
   - Find "Enable Art" checkbox
   - Check the checkbox to enable
   - Verify checkbox becomes checked

6. Configure display options
   - Adjust opacity slider (try 80%)
   - Select aspect ratio mode from dropdown
   - Options: "Stretch", "Fit (letterbox)", "Crop (fill)"

7. Verify visual result on canvas
   - Look at the canvas
   - Image should appear in the selected region
   - Image should use perspective transform to fit region corners
   - Person (if visible and segmentation enabled) should appear in front

---

### Workflow: Clear Wall Art Content

> Tests removing uploaded content from a region.

**Prerequisites:**
- Wall art content uploaded to a region

1. Select region with content
   - In Wall Art Content panel, select the region with content
   - Verify preview shows the current content

2. Clear the content
   - Click "Clear" button
   - Content should be removed

3. Verify cleared state
   - Preview shows "No art selected" placeholder
   - Source info clears
   - Canvas no longer shows content in that region

---

### Workflow: Enable Segmentation

> Tests enabling person segmentation (ML-based person detection).

**Expected Web Conventions:**
- Loading state should be visible during model initialization
- Status indicators should update in real-time
- Performance metrics should display

1. Navigate to Debug Tools panel
   - Scroll sidebar to find "Debug Tools" panel
   - Verify panel shows FPS and other metrics

2. Enable segmentation
   - Find "Enable Segmentation" button
   - Click the button
   - Button text should change to show loading/enabled state

3. Wait for model initialization
   - Status indicator may show "Loading..." (orange)
   - MediaPipe model downloads in background
   - Wait for status to show "Active" (green)

4. Verify segmentation active
   - Status dot should be green
   - Status text shows preset name
   - Segmentation time metric should show values (e.g., "2.3ms")

5. Test mask visualization
   - Find "Show Segmentation Mask" checkbox
   - Check the checkbox
   - Canvas should show magenta overlay where person is detected
   - Mask updates in real-time

---

### Workflow: Change Segmentation Preset

> Tests switching between segmentation quality presets.

**Prerequisites:**
- Segmentation must be enabled first

1. Find preset dropdown
   - In Debug Tools panel, find segmentation preset dropdown
   - Current preset shown in dropdown

2. Select different preset
   - Click dropdown to open
   - Options: "quality", "balanced", "performance"
   - Select "performance" for faster processing

3. Verify preset change
   - Status text updates to show new preset
   - Segmentation time may change (performance is faster but less accurate)
   - Mask may update less frequently with performance preset

---

### Workflow: Simulate Virtual Background

> Tests the virtual background detection simulation and its effect on wall art.

**Prerequisites:**
- At least one active wall art region

1. Navigate to Virtual Background panel
   - Find "Virtual Background" panel at top of sidebar
   - Verify status shows "Not detected" initially

2. Enable simulation
   - Find "Simulate Virtual Background Enabled" checkbox
   - Check the checkbox

3. Verify status update
   - Status dot should change to orange (active)
   - Status text should show "Active (blur)"
   - Warning box should appear below

4. Read warning message
   - Warning should explain wall art is disabled
   - Message mentions Meet's virtual background
   - Hint suggests disabling Meet's VB

5. Select VB type
   - Find type dropdown (should be enabled now)
   - Options: "Blur", "Background Image"
   - Select "Background Image"
   - Status should update to "Active (image)"

6. Verify wall art disabled
   - Wall art regions should be automatically disabled
   - Content should not render on canvas while VB active
   - Wall paint should also be disabled

7. Disable simulation
   - Uncheck "Simulate Virtual Background Enabled"
   - Status returns to "Not detected"
   - Warning disappears
   - Wall art should re-enable automatically

---

### Workflow: Add Image Overlay

> Tests adding an image overlay from URL.

1. Navigate to Overlay Controls panel
   - Find "Overlay Controls" panel in sidebar
   - Verify panel header shows "Overlay Controls"

2. Click add image button
   - Find "+ Image" button (primary red button)
   - Click the button
   - Modal should appear for image URL input

3. Enter image URL
   - In the modal, find the URL input field
   - Enter a valid image URL or data URL
   - Example: Use a placeholder image URL

4. Add the overlay
   - Click "Add" button in modal
   - Modal should close
   - New overlay item should appear in list

5. Verify overlay in list
   - Overlay shows in list with thumbnail
   - Type indicator shows "image"
   - Toggle button shows ON/OFF state
   - Opacity slider is visible
   - Delete (X) button is available

---

### Workflow: Add Text Banner

> Tests adding a text banner overlay.

1. Click add text button
   - Find "+ Text" button in Overlay Controls panel
   - Click the button
   - No modal needed - creates immediately

2. Verify text overlay created
   - New "Text Banner" item appears in list
   - Shows default sample text content
   - Positioned at "Lower Third" by default

3. Verify on canvas
   - Text banner should be visible on canvas
   - Shows rounded background with text
   - Positioned at lower portion of video

4. Toggle overlay
   - Click ON/OFF toggle for the text overlay
   - Text should disappear from canvas when OFF
   - Click again to re-enable

---

### Workflow: Add Timer Overlay

> Tests adding a countdown timer overlay.

1. Click add timer button
   - Find "+ Timer" button in Overlay Controls panel
   - Click the button
   - Creates timer immediately

2. Verify timer created
   - New "Timer" item appears in list
   - Shows countdown format (e.g., "5:00")
   - Default 5-minute countdown

3. Verify timer on canvas
   - Timer display visible on canvas
   - Shows remaining time
   - Updates in real-time

4. Test opacity adjustment
   - Find opacity slider for timer overlay
   - Drag slider to 50%
   - Timer should become semi-transparent

---

### Workflow: Delete Overlay

> Tests removing an overlay.

**Prerequisites:**
- At least one overlay exists

1. Find overlay to delete
   - Locate the overlay in the list
   - Find the "X" button on right side of overlay item

2. Click delete
   - Click the "X" button
   - Overlay should be removed from list

3. Verify removal
   - Overlay no longer in list
   - Overlay no longer visible on canvas

---

## Integration Workflows

### Workflow: Full Wall Art Pipeline

> Tests complete end-to-end wall art setup with regions, paint, content, and segmentation.

1. Start with clean state
   - Click "Reset State" button in header
   - Verify all overlays and regions cleared

2. Add a wall art region
   - Click "+ Add Region" in Wall Art Regions panel
   - Region appears on canvas

3. Resize region for wall area
   - Drag corners to cover a wall area in the video
   - Position region behind where person would be

4. Enable segmentation
   - In Debug Tools, click "Enable Segmentation"
   - Wait for model to initialize
   - Verify status shows "Active"

5. Configure wall paint
   - In Wall Paint panel, select "Region 1"
   - Click "Detect Wall" to get base color
   - Enable paint checkbox
   - Adjust opacity to 50%

6. Verify paint with segmentation
   - Paint should appear in region
   - Person should occlude paint (appear in front)

7. Upload wall art content
   - In Wall Art Content panel, select "Region 1"
   - Upload an image file
   - Enable art checkbox

8. Verify art replaces paint
   - Image should display in region with perspective
   - Person still occludes the image
   - Image fits region using selected aspect ratio mode

9. Adjust art opacity
   - Drag opacity slider to see effect
   - Lower opacity shows video through art

10. Toggle region active state
    - Disable "Enable Art" checkbox
    - Art disappears, paint may show if enabled
    - Re-enable to show art again

11. Add overlay for comparison
    - Add "+ Image" overlay
    - Position overlay (always on top of everything)
    - Verify overlay appears above segmentation

12. Verify final state
    - Wall art renders with perspective in region
    - Person detected and occludes wall art
    - Overlays render on top
    - All features work together

---

### Workflow: Reset State

> Tests clearing all configuration to start fresh.

1. Click reset button
   - Find "Reset State" button in header (gray secondary button)
   - Click the button

2. Verify reset
   - All overlays should be cleared
   - All wall art regions should be cleared
   - Overlay Controls panel shows empty state
   - Wall Art Regions panel shows empty state

3. Verify ready for new configuration
   - Can add new regions
   - Can add new overlays
   - Video continues playing (if was playing)

---

## Edge Case Workflows

### Workflow: Empty Region List

> Tests behavior when no regions exist.

1. Ensure no regions exist
   - Delete all regions or reset state

2. Check Wall Paint panel
   - Region dropdown should show "Select region..."
   - Paint controls should be disabled
   - Cannot use eyedropper or detect wall

3. Check Wall Art Content panel
   - Region dropdown should show "Select region..."
   - File input should be disabled
   - Cannot upload content without region

4. Verify graceful handling
   - No errors in console
   - Clear indication that regions needed first

---

### Workflow: Drag and Drop Video File

> Tests loading a custom video via drag and drop.

1. Prepare a video file
   - Have an MP4 or WebM file ready
   - Recommended: 720p @ 30fps

2. Drag file over video area
   - Drag video file from file browser
   - Hold over the video container
   - Container should show drag-over state (dashed outline)

3. Drop the file
   - Release mouse to drop file
   - Video should load and begin playing
   - Placeholder should hide

4. Verify video loaded
   - Custom video plays in canvas
   - All features work with custom video
   - Segmentation detects person in custom video

---

### Workflow: Debug Panel Metrics

> Tests debug visualization and performance monitoring.

1. Enable FPS counter
   - Check "Show FPS Counter" checkbox
   - FPS value should display (green text)
   - Value updates every second

2. Enable segmentation for metrics
   - Click "Enable Segmentation"
   - Segmentation time metric should populate
   - Shows milliseconds per frame

3. Check render time
   - Render time shows in metrics area
   - Indicates time to draw each frame
   - Should be under 16ms for 60fps

4. Enable mask visualization
   - Check "Show Segmentation Mask"
   - Magenta overlay shows detected person area
   - Updates in real-time with person movement

5. Disable debug overlays
   - Uncheck "Show FPS Counter"
   - Uncheck "Show Segmentation Mask"
   - Canvas shows clean output

---

## Web Platform Convention Checks

For each workflow, verify these web conventions:

### Navigation
- All interactive elements work with mouse clicks
- No gesture-only navigation required
- Page state reflected in UI (selected items highlighted)

### Interaction
- All buttons have visible hover states
- Focus indicators visible when tabbing
- Click targets are appropriately sized

### Visual
- Layout works at various viewport widths
- Sidebar scrollable if content overflows
- No content cut off or hidden unexpectedly

### Accessibility
- Form labels associated with inputs
- Color not only indicator of state (icons/text also used)
- Status messages are text-based (not color-only)
