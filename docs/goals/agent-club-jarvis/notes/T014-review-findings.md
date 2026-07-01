# T014: Code Review Findings (adversarial)

Task: `T014`
Kind: `judge` (review)
Status: `current`
Verdict: **not shippable as-is** — 1 blocker + 6 major fix-now; shippable once fix_now lands.

## fix_now (must fix before shipping)

- **F1 (BLOCKER) — src/index.ts:495-502** `setPermissionRequestHandler` returns `callback(true)` for media AND all other permissions on shared `defaultSession` (applies to renderer with webviewTag + the cross-origin multica.ai iframe). Electron default is to DENY, so this is privilege escalation, not a no-op. Fix: grant only `media` for app-origin (file://, app://, http://localhost dev); `callback(false)` otherwise. Also add a matching `setPermissionCheckHandler` (sync getUserMedia checks bypass the request handler).
- **F2 (MAJOR) — src/index.ts:456** header-strip uses `details.url.includes('multica.ai')` → matches `multica.ai.evil.com`. Fix: `const host = new URL(details.url).hostname; const isMultica = host === 'multica.ai' || host.endsWith('.multica.ai')`.
- **F3 (MAJOR) — AgentManagerPage.tsx:49-56 / constants.ts:79** external login iframe, NO `sandbox`. Fix: `sandbox='allow-scripts allow-forms allow-same-origin'`; consider opening login via shell.openExternal instead of framing. (The cross-origin contentWindow read guard is fine — refuted.)
- **F4 (MAJOR) — controlBridge.ts:182-264 / voicePipeline.ts:27** Peekaboo computer-use MCP auto-registers + syncs to Hermes on HUD mount (`active` hardcoded index.tsx:65) BEFORE any spoken command; no per-action confirmation enforced in code. Fix: gate Peekaboo registration behind an explicit user "ENGAGE CONTROL" opt-in toggle; ensure ACP runs Peekaboo tools in prompt-on-every-use mode (never allow_always).
- **F5 (MAJOR) — voicePipeline.ts:266** `update.title !== 'text_to_speech'` exact match; MCP backends often namespace/humanize (`mcp__tts__text_to_speech`, `Text To Speech`). If mismatched, audio never plays → silent fallback. Fix: match `/(^|[_.: ])text_to_speech$/i` or check rawInput param keys regardless of title.
- **F6 (MAJOR) — voicePipeline.ts:267-296** fallback timer (1500ms) only checks `spokeViaToolRef`; if TTS completes after the window, both speechSynthesis AND playTtsFile play (double-speak). Fix: `window.speechSynthesis.cancel()` inside playTtsFile; guard fallback with a per-turn token so a late tool-call suppresses synth.
- **F10 (MAJOR) — voicePipeline.ts:335 (effect deps :348)** `offStreamRef.current = responseStream.on(...)` overwrites the prior unsubscribe without calling it when the effect re-runs → stale listener leak / duplicate transcript+TTS. Fix: call previous unsubscribe before re-subscribing (and null it in cleanup).

## followups (lower priority)

- **F7 — voicePipeline.ts:214** `src.connect(analyserRef.current as AnalyserNode)` non-null assertion can throw if null. Derive analyser from ensureAudioContext() and guard.
- **F8 — voicePipeline STT** uses webkitSpeechRecognition (no getUserMedia), so the media grant is unused by the capture path. NOTE: webkitSpeechRecognition may not work in Electron (Chromium speech endpoint often disabled) — if so, switch STT to getUserMedia + a real STT (Hermes faster-whisper / whisper.cpp). Reconcile media permission with the actual path.
- **F9 — voicePipeline.ts:161-180** rAF level pump runs at ~60fps even when idle (allocates Uint8Array/frame). Only run while `status==='speaking'`.
- **Stale — index.tsx:19** `TODO(jarvis): real Hermes-installed gating deferred` is now implemented in the hooks; remove the stale TODO + the "AionUi" file header.

## Clean (audited)

Component teardown is comprehensive: ReactorCore/RadarSweep rAF cancelled; MiniRadar/SystemVitals/TelemetryLog intervals cleared; MusicButton closes AudioContext; voicePipeline teardown unsubscribes/cancels/aborts/stops/closes. No secrets logged.
