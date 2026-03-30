# Audio Reactive Visualizer

A compact, static web visualizer using p5.js and p5.sound. This is a browser adaptation of an original Processing sketch that focuses on audio-reactive visuals while staying simple to deploy.

## Stack
- HTML, CSS, JavaScript
- p5.js and p5.sound via CDN

## Key Features
- Fullscreen canvas optimized for browser performance
- Central circle that contracts on detected peaks
- Radial lines driven by the audio waveform
- Loose, rotating particles that respond to audio level
- Player-driven playback and Space pause/resume

## Controls
- **Play / Pause:** Use the player's Play/Pause button (or press Space) to start or pause audio. A user interaction is required by browsers to unlock audio.
- **Source:** Two always-visible source options are shown in the player: **Demo Track** (bundled) and **Choose Track**. `Demo Track` selects the bundled track. `Choose Track` opens the file picker to select a local file; if a local file is already loaded, `Choose Track` switches to that local file without reopening the picker. Use the **Replace Track** button to replace the current local file. The player displays `Playing: ...` to indicate the active source (either `Demo Track` or the local filename without its extension).
- **Restart:** Icon-based Restart button — when Loop is On, Restart jumps to the loop start; when Loop is Off, Restart jumps to 0.
- **Volume:** A compact speaker icon toggles mute/unmute. Hover the volume area on desktop to reveal the horizontal slider inline. Clicking the speaker icon reveals the slider temporarily on touch; the slider restores a sensible previous volume when unmuting.
- **Timeline / Seek / Time:** The wide timeline is the primary seek control. Drag or click the seek bar to move playback; the time display shows current / total time.
- **Loop:** Toggle Loop On to enable two draggable markers and a highlighted loop region. You can drag individual start/end markers or drag the entire highlighted loop region to reposition it while preserving its duration. Loop Off disables the region. The loop control is an icon button whose active state is indicated visually.
- **Player visibility:** The player is visible on load; clicking outside closes it and clicking the page reopens it.


## Running Locally
Serve the folder with a simple static server and open it in your browser:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` in your browser. The demo song is included with the site; to test with your own audio, use the player’s **Choose Track** control. Note: browsers require a user interaction (click/tap) before audio playback will start.

## Deployment
- Ready for GitHub Pages, Netlify, or Vercel — publish the repository as a static site.

## Notes
- The audio analysis is tied to the loaded `song` (FFT and Amplitude inputs bound to the file).
- No build step or bundler required.
- Includes `favicon.ico` at the project root.
