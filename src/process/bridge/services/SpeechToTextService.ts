/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getSpeechToTextProviderApiKey,
  type SpeechToTextAudioBuffer,
  type SpeechToTextConfig,
  type SpeechToTextRequest,
  type SpeechToTextResult,
} from '@/common/types/speech';
import { resolveWhisperModelId } from '@/common/types/whisperModels';
import { resolveWhisperCli } from '@process/agent/whisper/binaryResolver';
import {
  getWhisperModelPath,
  isWhisperModelDownloaded,
} from '@process/services/whisper/WhisperModelStore';
import { mainError, mainLog, mainWarn } from '@process/utils/mainLogger';
import { ProcessConfig } from '@process/utils/initStorage';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

type OpenAITranscriptionResponse = {
  language?: string;
  text?: string;
};

type DeepgramTranscriptionResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
      }>;
      detected_language?: string;
    }>;
  };
};

type ElevenLabsTranscriptionResponse = {
  language_code?: string;
  text?: string;
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'whisper-1';
const DEFAULT_DEEPGRAM_BASE_URL = 'https://api.deepgram.com/v1/listen';
const DEFAULT_DEEPGRAM_MODEL = 'nova-2';
const DEFAULT_ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const DEFAULT_ELEVENLABS_MODEL = 'scribe_v1';
const STT_LOG_TAG = '[SpeechToText]';
const execFileAsync = promisify(execFile);

const createRequestId = () => `stt-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error);
};

const getErrorCode = (error: unknown) => {
  const message = getErrorMessage(error);
  const [code] = message.split(':');
  return code || 'STT_UNKNOWN';
};

const normalizeAudioBuffer = (audioBuffer: SpeechToTextAudioBuffer): Uint8Array => {
  if (audioBuffer instanceof Uint8Array) {
    return audioBuffer;
  }

  if (Array.isArray(audioBuffer)) {
    return Uint8Array.from(audioBuffer);
  }

  const orderedKeys = Object.keys(audioBuffer)
    .filter((key) => /^\d+$/.test(key))
    .toSorted((a, b) => Number(a) - Number(b));

  return Uint8Array.from(orderedKeys.map((key) => audioBuffer[key] ?? 0));
};

const getRequestLogMeta = (request: SpeechToTextRequest) => {
  const normalizedAudioBuffer = normalizeAudioBuffer(request.audioBuffer);
  return {
    audioBytes: normalizedAudioBuffer.byteLength,
    hasLanguageHint: Boolean(request.languageHint),
    languageHint: request.languageHint || undefined,
    mimeType: request.mimeType || 'application/octet-stream',
  };
};

const normalizeBaseUrl = (baseUrl: string | undefined, fallback: string) => {
  const trimmed = baseUrl?.trim();
  return trimmed && trimmed.length > 0 ? trimmed.replace(/\/+$/, '') : fallback;
};

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as {
      error?: {
        message?: string;
      };
      err_msg?: string;
      // ElevenLabs error envelope
      detail?: string | { message?: string };
    };
    const detail = typeof payload.detail === 'string' ? payload.detail : payload.detail?.message;
    return payload.error?.message || payload.err_msg || detail || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const buildOpenAIUrl = (baseUrl?: string) => {
  const normalized = normalizeBaseUrl(baseUrl, DEFAULT_OPENAI_BASE_URL);
  return normalized.endsWith('/audio/transcriptions') ? normalized : `${normalized}/audio/transcriptions`;
};

const buildElevenLabsUrl = (baseUrl?: string) => {
  const normalized = normalizeBaseUrl(baseUrl, DEFAULT_ELEVENLABS_BASE_URL);
  return normalized.endsWith('/speech-to-text') ? normalized : `${normalized}/speech-to-text`;
};

const buildDeepgramUrl = (config: SpeechToTextConfig['deepgram'], languageHint?: string) => {
  const normalized = normalizeBaseUrl(config?.baseUrl, DEFAULT_DEEPGRAM_BASE_URL);
  const url = new URL(normalized);
  url.searchParams.set('model', config?.model || DEFAULT_DEEPGRAM_MODEL);
  url.searchParams.set('punctuate', String(config?.punctuate !== false));
  url.searchParams.set('smart_format', String(config?.smartFormat !== false));

  const effectiveLanguage = languageHint || config?.language;
  if (effectiveLanguage) {
    url.searchParams.set('language', effectiveLanguage);
  } else if (config?.detectLanguage !== false) {
    url.searchParams.set('detect_language', 'true');
  }

  return url.toString();
};

const resolveSpeechToTextConfig = async (): Promise<SpeechToTextConfig> => {
  const config = await ProcessConfig.get('tools.speechToText');
  if (!config?.enabled) {
    mainWarn(STT_LOG_TAG, 'Speech-to-text request rejected because feature is disabled');
    throw new Error('STT_DISABLED');
  }
  return config;
};

const resolveProviderApiKey = (config: SpeechToTextConfig): string => {
  if (config.provider === 'local') {
    throw new Error('STT_LOCAL_NOT_CONFIGURED');
  }
  const apiKey = getSpeechToTextProviderApiKey(config);
  if (!apiKey) {
    const code =
      config.provider === 'openai' ? 'OPENAI' : config.provider === 'deepgram' ? 'DEEPGRAM' : 'ELEVENLABS';
    throw new Error(`STT_${code}_NOT_CONFIGURED`);
  }
  return apiKey;
};

export class SpeechToTextService {
  static async transcribe(request: SpeechToTextRequest): Promise<SpeechToTextResult> {
    const requestId = createRequestId();
    const startedAt = Date.now();
    mainLog(STT_LOG_TAG, 'Transcription requested', {
      requestId,
      ...getRequestLogMeta(request),
    });

    try {
      const config = await resolveSpeechToTextConfig();
      mainLog(STT_LOG_TAG, 'Resolved speech-to-text provider', {
        requestId,
        provider: config.provider,
        model:
          config.provider === 'openai'
            ? config.openai?.model || DEFAULT_OPENAI_MODEL
            : config.provider === 'elevenlabs'
              ? config.elevenlabs?.model || DEFAULT_ELEVENLABS_MODEL
              : config.provider === 'local'
                ? resolveWhisperModelId(config.local?.modelId)
                : config.deepgram?.model,
      });

      const result =
        config.provider === 'openai'
          ? await this.transcribeWithOpenAI(config, request)
          : config.provider === 'elevenlabs'
            ? await this.transcribeWithElevenLabs(config, request)
            : config.provider === 'local'
              ? await this.transcribeWithLocal(config, request)
              : await this.transcribeWithDeepgram(config, request);

      mainLog(STT_LOG_TAG, 'Transcription completed', {
        requestId,
        durationMs: Date.now() - startedAt,
        language: result.language,
        model: result.model,
        provider: result.provider,
        textLength: result.text.length,
      });

      return result;
    } catch (error) {
      mainError(STT_LOG_TAG, 'Transcription failed', {
        requestId,
        durationMs: Date.now() - startedAt,
        errorCode: getErrorCode(error),
        message: getErrorMessage(error),
      });
      throw error;
    }
  }

  private static async transcribeWithOpenAI(
    config: SpeechToTextConfig,
    request: SpeechToTextRequest
  ): Promise<SpeechToTextResult> {
    const apiKey = resolveProviderApiKey(config);
    const audioBuffer = Buffer.from(normalizeAudioBuffer(request.audioBuffer));
    const blob = new Blob([audioBuffer], {
      type: request.mimeType || 'application/octet-stream',
    });
    const formData = new FormData();
    formData.append('file', blob, request.fileName);
    formData.append('model', config.openai?.model || DEFAULT_OPENAI_MODEL);

    const language = request.languageHint || config.openai?.language;
    if (language) {
      // OpenAI Whisper requires ISO 639-1 codes (e.g. "en"), not BCP 47 (e.g. "en-us")
      formData.append('language', language.split('-')[0].toLowerCase());
    }
    if (config.openai?.prompt) {
      formData.append('prompt', config.openai.prompt);
    }
    if (typeof config.openai?.temperature === 'number') {
      formData.append('temperature', String(config.openai.temperature));
    }

    const response = await fetch(buildOpenAIUrl(config.openai?.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`STT_REQUEST_FAILED:${await toErrorMessage(response)}`);
    }

    const payload = (await response.json()) as OpenAITranscriptionResponse;
    return {
      language: payload.language || language,
      model: config.openai?.model || DEFAULT_OPENAI_MODEL,
      provider: 'openai',
      text: payload.text?.trim() || '',
    };
  }

  private static async transcribeWithElevenLabs(
    config: SpeechToTextConfig,
    request: SpeechToTextRequest
  ): Promise<SpeechToTextResult> {
    const apiKey = resolveProviderApiKey(config);
    const model = config.elevenlabs?.model?.trim() || DEFAULT_ELEVENLABS_MODEL;
    const audioBuffer = Buffer.from(normalizeAudioBuffer(request.audioBuffer));
    const blob = new Blob([audioBuffer], {
      type: request.mimeType || 'application/octet-stream',
    });
    const formData = new FormData();
    formData.append('file', blob, request.fileName);
    formData.append('model_id', model);
    // Voice-console transcripts should be plain text — no "(laughter)" tags.
    formData.append('tag_audio_events', 'false');

    const language = request.languageHint || config.elevenlabs?.language;
    if (language) {
      // Scribe expects ISO-639 codes (e.g. "en"), not BCP 47 (e.g. "en-US").
      formData.append('language_code', language.split('-')[0].toLowerCase());
    }

    const response = await fetch(buildElevenLabsUrl(config.elevenlabs?.baseUrl), {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`STT_REQUEST_FAILED:${await toErrorMessage(response)}`);
    }

    const payload = (await response.json()) as ElevenLabsTranscriptionResponse;
    return {
      language: payload.language_code || language,
      model,
      provider: 'elevenlabs',
      text: payload.text?.trim() || '',
    };
  }

  private static async transcribeWithDeepgram(
    config: SpeechToTextConfig,
    request: SpeechToTextRequest
  ): Promise<SpeechToTextResult> {
    const apiKey = resolveProviderApiKey(config);
    const response = await fetch(buildDeepgramUrl(config.deepgram, request.languageHint), {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': request.mimeType || 'application/octet-stream',
      },
      body: Buffer.from(normalizeAudioBuffer(request.audioBuffer)),
    });

    if (!response.ok) {
      throw new Error(`STT_REQUEST_FAILED:${await toErrorMessage(response)}`);
    }

    const payload = (await response.json()) as DeepgramTranscriptionResponse;
    const channel = payload.results?.channels?.[0];
    const transcript = channel?.alternatives?.[0]?.transcript?.trim() || '';
    return {
      language: request.languageHint || config.deepgram?.language || channel?.detected_language,
      model: config.deepgram?.model || DEFAULT_DEEPGRAM_MODEL,
      provider: 'deepgram',
      text: transcript,
    };
  }

  private static async transcribeWithLocal(
    config: SpeechToTextConfig,
    request: SpeechToTextRequest
  ): Promise<SpeechToTextResult> {
    const resolution = resolveWhisperCli();
    if (!resolution) {
      throw new Error('STT_LOCAL_BINARY_MISSING');
    }

    const modelId = resolveWhisperModelId(config.local?.modelId);
    if (!isWhisperModelDownloaded(modelId)) {
      throw new Error('STT_LOCAL_MODEL_NOT_DOWNLOADED');
    }

    const modelPath = getWhisperModelPath(modelId);
    const audioBuffer = Buffer.from(normalizeAudioBuffer(request.audioBuffer));
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'agentclub-stt-'));

    try {
      const audioPath = path.join(tmpDir, request.fileName || 'input.wav');
      await writeFile(audioPath, audioBuffer);

      const outPrefix = path.join(tmpDir, 'output');
      const language = request.languageHint || config.local?.language || 'auto';
      const languageFlag = language.trim().toLowerCase() === 'auto' ? 'auto' : language.split('-')[0].toLowerCase();

      await execFileAsync(
        resolution.binaryPath,
        ['-m', modelPath, '-f', audioPath, '-nt', '-l', languageFlag, '-of', outPrefix, '-otxt'],
        {
          cwd: resolution.cwd,
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      let text = '';
      try {
        text = (await readFile(`${outPrefix}.txt`, 'utf8')).trim();
      } catch {
        text = '';
      }

      return {
        language: languageFlag === 'auto' ? undefined : languageFlag,
        model: modelId,
        provider: 'local',
        text,
      };
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
}
