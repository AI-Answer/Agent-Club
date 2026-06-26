# T016: Hermes Voice Mode integration

Task: `T016`
Kind: `scout` (research, source-verified against local Hermes v0.13.0 at ~/.hermes/hermes-agent)
Status: `current`

## Summary

Hermes's interactive "voice mode" (`/voice on` + Ctrl+B) is **TTY-only** (classic `hermes`/`--tui`) and
Discord/Telegram gateway-only. There is **no `hermes voice` command, no voice websocket/HTTP endpoint,
and no ACP audio** (`hermes acp` is text-only; ACP content = text/image). HOWEVER Hermes's own TTS is
exposed as a normal **agent tool `text_to_speech`** (toolset `tts`) that synthesizes with Hermes's
configured provider, writes an audio file, and returns `{success, file_path, media_tag, provider}`.
That tool is the real seam: keep Hermes as brain AND voice, no third-party TTS.

## Integration recipe for T010 (Electron)

1. **Mic capture** (renderer): `navigator.mediaDevices.getUserMedia({audio:true})` → STT. STT options that keep Hermes as brain: app-side (Web Speech API / whisper.cpp) OR Hermes's own `stt.provider: local` (faster-whisper, ~150MB, no key). Send the transcript as a normal ACP `session/prompt` text message via the existing `AcpConnection`/`acpConversationBridge`.
2. **Hermes speaks in its own voice:** ensure the `tts` toolset is enabled (`hermes tools enable tts`, or set in the spawn env). Add a session instruction: *"For every reply, also call the `text_to_speech` tool with your reply text and `output_path` under <jarvis audio dir>."* Hermes emits a `tool_call` ACP update for `text_to_speech`; the tool result JSON carries `file_path`. Main process watches that `ToolCallUpdate` (already in `acpTypes.ts`) and reads `file_path`.
3. **Play audio** (renderer): `file_path` → `AudioContext.decodeAudioData` → `AudioBufferSourceNode` → destination.
4. **Pulse the HUD:** insert `AnalyserNode` between source and destination; drive ring scale from `getByteFrequencyData()` in rAF.

## Providers / config (local `~/.hermes/config.yaml`)

- Default `tts.provider: edge` (Edge TTS, `en-US-AriaNeural`, FREE, no key; needs `ffmpeg`).
- Polished "JARVIS" voice = OpenAI TTS (`gpt-4o-mini-tts`) via the **Nous Tool Gateway** (`use_gateway: true` + paid Nous Portal subscription, env `TOOL_GATEWAY_USER_TOKEN` via `hermes setup --portal`) — no separate OpenAI key needed.
- Also configurable: ElevenLabs/xAI/Mistral/Piper/NeuTTS, or a custom `command`-type provider.

## Required runtime / credentials

- Running `hermes acp` (app already spawns it). Hermes v0.13.0 present; `hermes` on PATH.
- TTS toolset `tts` must be ENABLED (ships disabled; scout enabled it on this machine). T010 should enable it in the spawn env.
- Edge TTS path: just `ffmpeg`. Gateway/OpenAI voice: paid Nous Portal subscription (or bring an OpenAI/ElevenLabs key).
- macOS mic permission for the Electron app (`NSMicrophoneUsageDescription`).

## Blockers / caveats

- No headless programmatic voice loop; audio must move as files (the `text_to_speech` `file_path`), not over ACP.
- TTS is non-streaming (whole file per reply) → reply-then-speak, not word-by-word.
- Sources: hermes-agent.nousresearch.com/docs (voice-mode, tts, tool-gateway), github.com/NousResearch/hermes-agent, local `~/.hermes/hermes-agent/tools/tts_tool.py`.

## Fallback (still Hermes's voice)

Invoke Hermes TTS out-of-band after each ACP reply: a tiny Python shim importing `tools.tts_tool.text_to_speech_tool(text, output_path)` → returns `file_path`. Last-resort only: app-side edge/Piper/Web-Speech TTS (no longer "Hermes's voice").
