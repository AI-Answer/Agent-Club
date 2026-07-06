# Agent Club Voice Sidecar

An optional local process that makes Jarvis Mode voice **fast, free, and
offline**: warm faster-whisper transcription (no per-utterance model reload),
Kokoro-82M natural text-to-speech, and a fully local **"Hey Jarvis"** wake
word. Agent Club auto-detects it on `127.0.0.1:3108` — start it and Jarvis
uses it; stop it and Jarvis falls back to the built-in paths.

Adapted from the jarvis-hud v1.0.1 voice-server, with multilingual STT
(auto-detects the spoken language per utterance) and configurable voice
language.

## One-time setup

```bash
cd resources/voice-sidecar
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Optionally download the Kokoro model files (~325MB + ~28MB) from the
[kokoro-onnx releases](https://github.com/thewh1teagle/kokoro-onnx/releases)
into this directory. **Without them the sidecar still runs** — STT and the
wake word work, `/speak` returns 503, and Jarvis keeps using its other
voices:

```bash
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

Wake-word model (one-time):

```bash
.venv/bin/python -c "from openwakeword.utils import download_models; download_models(['hey_jarvis_v0.1'])"
```

> CUDA machines: install `onnxruntime-gpu` + the `nvidia-*` wheels instead of
> `onnxruntime`, and install openwakeword with `--no-deps` so it does not
> overwrite the GPU onnxruntime build (then add `sounddevice requests tqdm
> scikit-learn websockets` manually).

## Run

```bash
./start-voice-sidecar.sh        # or: .venv/bin/python server.py
```

First start downloads the Whisper model (~460MB for `small`) and warms both
models. Then open Jarvis Mode in Agent Club — the console shows when the
sidecar is live.

## Tuning (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `WHISPER_MODEL` | `small` | faster-whisper model (multilingual) |
| `WHISPER_LANGUAGE` | *(auto)* | force a language (e.g. `es`); empty auto-detects per utterance |
| `KOKORO_VOICE` | `bm_george` | Kokoro voice name |
| `KOKORO_LANG` | `en-gb` | Kokoro language code |
| `KOKORO_SPEED` | `1.0` | speech speed |
| `WAKE_WORD` | `on` | `off` disables the wake listener |
| `WAKE_THRESHOLD` | `0.5` | wake sensitivity |

`POST /stt` also accepts a `?language=es` query parameter — Agent Club
forwards the language you set in Settings → Speech to Text, which beats
auto-detection for short utterances.

## How Agent Club routes around it

- **STT** — on macOS a ready whisper-cli (Metal GPU) is faster than the
  CPU-only sidecar and keeps priority (~0.6s vs ~1.1s per utterance,
  benchmarked on Apple Silicon). Everywhere else, and on Macs without
  whisper-cli set up, the warm sidecar serves 'local' transcription — and
  rescues voice input entirely when Speech to Text was never configured.
- **TTS** — pick "Local voice sidecar (Kokoro)" in Settings → Voice Output,
  or leave "System voice" and Jarvis upgrades to Kokoro automatically while
  the sidecar is live. Explicit ElevenLabs/OpenAI choices are never
  overridden.
- **Wake word** — armed automatically whenever the sidecar reports it; the
  Jarvis console shows a "wake" chip. After "Hey Jarvis", the sidecar records
  until silence and streams the transcript to the app over
  `ws://127.0.0.1:3108/events`.

Note: without headphones the wake microphone also hears Jarvis's own voice
from the speakers. The wake model only fires on the phrase "Hey Jarvis", so
this is normally harmless, but factor it in when tuning the threshold.
