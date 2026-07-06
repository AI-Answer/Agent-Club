"""
Wake-word listener — openWakeWord "hey jarvis" on the default mic.

Chosen over Porcupine (the original P4 plan) because Porcupine requires a
Picovoice account + access key; openWakeWord ships a pretrained hey-jarvis
ONNX model and rides the onnxruntime(-gpu) already in this venv. Fully
local, zero keys.

Runs as a daemon thread inside server.py:
  mic (16k mono int16, 80ms frames) -> openwakeword predict
  score >= threshold -> emit {"type":"wake"} -> capture the utterance with
  energy endpointing -> whisper STT (shared model, lock in server.py) ->
  emit {"type":"transcript","text":...}.

The HUD listens on ws://:3108/events: "wake" = barge-in (stop TTS, show
listening), "transcript" = dispatch through POST /api/voice/text.
"""

import threading
import time

import numpy as np

SR = 16000
FRAME = 1280  # 80ms @ 16k — the frame size openwakeword expects per predict()
WAKE_MODEL = "hey_jarvis_v0.1"

MAX_UTTERANCE_S = 8.0    # hard cap on post-wake capture
NO_SPEECH_S = 2.5        # wake fired but nobody spoke -> timeout
TRAIL_SILENCE_FRAMES = 9  # ~720ms of quiet after speech = end of utterance
COOLDOWN_S = 1.5         # ignore re-triggers right after a capture


class WakeListener:
    def __init__(self, transcribe_pcm, emit, threshold=0.5):
        """transcribe_pcm(float32 mono 16k) -> str; emit(dict) is thread-safe."""
        self.transcribe_pcm = transcribe_pcm
        self.emit = emit
        self.threshold = threshold
        self.ok = False
        self.error = None
        self._thread = threading.Thread(target=self._run, daemon=True, name="wake-listener")

    def start(self):
        self._thread.start()

    def _run(self):
        try:
            import sounddevice as sd
            from openwakeword.model import Model

            model = Model(wakeword_models=[WAKE_MODEL], inference_framework="onnx")
        except Exception as e:  # missing mic/deps/models — report via /health, never crash the server
            self.error = f"{type(e).__name__}: {e}"
            print(f"wake word disabled: {self.error}")
            return

        try:
            with sd.InputStream(
                samplerate=SR, channels=1, dtype="int16", blocksize=FRAME
            ) as stream:
                self.ok = True
                print(f"wake word armed — '{WAKE_MODEL}' threshold={self.threshold}")
                noise = 80.0  # rolling RMS noise floor, follows the room
                last_fire = 0.0
                while True:
                    frame, _overflowed = stream.read(FRAME)
                    pcm = frame[:, 0]
                    rms = float(np.sqrt(np.mean(pcm.astype(np.float32) ** 2)))
                    # clamp so speech doesn't drag the floor up
                    noise = 0.98 * noise + 0.02 * min(rms, 600.0)
                    score = float(model.predict(pcm)[WAKE_MODEL])
                    if score >= self.threshold and time.time() - last_fire > COOLDOWN_S:
                        self.emit({"type": "wake", "score": round(score, 3)})
                        self._capture(stream, noise)
                        model.reset()
                        last_fire = time.time()
        except Exception as e:
            self.ok = False
            self.error = f"{type(e).__name__}: {e}"
            print(f"wake listener died: {self.error}")

    def _capture(self, stream, noise):
        """Record until the speaker goes quiet, then STT and emit."""
        speech_gate = max(noise * 3.0, 250.0)
        frames = []
        started = False
        silent = 0
        t0 = time.time()
        while time.time() - t0 < MAX_UTTERANCE_S:
            frame, _ = stream.read(FRAME)
            pcm = frame[:, 0]
            frames.append(pcm.copy())
            rms = float(np.sqrt(np.mean(pcm.astype(np.float32) ** 2)))
            if rms >= speech_gate:
                started = True
                silent = 0
            else:
                silent += 1
                if started and silent >= TRAIL_SILENCE_FRAMES:
                    break
                if not started and time.time() - t0 > NO_SPEECH_S:
                    self.emit({"type": "wake_timeout"})
                    return

        if not started:
            self.emit({"type": "wake_timeout"})
            return

        audio = np.concatenate(frames).astype(np.float32) / 32768.0
        t1 = time.time()
        try:
            text = self.transcribe_pcm(audio)
        except Exception as e:
            self.emit({"type": "wake_error", "error": str(e)})
            return
        if text:
            self.emit(
                {"type": "transcript", "text": text, "ms": int((time.time() - t1) * 1000)}
            )
        else:
            self.emit({"type": "wake_timeout"})
