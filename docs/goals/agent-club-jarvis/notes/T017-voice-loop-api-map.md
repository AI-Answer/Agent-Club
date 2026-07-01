# T017: Voice-loop IPC map (for T010)

Task: `T017`
Kind: `scout`
Status: `current`

## Verdict

The Jarvis voice loop is **renderer-only**, reusing the existing ACP chat IPC. The only process gap
(enabling Hermes's `tts` toolset) is already resolved: T016 ran `hermes tools enable tts` (persisted
in `~/.hermes`), so `text_to_speech` is exposed. Build a SpeechSynthesis fallback for robustness.

## The 4 APIs (all renderer-callable)

1. **Create conversation:** `ipcBridge.conversation.create.invoke({ type: 'acp', model, extra: { backend: 'hermes', presetContext, cliPath? } })` → conversation_id. (ipcBridge.ts:95; params :1098-1158)
2. **Send text:** `ipcBridge.acpConversation.sendMessage.invoke({ input, msg_id: uuid(), conversation_id, files? })`. (ipcBridge.ts:607 → :112; ISendMessageParams :1080-1088)
3. **Receive stream:** `const off = ipcBridge.acpConversation.responseStream.on((m: IResponseMessage) => {...})` (returns unsubscribe; ipcBridge.ts:608). Renderer precedent: `src/renderer/pages/conversation/platforms/acp/useAcpMessage.ts:310`.
   - Assistant text chunks: `m.type === 'content'`.
   - **Tool calls: `m.type === 'acp_tool_call'`** → payload = `ToolCallUpdate` (built at AcpAdapter.ts:242-246; shape acpTypes.ts:847-877): `update.title` (tool name), `update.status`, `update.rawInput`, `update.content[].content.text`. The `text_to_speech` `file_path` is in `rawInput` and/or the completed update's content text. Filter `m.conversation_id === id`.
4. **Read audio bytes:** `ipcBridge.fs.readFileBuffer.invoke({ path: file_path })` → `ArrayBuffer | null` (fsBridge.ts:908-922) → `AudioContext.decodeAudioData` → `AnalyserNode`.

## Instruction injection (renderer-only)

Pass `extra.presetContext` on `conversation.create`; injected as the first hermes message
`<system_instruction>` at `AcpAgentManager.ts:1030`. Use it to tell Hermes: *"For every reply, also
call the `text_to_speech` tool with your reply text and an `output_path`. Keep replies concise."*

## tts toolset enablement (the one gap — resolved)

Built-in `hermes` backend `resolveBuiltinBackendConfig` (AcpAgentManager.ts:523-527) returns no
`customEnv`, so there's no per-spawn env hook. BUT `tts` is already enabled globally on this machine
(T016: `hermes tools enable tts`). So T010 needs no process edit for tts. If ever disabled, fallback
to browser `speechSynthesis.speak(assistantText)`.

## Mic permission plumbing (separate small concern)

`getUserMedia` in the Electron renderer requires the main process to approve media permission
(`session.setPermissionRequestHandler` allowing 'media') and, for packaged macOS builds,
`NSMicrophoneUsageDescription` in Info.plist (electron-builder `mac.extendInfo`). These live OUTSIDE
the renderer (src/index.ts + electron-builder.yml), so T010's allowed_files must include them.

## Proposed allowed_files for T010

- `src/renderer/pages/jarvis/**` (voice pipeline service + UI)
- `src/index.ts` (session.setPermissionRequestHandler for 'media')
- `electron-builder.yml` (mac.extendInfo.NSMicrophoneUsageDescription)
