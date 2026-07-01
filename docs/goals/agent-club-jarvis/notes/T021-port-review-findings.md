# T021: jarvis-hud port review findings

Verdict: NOT READY until B1 + M1 (+ B2, M2) fixed. Architecture/wiring/teardown/guards/no-Claude all CONFIRMED good.

## fix_now

- **B1 (BLOCKER) — vaultState.ts ~180-199:** `ipcBridge.fs.getFilesByDir({dir})` returns `[tree]` where `tree` is the DIRECTORY node (`isDir:true`); the files are in `tree.children`. `listJsonFiles`/`listEntries` filter the array as flat entries → always `[]` → Documents, Schedule (daily-note discovery), AI Wire (morning report), CommandDeck queue, Callouts all EMPTY. Fix: `const tree = (await ipcBridge.fs.getFilesByDir.invoke({dir, root:dir}))[0]; const entries = tree?.children ?? [];` in both helpers. (readDirectoryRecursive default maxDepth:1 → one level of children, sufficient for the flat vault dirs.) Add a vault fixture test.
- **M1 (MAJOR) — vaultState.ts fileExists ~215-222 / mtimeMs ~169-176:** `getFileMetadata` (fsBridge.ts:1116-1138) RESOLVES a stub `{size:-1,lastModified:0}` on stat failure instead of throwing → `fileExists` returns true for missing files (today's daily note treated present → most-recent fallback skipped) and mtime sort gets 0 for all (arbitrary order). Fix in the vault: treat `lastModified===0`/`size===-1` as missing in fileExists; skip such in sorts.
- **B2 (MAJOR) — vaultState.ts writeIntent ~533-550:** `writeFile` has no mkdir -p; on fresh install `~/.agent-club/jarvis-vault/system/queue/` may not exist → ENOENT → "QUEUE WRITE FAILED". Fix: ensure the dir exists before write (mkdir -p path), or rely on the Hermes seam + stop advertising the queue write.
- **M2 (MAJOR) — index.tsx:** No Esc handler exists, but AudioIO renders "ESC to stop" and ReportOverlay claims HUD owns Esc. Add an Escape keydown in index.tsx: close any open report + `stopListening()` + `speechSynthesis.cancel()` + stop current source.

## followups (apply the cheap ones now)

- **m1 — GraphCore.tsx ~537:** add `renderer.forceContextLoss()` before `renderer.dispose()` (avoid GPU context cap on repeated open/close).
- **m2 — GraphCore.tsx cleanup:** `document.documentElement.style.removeProperty('--accent-h')` on unmount (don't leak the global hue override).
- **m3 (accepted risk):** ReportOverlay hand-rolled markdown sanitizer over untrusted run content — long-term route through DOMPurify.

## Confirmed good

No Claude/anthropic/haiku/ollama/qwen/kokoro/whisper/api-voice refs (only vault CSV key `claude_code` + UI label). One shared useVoicePipeline → getLevel→GraphCore, status→mode, deck→Hermes sendMessage, push-to-talk gated on hermesInstalled, ControlStatus engage-toggle gates Peekaboo, MusicButton present. No deleted-component imports. No SSR/Next leftovers. Route+JARVIS_MODE_ENABLED gate intact. Polls/timers/rAF/AudioContext all torn down. Traversal guards sound.
