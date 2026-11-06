import {
  speechRecognitionService,
  MockSpeechAdapter,
  WebSpeechAdapter,
  VOICE_LANGUAGE_TAGS,
} from '../services/speech/speechRecognitionService';

describe('SpeechRecognitionService', () => {
  let mockAdapter: MockSpeechAdapter;

  beforeEach(() => {
    mockAdapter = new MockSpeechAdapter();
    speechRecognitionService.setAdapter(mockAdapter);
  });

  afterEach(() => {
    speechRecognitionService.resetToDefaultAdapter();
  });

  it('defines valid language tags for Telugu, Hindi, and English', () => {
    expect(VOICE_LANGUAGE_TAGS.en).toBe('en-IN');
    expect(VOICE_LANGUAGE_TAGS.te).toBe('te-IN');
    expect(VOICE_LANGUAGE_TAGS.hi).toBe('hi-IN');
  });

  it('reports supported status via adapter', () => {
    expect(speechRecognitionService.isSupported()).toBe(true);

    mockAdapter.setScenario('not_supported');
    expect(speechRecognitionService.isSupported()).toBe(false);
  });

  it('handles permission requesting and approval', async () => {
    const granted = await speechRecognitionService.requestPermission();
    expect(granted).toBe(true);

    mockAdapter.setScenario('permission_denied');
    const denied = await speechRecognitionService.requestPermission();
    expect(denied).toBe(false);
  });

  it('dispatches successful recognition with transcript and final flag', async () => {
    mockAdapter.setScenario('success', 'WP 101/2024');

    const onResult = jest.fn();
    const onError = jest.fn();
    const onEnd = jest.fn();
    const onStart = jest.fn();

    await speechRecognitionService.startRecognition({
      language: 'en',
      onResult,
      onError,
      onEnd,
      onStart,
    });

    // Wait for mock timer
    await new Promise(resolve => setTimeout(resolve, 80));

    expect(onStart).toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: 'WP 101/2024',
        isFinal: true,
      })
    );
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });

  it('handles permission denied error scenario', async () => {
    mockAdapter.setScenario('permission_denied');

    const onResult = jest.fn();
    const onError = jest.fn();
    const onEnd = jest.fn();

    await speechRecognitionService.startRecognition({
      language: 'te',
      onResult,
      onError,
      onEnd,
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PERMISSION_DENIED',
      })
    );
    expect(onResult).not.toHaveBeenCalled();
  });

  it('handles no speech detected error scenario', async () => {
    mockAdapter.setScenario('no_speech');

    const onResult = jest.fn();
    const onError = jest.fn();
    const onEnd = jest.fn();

    await speechRecognitionService.startRecognition({
      language: 'hi',
      onResult,
      onError,
      onEnd,
    });

    await new Promise(resolve => setTimeout(resolve, 80));

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NO_SPEECH',
      })
    );
    expect(onEnd).toHaveBeenCalled();
  });

  it('handles network error scenario', async () => {
    mockAdapter.setScenario('network');

    const onResult = jest.fn();
    const onError = jest.fn();
    const onEnd = jest.fn();

    await speechRecognitionService.startRecognition({
      language: 'en',
      onResult,
      onError,
      onEnd,
    });

    await new Promise(resolve => setTimeout(resolve, 80));

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NETWORK',
      })
    );
  });

  it('handles unsupported platform error', async () => {
    mockAdapter.setScenario('not_supported');

    const onResult = jest.fn();
    const onError = jest.fn();
    const onEnd = jest.fn();

    await speechRecognitionService.startRecognition({
      language: 'en',
      onResult,
      onError,
      onEnd,
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NOT_SUPPORTED',
      })
    );
  });

  it('allows stopping and aborting active recognition', () => {
    expect(() => {
      speechRecognitionService.stopRecognition();
      speechRecognitionService.abortRecognition();
    }).not.toThrow();
  });

  it('WebSpeechAdapter handles browser environment check gracefully', () => {
    const webAdapter = new WebSpeechAdapter();
    // In Node.js / Jest test runner without SpeechRecognition on global window
    expect(typeof webAdapter.isSupported()).toBe('boolean');
    expect(() => webAdapter.stop()).not.toThrow();
    expect(() => webAdapter.abort()).not.toThrow();
  });
});
