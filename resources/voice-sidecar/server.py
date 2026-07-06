"""
Agent Club voice sidecar — Kokoro-82M TTS + faster-whisper STT behind
FastAPI on :3108.

Adapted from jarvis-hud v1.0.1 voice-server (same author ecosystem) with
these changes for Agent Club:
  - multilingual STT: WHISPER_MODEL defaults to "small" (not small.en) and
    the language is auto-detected per utterance unless WHISPER_LANGUAGE is
    set; /stt returns the detected language
  - the domain-vocabulary prompt is empty by default (WHISPER_PROMPT env)
  - Kokoro language is configurable (KOKORO_LANG, default en-gb)
  - Windows CUDA DLL shims kept; on macOS/Linux everything runs CPU

The app auto-detects this process via GET /health and uses it when present:
  GET  /health         -> {"ok": true, "stt": {...}, "wake": {...}}
  GET  /speak?text=... -> audio/wav, streamed sentence-by-sentence so
                          playback starts after the FIRST sentence
  POST /stt            -> raw audio body (webm/opus/wav) ->
                          {"text": "...", "language": "es", "ms": 123}
  WS   /events         -> {"type":"hello","wake":bool} then
                          {"type":"wake"} / {"type":"transcript","text":...}
                          / {"type":"wake_timeout"} / {"type":"wake_error"}

Run: .venv/bin/python server.py   (see README.md for one-time setup)
"""

import asyncio
import glob
import io
import json
import os
import re
import struct
import sys
import threading
import time

# ctranslate2 (faster-whisper) needs cuDNN/cuBLAS DLLs from the pip
# nvidia-* wheels on the DLL search path BEFORE import. Windows-only API —
# Mac/Linux skip this entirely (CPU there).
if hasattr(os, "add_dll_directory"):
    for _d in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        os.add_dll_directory(_d)
        os.environ["PATH"] = _d + os.pathsep + os.environ["PATH"]

import numpy as np
import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse
from faster_whisper import WhisperModel
from kokoro_onnx import Kokoro

from wakeword import WakeListener, WAKE_MODEL

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("VOICE_SIDECAR_PORT", "3108"))
VOICE = os.environ.get("KOKORO_VOICE", "bm_george")  # calm British male
SPEED = float(os.environ.get("KOKORO_SPEED", "1.0"))
KOKORO_LANG = os.environ.get("KOKORO_LANG", "en-gb")
SAMPLE_RATE = 24000  # kokoro output rate
# multilingual by default — Agent Club users speak many languages
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
# empty = no vocabulary bias; set your own domain terms if needed
WHISPER_PROMPT = os.environ.get("WHISPER_PROMPT", "") or None
# empty = auto-detect per utterance (the right default for bilingual users)
WHISPER_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "").strip() or None

app = FastAPI()


def load_kokoro():
    """Kokoro TTS is OPTIONAL: when the model files are missing the sidecar
    still serves STT + wake word, /speak returns 503, and /health reports
    tts.ok=false — so users can adopt the sidecar incrementally (the model
    files are a ~350MB download; see README). CUDA when available, else CPU;
    onnxruntime silently falls back to CPU inside the session if CUDA can't
    init, so trust the session's own provider report."""
    model = os.path.join(HERE, "kokoro-v1.0.onnx")
    voices = os.path.join(HERE, "voices-v1.0.bin")
    if not (os.path.exists(model) and os.path.exists(voices)):
        print("kokoro model files missing — TTS disabled (see README.md); STT + wake still serve")
        return None, "off"
    if os.environ.get("KOKORO_DEVICE", "auto") != "cpu":
        try:
            os.environ["ONNX_PROVIDER"] = "CUDAExecutionProvider"
            k = Kokoro(model, voices)
            if "CUDAExecutionProvider" in k.sess.get_providers():
                return k, "cuda"
        except Exception as e:
            print(f"kokoro cuda failed ({e}); falling back to cpu")
        os.environ.pop("ONNX_PROVIDER", None)
    return Kokoro(model, voices), "cpu"


kokoro, KOKORO_DEVICE = load_kokoro()

try:
    whisper = WhisperModel(WHISPER_MODEL, device="cuda", compute_type="float16")
    WHISPER_DEVICE = "cuda"
except Exception:
    whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    WHISPER_DEVICE = "cpu"

whisper_lock = threading.Lock()


def transcribe_pcm(audio_f32):
    """float32 mono 16k -> text. Shared by the wake-word capture path."""
    with whisper_lock:
        segments, _info = whisper.transcribe(
            audio_f32, beam_size=1, language=WHISPER_LANGUAGE, vad_filter=False,
            initial_prompt=WHISPER_PROMPT,
        )
        # segments is a lazy generator — consume INSIDE the lock or the
        # actual decode runs unguarded
        return " ".join(s.text.strip() for s in segments).strip()


# --- wake word + app event stream ------------------------------------------
# The app connects to ws://:3108/events. The wake thread emits through
# emit_event() which hops onto the uvicorn event loop thread-safely.

WAKE_ENABLED = os.environ.get("WAKE_WORD", "on").lower() not in ("off", "0", "false")
WAKE_THRESHOLD = float(os.environ.get("WAKE_THRESHOLD", "0.5"))

