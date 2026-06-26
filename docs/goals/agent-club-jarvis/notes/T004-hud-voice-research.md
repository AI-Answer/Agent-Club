# T004: JARVIS HUD + Voice + Music Research

Task: `T004`
Kind: `scout` (external research via Reposeek/OpenSRC/web)
Status: `current`

## Summary

The renderer (React 19 + Vite + UnoCSS + Arco) has **no graphics libs** (no three/d3/canvas/pixi/gsap)
— the HUD is greenfield. OpenJarvis (Tauri/Python, text-only) has **no HUD to copy**. Best HUD fit:
**zumerlab/orbit** (CSS radial rings/gauges) + a custom `<canvas>` radar + UnoCSS, optionally
**arwes** vanilla core for sci-fi frames/bleeps. **CRITICAL VOICE FINDING: Nous Portal is text-only**
(OpenAI-compatible `/v1/chat/completions`, models hermes-4-70b/405b) — **no realtime/TTS audio**.
Voice path = browser SpeechRecognition (STT) → Hermes via Nous → separate TTS (primary OpenAI
`gpt-4o-mini-tts`, fallback browser SpeechSynthesis or local Kokoro). AC/DC master is copyrighted →
use a royalty-free substitute.

## HUD options

- **arwes/arwes** (7.5k★, MIT): React sci-fi framework — animated SVG Frames, Backgrounds, Text reveal, Bleeps (Howler). Caveat: stable v1 targets React 18, alpha, no StrictMode/RSC. For React 19, disable StrictMode in renderer OR vendor the framework-agnostic `@arwes/*` vanilla core.
- **zumerlab/orbit** (`@zumer/orbit`, 751★, MIT): **CSS-only radial UIs** — gauges, rings, arcs, ticks, radars, cockpit instruments. No layout JS. Ideal for glowing concentric rings + vitals gauges. **Recommended primary.**
- **Audio-reactive viz:** wavesurfer.js (10.2k★, BSD-3, permissive) waveforms+spectrogram; audioMotion-analyzer (906★, AGPL-3.0 copyleft — caution); butterchurn (1.85k★, MIT) WebGL milkdrop. Lightest = custom rAF canvas over `AnalyserNode.getByteFrequencyData()`.
- **Radar geometry ref:** zalando/tech-radar (d3 SVG, MIT).
- **Recommendation:** Option B (framework-agnostic): `@zumer/orbit` rings + custom canvas radar + UnoCSS glow utilities, cyan/blue theme (#00e5ff/#0af) + box-shadow glow + backdrop-blur. Avoids React-19 StrictMode conflict.

## Voice (CRITICAL)

- **Nous Portal / inference API** base `https://inference-api.nousresearch.com/v1` is OpenAI-compatible but **text-only**: `/v1/chat/completions`, `/v1/models` (hermes-4-405b / hermes-4-70b). **No** `/v1/audio/speech`, `/v1/audio/transcriptions`, or `/v1/realtime`. Sources: portal.nousresearch.com/api-docs, hermes-agent.nousresearch.com/docs/integrations/nous-portal.
- TTS in Nous ecosystem is via the Hermes Agent **Tool Gateway** (proxies OpenAI TTS / ElevenLabs / Piper / Kokoro) — part of the Hermes agent *runtime*, NOT a REST audio endpoint the renderer can call.
- **Voice pipeline (primary):** renderer `window.SpeechRecognition` (STT, continuous+interim) → POST Hermes `inference-api.nousresearch.com/v1/chat/completions` (Bearer Nous Portal key, model hermes-4-70b) → stream text → synthesize with OpenAI `gpt-4o-mini-tts` (`/v1/audio/speech`, streamed, instructions: calm precise British AI tone) → pipe TTS audio through the SAME AnalyserNode so HUD rings pulse.
- **Fallback (no OpenAI key / offline):** browser `speechSynthesis.speak()` (free, robotic) OR Kokoro-82M ONNX in-browser (eduardolat/kokoro-web, MIT). Keep behind a swappable `TtsService` interface in `src/renderer/services`.
- For fully-local STT, bundle whisper.cpp instead of Chromium SpeechRecognition (which sends audio to Google).

## AC/DC music button

- HTML5 `<audio>` / `new Audio(src)` → `audioCtx.createMediaElementSource → AnalyserNode → destination`; rAF loop reads `getByteFrequencyData()` to drive a canvas ring/spectrum (reuse voice AnalyserNode). Toggle = play()/pause(). Ship clip in `resources/`, reference via app resource path.
- **Licensing:** real AC/DC master (Sony/Columbia/Albert) cannot be bundled. Use royalty-free hard-rock/synth (Pixabay Music CC0, Uppbeat, Epidemic Sound) or an AI-generated JARVIS boot sting. Label button neutrally (power/music glyph), not the AC/DC brand.

## Decisions needed from user

1. HUD foundation: zumer/orbit+custom (recommended) vs arwes.
2. TTS provider: OpenAI gpt-4o-mini-tts (paid key) vs browser SpeechSynthesis (free) vs local Kokoro.
3. AC/DC substitute clip approval or licensed file.
