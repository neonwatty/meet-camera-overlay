# Dev Assets

This directory contains video files for the Wall Art dev environment.

**Note:** Video files are gitignored due to their large size. Each developer should record their own videos matching their actual setup.

## Required Videos

Record these videos at **720p @ 30fps** in your actual work environment:

| File | Duration | Description |
|------|----------|-------------|
| `single-person.mp4` | 30-60 sec | You at your desk with natural movement (typing, looking around) |
| `empty-room.mp4` | 10 sec | Same camera angle, but step away so no person is visible |
| `two-people.mp4` | 30 sec | Someone walks behind you or sits next to you |

## Post-Processing (Optional)

Create lighting variants from `single-person.mp4`:

```bash
# Create darkened version (simulates dimming lights)
ffmpeg -i single-person.mp4 -vf "eq=brightness=-0.15:saturation=1" lighting-dark.mp4

# Create brightened version (simulates light turning on)
ffmpeg -i single-person.mp4 -vf "eq=brightness=0.15:saturation=1" lighting-bright.mp4
```

## Recording Tips

1. **Match your actual Meet setup** - Same desk, chair, background you use for calls
2. **Natural movement** - Don't sit frozen, move like you would on a real call
3. **Consistent framing** - Keep camera position identical across all clips
4. **Good lighting** - Well-lit for the base clip (easier to darken than brighten)
5. **Loop-friendly** - Try to end in a similar position as you started

## Using the Dev Environment

1. Record your videos and place them in this directory
2. Run `npm run dev:wall-art` from the project root
3. Select a scenario from the dropdown, or drag-and-drop a video file
4. The demo mode works without any video files (animated placeholder)

## File Format

- **Format:** MP4 (H.264) or WebM
- **Resolution:** 1280x720 (720p) recommended
- **Frame rate:** 30 FPS
- **Audio:** Not needed (will be muted)
