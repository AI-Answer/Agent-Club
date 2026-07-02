/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getTextToSpeechElevenLabsKey,
  getTextToSpeechOpenAIKey,
  resolveTextToSpeechProvider,
  type TextToSpeechConfig,
  type TextToSpeechRequest,
  type TextToSpeechResult,
} from '@/common/types/speech';
import { mainError, mainLog } from '@process/utils/mainLogger';
import { ProcessConfig } from '@process/utils/initStorage';

const DEFAULT_ELEVENLABS_TTS_BASE_URL = 'https://api.elevenlabs.io/v1';
/** Lowest-latency ElevenLabs model (~75ms generation), 32 languages. */
const DEFAULT_ELEVENLABS_TTS_MODEL = 'eleven_flash_v2_5';
/** ElevenLabs premade voice "Rachel" — a safe default until the user picks one. */
const DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const DEFAULT_OPENAI_TTS_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_OPENAI_TTS_VOICE = 'alloy';
const TTS_LOG_TAG = '[TextToSpeech]';

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as {
      // OpenAI error envelope
      error?: { message?: string };
      // ElevenLabs error envelope
      detail?: string | { message?: string };
    };
    const detail = typeof payload.detail === 'string' ? payload.detail : payload.detail?.message;
    return payload.error?.message || detail || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

type SynthOutcome = { audio: Uint8Array; model: string; voiceId: string };

const synthesizeWithElevenLabs = async (text: string, ttsConfig: TextToSpeechConfig | undefined, apiKey: string): Promise<SynthOutcome> => {
  const voiceId = ttsConfig?.elevenlabs?.voiceId?.trim() || DEFAULT_ELEVENLABS_VOICE_ID;
  const model = ttsConfig?.elevenlabs?.model?.trim() || DEFAULT_ELEVENLABS_TTS_MODEL;
  const baseUrl = (ttsConfig?.elevenlabs?.baseUrl?.trim() || DEFAULT_ELEVENLABS_TTS_BASE_URL).replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, model_id: model }),
  });
  if (!response.ok) {
    throw new Error(`TTS_REQUEST_FAILED:${await toErrorMessage(response)}`);
  }
  return { audio: new Uint8Array(await response.arrayBuffer()), model, voiceId };
};

const synthesizeWithOpenAI = async (text: string, ttsConfig: TextToSpeechConfig | undefined, apiKey: string): Promise<SynthOutcome> => {
  const voice = ttsConfig?.openai?.voice?.trim() || DEFAULT_OPENAI_TTS_VOICE;
  const model = ttsConfig?.openai?.model?.trim() || DEFAULT_OPENAI_TTS_MODEL;
  const baseUrl = (ttsConfig?.openai?.baseUrl?.trim() || DEFAULT_OPENAI_TTS_BASE_URL).replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: text, voice, response_format: 'mp3' }),
  });
  if (!response.ok) {
    throw new Error(`TTS_REQUEST_FAILED:${await toErrorMessage(response)}`);
  }
  return { audio: new Uint8Array(await response.arrayBuffer()), model, voiceId: voice };
};

export class TextToSpeechService {
  /**
   * Synthesize one short utterance. Callers send sentence-sized chunks so
   * speech can start while the reply is still streaming. Provider routing is
   * the shared resolveTextToSpeechProvider (explicit choice honored when its
   * key exists; any available remote key beats none). Throws
   * TTS_NOT_CONFIGURED when only the system voice is available — the renderer
   * speaks that path itself.
   */
  static async synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResult> {
    const text = request.text.trim();
    if (!text) {
      throw new Error('TTS_EMPTY_TEXT');
    }

    const ttsConfig = await ProcessConfig.get('tools.textToSpeech');
    const sttConfig = await ProcessConfig.get('tools.speechToText');
    const provider = resolveTextToSpeechProvider(ttsConfig, sttConfig);
    if (provider === 'system') {
      throw new Error('TTS_NOT_CONFIGURED');
    }

    const startedAt = Date.now();
    try {
      const outcome =
        provider === 'elevenlabs'
          ? await synthesizeWithElevenLabs(text, ttsConfig, getTextToSpeechElevenLabsKey(ttsConfig, sttConfig))
          : await synthesizeWithOpenAI(text, ttsConfig, getTextToSpeechOpenAIKey(ttsConfig, sttConfig));

      mainLog(TTS_LOG_TAG, 'Synthesis completed', {
        provider,
        model: outcome.model,
        voiceId: outcome.voiceId,
        textLength: text.length,
        audioBytes: outcome.audio.byteLength,
        durationMs: Date.now() - startedAt,
      });

      return {
        audio: Array.from(outcome.audio),
        mimeType: 'audio/mpeg',
        provider,
        model: outcome.model,
        voiceId: outcome.voiceId,
      };
    } catch (error) {
      mainError(TTS_LOG_TAG, 'Synthesis failed', {
        provider,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
