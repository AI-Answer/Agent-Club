import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(),
  },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainError: vi.fn(),
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

vi.mock('@process/agent/whisper/binaryResolver', () => ({
  resolveWhisperCli: vi.fn(),
}));

vi.mock('@process/services/whisper/WhisperModelStore', () => ({
  getWhisperModelPath: vi.fn(),
  isWhisperModelDownloaded: vi.fn(),
}));

import { ProcessConfig } from '@process/utils/initStorage';
import { SpeechToTextService } from '@process/bridge/services/SpeechToTextService';
import { resolveWhisperCli } from '@process/agent/whisper/binaryResolver';
import { getWhisperModelPath, isWhisperModelDownloaded } from '@process/services/whisper/WhisperModelStore';
import { mainError, mainLog, mainWarn } from '@process/utils/mainLogger';
import { writeFile } from 'node:fs/promises';

describe('SpeechToTextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects requests when speech-to-text is disabled', async () => {
    vi.mocked(ProcessConfig.get).mockResolvedValue(undefined);

    await expect(
      SpeechToTextService.transcribe({
        audioBuffer: new Uint8Array([1, 2, 3]),
        fileName: 'sample.webm',
        mimeType: 'audio/webm',
      })
    ).rejects.toThrow('STT_DISABLED');

    expect(mainWarn).toHaveBeenCalledWith(
      '[SpeechToText]',
      'Speech-to-text request rejected because feature is disabled'
    );
    expect(mainError).toHaveBeenCalledWith(
      '[SpeechToText]',
      'Transcription failed',
      expect.objectContaining({
        errorCode: 'STT_DISABLED',
      })
    );
  });

  it('sends OpenAI transcription requests with multipart form data', async () => {
    vi.mocked(ProcessConfig.get).mockResolvedValue({
      enabled: true,
      provider: 'openai',
      openai: {
        apiKey: 'openai-key',
        baseUrl: 'https://example.com/v1',
        model: 'whisper-1',
      },
    });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ language: 'en', text: ' hello world ' })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await SpeechToTextService.transcribe({
      audioBuffer: new Uint8Array([1, 2, 3]),
      fileName: 'sample.webm',
      languageHint: 'en',
      mimeType: 'audio/webm',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/audio/transcriptions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer openai-key',
        }),
      })
    );

    const [, request] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.body.get('model')).toBe('whisper-1');
    expect(request.body.get('language')).toBe('en');
    expect(result).toEqual({
      language: 'en',
      model: 'whisper-1',
      provider: 'openai',
      text: 'hello world',
    });
    expect(mainLog).toHaveBeenCalledWith(
      '[SpeechToText]',
      'Transcription completed',
      expect.objectContaining({
        model: 'whisper-1',
        provider: 'openai',
        textLength: 'hello world'.length,
      })
    );
  });

  it('accepts desktop IPC audio payloads serialized as plain objects', async () => {
    vi.mocked(ProcessConfig.get).mockResolvedValue({
      enabled: true,
      provider: 'openai',
      openai: {
        apiKey: 'openai-key',
        baseUrl: 'https://example.com/v1',
        model: 'whisper-1',
      },
    });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ language: 'zh', text: ' ok ' })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await SpeechToTextService.transcribe({
      audioBuffer: { 0: 1, 1: 2, 2: 3 },
      fileName: 'sample.webm',
      languageHint: 'zh-CN',
      mimeType: 'audio/webm;codecs=opus',
    });

    expect(result).toEqual({
      language: 'zh',
      model: 'whisper-1',
      provider: 'openai',
      text: 'ok',
    });
    expect(mainLog).toHaveBeenCalledWith(
      '[SpeechToText]',
      'Transcription requested',
      expect.objectContaining({
        audioBytes: 3,
        mimeType: 'audio/webm;codecs=opus',
      })
    );
  });

  it('sends ElevenLabs transcription requests with multipart form data', async () => {
    vi.mocked(ProcessConfig.get).mockResolvedValue({
      enabled: true,
      provider: 'elevenlabs',
      elevenlabs: {
        apiKey: 'elevenlabs-key',
        baseUrl: 'https://api.elevenlabs.io/v1',
        model: 'scribe_v1',
        language: 'en',
      },
    });

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            language_code: 'en',
            text: ' elevenlabs text ',
          })
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await SpeechToTextService.transcribe({
      audioBuffer: new Uint8Array([4, 5, 6]),
      fileName: 'sample.webm',
      languageHint: 'en-US',
      mimeType: 'audio/webm',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/speech-to-text',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'xi-api-key': 'elevenlabs-key',
        }),
      })
    );

    const [, request] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.body.get('model_id')).toBe('scribe_v1');
    expect(request.body.get('tag_audio_events')).toBe('false');
    expect(request.body.get('language_code')).toBe('en');
    expect(result).toEqual({
      language: 'en',
      model: 'scribe_v1',
      provider: 'elevenlabs',
      text: 'elevenlabs text',
    });
    expect(mainLog).toHaveBeenCalledWith(
      '[SpeechToText]',
      'Resolved speech-to-text provider',
      expect.objectContaining({
        provider: 'elevenlabs',
        model: 'scribe_v1',
      })
    );
  });

  it('sends Deepgram transcription requests with query options', async () => {
    vi.mocked(ProcessConfig.get).mockResolvedValue({
      enabled: true,
      provider: 'deepgram',
      deepgram: {
        apiKey: 'deepgram-key',
        baseUrl: 'https://api.deepgram.com/v1/listen',
        detectLanguage: true,
        model: 'nova-2',
        punctuate: true,
        smartFormat: true,
      },
    });

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: {
              channels: [
                {
                  alternatives: [{ transcript: ' deepgram text ' }],
                  detected_language: 'en',
                },
              ],
            },
          })
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await SpeechToTextService.transcribe({
      audioBuffer: new Uint8Array([9, 8, 7]),
      fileName: 'sample.webm',
      mimeType: 'audio/webm',
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toContain('model=nova-2');
    expect(url).toContain('detect_language=true');
    expect(request.headers.Authorization).toBe('Token deepgram-key');
    expect(request.headers['Content-Type']).toBe('audio/webm');
    expect(result).toEqual({
      language: 'en',
      model: 'nova-2',
      provider: 'deepgram',
      text: 'deepgram text',
    });
    expect(mainLog).toHaveBeenCalledWith(
      '[SpeechToText]',
      'Resolved speech-to-text provider',
      expect.objectContaining({
        provider: 'deepgram',
      })
    );
  });

  it('transcribes locally via whisper-cli when local provider is configured', async () => {
    vi.mocked(ProcessConfig.get).mockResolvedValue({
      enabled: true,
      provider: 'local',
      local: {
        modelId: 'base',
        language: 'en',
      },
    });
    vi.mocked(resolveWhisperCli).mockReturnValue({
      binaryPath: '/tmp/whisper-cli',
      cwd: '/tmp',
    });
    vi.mocked(isWhisperModelDownloaded).mockReturnValue(true);
    vi.mocked(getWhisperModelPath).mockReturnValue('/tmp/models/ggml-base.bin');

    execFileMock.mockImplementation((_binaryPath, args, _options, callback) => {
      const cmdArgs = args as string[];
      const outFlagIndex = cmdArgs.indexOf('-of');
      const outPrefix = outFlagIndex >= 0 ? cmdArgs[outFlagIndex + 1] : '/tmp/output';
      void writeFile(`${outPrefix}.txt`, ' hello local ').then(() => {
        callback?.(null, '', '');
      });
    });

    const result = await SpeechToTextService.transcribe({
      audioBuffer: new Uint8Array([1, 2, 3, 4]),
      fileName: 'speech-input.wav',
      mimeType: 'audio/wav',
      languageHint: 'en-US',
    });

    expect(result).toEqual({
      language: 'en',
      model: 'base',
      provider: 'local',
      text: 'hello local',
    });
    expect(resolveWhisperCli).toHaveBeenCalled();
    expect(isWhisperModelDownloaded).toHaveBeenCalledWith('base');
    expect(execFileMock).toHaveBeenCalled();
  });
});