ws_clients: set = set()
main_loop = None


def emit_event(payload: dict):
    if main_loop is None:
        return
    msg = json.dumps(payload)

    async def _send():
        for ws in list(ws_clients):
            try:
                await ws.send_text(msg)
            except Exception:
                ws_clients.discard(ws)

    asyncio.run_coroutine_threadsafe(_send(), main_loop)


wake = WakeListener(transcribe_pcm, emit_event, threshold=WAKE_THRESHOLD) if WAKE_ENABLED else None


@app.websocket("/events")
async def events(ws: WebSocket):
    await ws.accept()
    # hello tells the app whether hands-free is actually armed — "wake word
    # armed" must not lie
    await ws.send_text(json.dumps({"type": "hello", "wake": bool(wake and wake.ok)}))
    ws_clients.add(ws)
    try:
        while True:
            await ws.receive_text()  # client pings — content ignored
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)


@app.on_event("startup")
async def _startup():
    global main_loop
    main_loop = asyncio.get_running_loop()
    if wake is not None:
        wake.start()


def wav_header(sample_rate: int) -> bytes:
    """Streaming WAV header with unknown length (0x7FFFFFFF) — players
    play it progressively and stop at end-of-stream."""
    data_size = 0x7FFFFFFF - 36
    return struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + data_size, b"WAVE",
        b"fmt ", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16,
        b"data", data_size,
    )


SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+")


def chunks_of(text: str):
    """First sentence ships alone so playback starts ASAP; the rest glue
    into >=60-char chunks so tiny fragments don't chop the prosody."""
    parts = [p.strip() for p in SENTENCE_SPLIT.split(text) if p.strip()]
    if not parts:
        return [text]
    out, cur = [parts[0]], ""
    for p in parts[1:]:
        cur = f"{cur} {p}".strip()
        if len(cur) >= 60:
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return out


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "kokoro",
        "voice": VOICE,
        "device": KOKORO_DEVICE,
        "tts": {"ok": kokoro is not None, "voice": VOICE, "device": KOKORO_DEVICE},
        "stt": {"ok": True, "model": WHISPER_MODEL, "device": WHISPER_DEVICE},
        "wake": {
            "enabled": WAKE_ENABLED,
            "ok": bool(wake and wake.ok),
            "model": WAKE_MODEL,
            "threshold": WAKE_THRESHOLD,
            "error": wake.error if wake else None,
        },
    }


@app.post("/stt")
async def stt(req: Request, language: str = ""):
    audio = await req.body()
    if len(audio) < 1000:
        return Response(status_code=400, content="clip too short")
    # per-request language (the app forwards the user's explicit setting)
    # beats the env default; empty = auto-detect
    lang = language.strip().lower() or WHISPER_LANGUAGE
    t0 = time.time()
    # faster-whisper decodes webm/opus/wav via PyAV from a file-like object
    with whisper_lock:
        segments, info = whisper.transcribe(
            io.BytesIO(audio), beam_size=1, language=lang,
            vad_filter=False, initial_prompt=WHISPER_PROMPT,
        )
        text = " ".join(s.text.strip() for s in segments).strip()
    return {
        "text": text,
        "language": getattr(info, "language", None),
        "ms": int((time.time() - t0) * 1000),
    }


@app.get("/speak")
def speak(text: str = ""):
    if kokoro is None:
        return Response(status_code=503, content="tts disabled: kokoro model files missing (see README.md)")
    text = text.strip()[:900]
    if not text:
        return Response(status_code=400, content="empty text")

    def gen():
        yield wav_header(SAMPLE_RATE)
        for chunk in chunks_of(text):
            samples, sr = kokoro.create(chunk, voice=VOICE, speed=SPEED, lang=KOKORO_LANG)
            pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
            yield pcm.tobytes()
            # short breath between sentences
            yield b"\x00" * int(SAMPLE_RATE * 0.12) * 2

    return StreamingResponse(gen(), media_type="audio/wav",
                             headers={"Cache-Control": "no-store"})


if __name__ == "__main__":
    # warm the models so the first real request doesn't pay init cost
    if kokoro is not None:
        samples, _ = kokoro.create("Systems online.", voice=VOICE, speed=SPEED, lang=KOKORO_LANG)
        warm = io.BytesIO()
        import soundfile as sf
        sf.write(warm, samples, SAMPLE_RATE, format="WAV")
        warm.seek(0)
        list(whisper.transcribe(warm, beam_size=1, language=WHISPER_LANGUAGE)[0])
    else:
        # tiny silent clip keeps the whisper warmup without kokoro
        silence = np.zeros(SAMPLE_RATE // 2, dtype=np.float32)
        list(whisper.transcribe(silence, beam_size=1, language=WHISPER_LANGUAGE)[0])
    print(
        f"kokoro({KOKORO_DEVICE}) + whisper({WHISPER_MODEL}/{WHISPER_DEVICE}) warm — "
        f"serving :{PORT} voice={VOICE} lang={KOKORO_LANG} stt_lang={WHISPER_LANGUAGE or 'auto'}"
    )
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
