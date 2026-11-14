import {
  NativeSpeechAdapter,
  ExpoSpeechRecognitionPackage,
  VOICE_LANGUAGE_TAGS,
  speechRecognitionService,
} from '../services/speech/speechRecognitionService';

describe('NativeSpeechAdapter', () => {
  let mockListeners: Record<string, (event: unknown) => void>;
  let mockRemoveFns: jest.Mock[];
  let mockModule: ExpoSpeechRecognitionPackage;
  let mockStart: jest.Mock;
  let mockStop: jest.Mock;
  let mockAbort: jest.Mock;
  let mockRequestPermissionsAsync: jest.Mock;
  let mockIsRecognitionAvailable: jest.Mock;

  beforeEach(() => {
    mockListeners = {};
    mockRemoveFns = [];
    mockStart = jest.fn();
    mockStop = jest.fn();
    mockAbort = jest.fn();
    mockRequestPermissionsAsync = jest.fn().mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    mockIsRecognitionAvailable = jest.fn().mockReturnValue(true);

    const mockAddListener = jest.fn(
      (eventName: string, listener: (event: unknown) => void) => {
        mockListeners[eventName] = listener;
        const removeFn = jest.fn();
        mockRemoveFns.push(removeFn);
        return { remove: removeFn };
      }
    );

    mockModule = {
      ExpoSpeechRecognitionModule: {
        start: mockStart,
        stop: mockStop,
        abort: mockAbort,
        requestPermissionsAsync: mockRequestPermissionsAsync,
        isRecognitionAvailable: mockIsRecognitionAvailable,
      },
      addSpeechRecognitionListener: mockAddListener,
      isRecognitionAvailable: mockIsRecognitionAvailable,
    } as unknown as ExpoSpeechRecognitionPackage;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isSupported', () => {
    it('returns true when isRecognitionAvailable returns true', () => {
      const adapter = new NativeSpeechAdapter(mockModule);
      expect(adapter.isSupported()).toBe(true);
      expect(mockIsRecognitionAvailable).toHaveBeenCalledTimes(1);
    });

    it('returns false when isRecognitionAvailable returns false', () => {
      mockIsRecognitionAvailable.mockReturnValue(false);
      const adapter = new NativeSpeechAdapter(mockModule);
      expect(adapter.isSupported()).toBe(false);
    });

    it('returns false when module is null', () => {
      const adapter = new NativeSpeechAdapter(null);
      expect(adapter.isSupported()).toBe(false);
    });

    it('returns false when isRecognitionAvailable throws', () => {
      mockIsRecognitionAvailable.mockImplementation(() => {
        throw new Error('Native recognition unavailable');
      });
      const adapter = new NativeSpeechAdapter(mockModule);
      expect(adapter.isSupported()).toBe(false);
    });
  });

  describe('requestPermission', () => {
    it('returns true when permission is granted with status granted', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);
      const granted = await adapter.requestPermission();
      expect(granted).toBe(true);
      expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns true when granted boolean is true even if status is custom', async () => {
      mockRequestPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        granted: true,
      });
      const adapter = new NativeSpeechAdapter(mockModule);
      const granted = await adapter.requestPermission();
      expect(granted).toBe(true);
    });

    it('returns false when permission is denied', async () => {
      mockRequestPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
      });
      const adapter = new NativeSpeechAdapter(mockModule);
      const granted = await adapter.requestPermission();
      expect(granted).toBe(false);
    });

    it('returns false when module is null or throws', async () => {
      const adapterNull = new NativeSpeechAdapter(null);
      expect(await adapterNull.requestPermission()).toBe(false);

      mockRequestPermissionsAsync.mockRejectedValue(
        new Error('Permission dialog dismissed')
      );
      const adapterThrow = new NativeSpeechAdapter(mockModule);
      expect(await adapterThrow.requestPermission()).toBe(false);
    });
  });

  describe('start recognition', () => {
    it('reports NOT_SUPPORTED error when isSupported is false', async () => {
      mockIsRecognitionAvailable.mockReturnValue(false);
      const adapter = new NativeSpeechAdapter(mockModule);

      const onResult = jest.fn();
      const onError = jest.fn();
      const onEnd = jest.fn();

      await adapter.start({
        language: 'en',
        onResult,
        onError,
        onEnd,
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NOT_SUPPORTED',
          message: expect.stringContaining('not supported'),
        })
      );
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('starts recognition with correct Telugu locale tag (te-IN)', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);

      await adapter.start({
        language: 'te',
        onResult: jest.fn(),
        onError: jest.fn(),
        onEnd: jest.fn(),
      });

      expect(mockStart).toHaveBeenCalledWith({
        lang: VOICE_LANGUAGE_TAGS.te,
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    });

    it('starts recognition with correct Hindi locale tag (hi-IN)', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);

      await adapter.start({
        language: 'hi',
        onResult: jest.fn(),
        onError: jest.fn(),
        onEnd: jest.fn(),
      });

      expect(mockStart).toHaveBeenCalledWith({
        lang: VOICE_LANGUAGE_TAGS.hi,
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    });

    it('starts recognition with correct English locale tag (en-IN)', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);

      await adapter.start({
        language: 'en',
        onResult: jest.fn(),
        onError: jest.fn(),
        onEnd: jest.fn(),
      });

      expect(mockStart).toHaveBeenCalledWith({
        lang: VOICE_LANGUAGE_TAGS.en,
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    });

    it('dispatches onStart when native start event fires', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);
      const onStart = jest.fn();

      await adapter.start({
        language: 'en',
        onStart,
        onResult: jest.fn(),
        onError: jest.fn(),
        onEnd: jest.fn(),
      });

      expect(mockListeners['start']).toBeDefined();
      mockListeners['start'](null);
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('dispatches onResult with transcript, isFinal, and confidence', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);
      const onResult = jest.fn();

      await adapter.start({
        language: 'te',
        onResult,
        onError: jest.fn(),
        onEnd: jest.fn(),
      });

      expect(mockListeners['result']).toBeDefined();
      mockListeners['result']({
        isFinal: true,
        results: [
          {
            transcript: '  WP 1234/2024  ',
            confidence: 0.98,
            segments: [],
          },
        ],
      });

      expect(onResult).toHaveBeenCalledWith({
        transcript: 'WP 1234/2024',
        isFinal: true,
        confidence: 0.98,
      });
    });

    it('handles empty results array gracefully with default confidence', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);
      const onResult = jest.fn();

      await adapter.start({
        language: 'en',
        onResult,
        onError: jest.fn(),
        onEnd: jest.fn(),
      });

      mockListeners['result']({
        isFinal: false,
        results: [],
      });

      expect(onResult).toHaveBeenCalledWith({
        transcript: '',
        isFinal: false,
        confidence: 1.0,
      });
    });

    it('dispatches onEnd and removes all listener subscriptions', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);
      const onEnd = jest.fn();

      await adapter.start({
        language: 'en',
        onResult: jest.fn(),
        onError: jest.fn(),
        onEnd,
      });

      expect(mockListeners['end']).toBeDefined();
      mockListeners['end'](null);

      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(mockRemoveFns.length).toBeGreaterThan(0);
      mockRemoveFns.forEach(fn => expect(fn).toHaveBeenCalled());
    });

    it('cleans up previous subscriptions when start is re-invoked', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);

      await adapter.start({
        language: 'en',
        onResult: jest.fn(),
        onError: jest.fn(),
        onEnd: jest.fn(),
      });

      const firstPassRemoveFns = [...mockRemoveFns];
      expect(firstPassRemoveFns.length).toBe(4); // start, result, error, end

      await adapter.start({
        language: 'te',
        onResult: jest.fn(),
        onError: jest.fn(),
        onEnd: jest.fn(),
      });

      // The first 4 subscriptions should have been removed
      firstPassRemoveFns.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
    });
  });

  describe('error code mapping', () => {
    const errorCases: [string, string][] = [
      ['not-allowed', 'PERMISSION_DENIED'],
      ['service-not-allowed', 'PERMISSION_DENIED'],
      ['language-not-supported', 'NOT_SUPPORTED'],
      ['no-speech', 'NO_SPEECH'],
      ['speech-timeout', 'NO_SPEECH'],
      ['audio-capture', 'AUDIO_CAPTURE'],
      ['network', 'NETWORK'],
      ['aborted', 'ABORTED'],
      ['busy', 'UNKNOWN'],
      ['client', 'UNKNOWN'],
      ['unknown', 'UNKNOWN'],
    ];

    test.each(errorCases)(
      'maps native error "%s" to "%s"',
      async (nativeCode, expectedType) => {
        const adapter = new NativeSpeechAdapter(mockModule);
        const onError = jest.fn();

        await adapter.start({
          language: 'en',
          onResult: jest.fn(),
          onError,
          onEnd: jest.fn(),
        });

        expect(mockListeners['error']).toBeDefined();
        mockListeners['error']({
          error: nativeCode,
          message: `Error detail for ${nativeCode}`,
        });

        expect(onError).toHaveBeenCalledWith({
          type: expectedType,
          message: `Error detail for ${nativeCode}`,
        });
      }
    );

    it('catches synchronous start failure and dispatches UNKNOWN error', async () => {
      mockStart.mockImplementation(() => {
        throw new Error('Native recognizer crash');
      });

      const adapter = new NativeSpeechAdapter(mockModule);
      const onError = jest.fn();

      await adapter.start({
        language: 'en',
        onResult: jest.fn(),
        onError,
        onEnd: jest.fn(),
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UNKNOWN',
          message: 'Native recognizer crash',
        })
      );
    });
  });

  describe('stop and abort', () => {
    it('stop calls ExpoSpeechRecognitionModule.stop', () => {
      const adapter = new NativeSpeechAdapter(mockModule);
      adapter.stop();
      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('abort calls ExpoSpeechRecognitionModule.abort and cleans up listeners', async () => {
      const adapter = new NativeSpeechAdapter(mockModule);

      await adapter.start({
        language: 'en',
        onResult: jest.fn(),
        onError: jest.fn(),
        onEnd: jest.fn(),
      });

      mockAbort.mockClear();

      adapter.abort();

      expect(mockAbort).toHaveBeenCalledTimes(1);
      expect(mockRemoveFns.length).toBe(4);
      mockRemoveFns.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
    });

    it('tolerates errors if native stop or abort methods throw', () => {
      mockStop.mockImplementation(() => {
        throw new Error('Not running');
      });
      mockAbort.mockImplementation(() => {
        throw new Error('Not running');
      });

      const adapter = new NativeSpeechAdapter(mockModule);
      expect(() => adapter.stop()).not.toThrow();
      expect(() => adapter.abort()).not.toThrow();
    });
  });

  describe('SpeechRecognitionService default adapter integration', () => {
    it('defaults to NativeSpeechAdapter on native platforms', () => {
      speechRecognitionService.resetToDefaultAdapter();
      const currentAdapter = speechRecognitionService.getAdapter();
      expect(currentAdapter).toBeInstanceOf(NativeSpeechAdapter);
    });
  });
});
