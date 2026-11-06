/**
 * Multilingual Speech Recognition Service supporting English, Telugu, and Hindi.
 *
 * Designed for web browsers (Web Speech API) and testing environments.
 * Strictly avoids transmitting raw microphone audio to third-party paid/unauthorized APIs.
 */

import { Platform } from 'react-native';
import type {
  ExpoSpeechRecognitionOptions,
  ExpoSpeechRecognitionResultEvent,
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

export type VoiceLanguage = 'en' | 'te' | 'hi';

export const VOICE_LANGUAGE_TAGS: Record<VoiceLanguage, string> = {
  en: 'en-IN',
  te: 'te-IN',
  hi: 'hi-IN',
};

export type VoiceErrorType =
  | 'PERMISSION_DENIED'
  | 'NOT_SUPPORTED'
  | 'NO_SPEECH'
  | 'AUDIO_CAPTURE'
  | 'NETWORK'
  | 'ABORTED'
  | 'UNKNOWN';

export interface SpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export interface SpeechRecognitionOptions {
  language: VoiceLanguage;
  continuous?: boolean;
  interimResults?: boolean;
  onResult: (result: SpeechRecognitionResult) => void;
  onError: (error: { type: VoiceErrorType; message: string }) => void;
  onEnd: () => void;
  onStart?: () => void;
}

export interface SpeechRecognitionAdapter {
  isSupported(): boolean;
  start(options: SpeechRecognitionOptions): Promise<void>;
  stop(): void;
  abort(): void;
  requestPermission?(): Promise<boolean>;
}

interface SpeechRecognitionItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultItem {
  isFinal: boolean;
  0: SpeechRecognitionItem;
}

interface NativeSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface NativeSpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface NativeSpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: NativeSpeechRecognitionEvent) => void) | null;
  onerror: ((event: NativeSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type NativeSpeechRecognitionConstructor = new () => NativeSpeechRecognitionInstance;

interface WindowWithSpeech {
  SpeechRecognition?: NativeSpeechRecognitionConstructor;
  webkitSpeechRecognition?: NativeSpeechRecognitionConstructor;
}

function getSpeechRecognitionConstructor(): NativeSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as WindowWithSpeech;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

/**
 * Standard Web Speech API Adapter (Chrome, Edge, Safari Web).
 */
export class WebSpeechAdapter implements SpeechRecognitionAdapter {
  private recognition: NativeSpeechRecognitionInstance | null = null;

  isSupported(): boolean {
    return Boolean(getSpeechRecognitionConstructor());
  }

  async requestPermission(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      }
      return true;
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          return false;
        }
      }
      return false;
    }
  }

  async start(options: SpeechRecognitionOptions): Promise<void> {
    const SpeechRecognitionClass = getSpeechRecognitionConstructor();

    if (!SpeechRecognitionClass) {
      options.onError({
        type: 'NOT_SUPPORTED',
        message: 'Speech recognition API not supported on this platform.',
      });
      return;
    }

    try {
      this.abort(); // Clean up any active session
      const recognition = new SpeechRecognitionClass();
      this.recognition = recognition;

      const langTag = VOICE_LANGUAGE_TAGS[options.language] || 'en-IN';
      recognition.lang = langTag;
      recognition.continuous = options.continuous ?? false;
      recognition.interimResults = options.interimResults ?? true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        options.onStart?.();
      };

      recognition.onresult = (event: NativeSpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        const transcript = (finalTranscript || interimTranscript).trim();
        const confidence = event.results[0]?.[0]?.confidence ?? 1.0;

        options.onResult({
          transcript,
          isFinal: Boolean(finalTranscript),
          confidence,
        });
      };

      recognition.onerror = (event: NativeSpeechRecognitionErrorEvent) => {
        let type: VoiceErrorType = 'UNKNOWN';
        const errStr = (event.error || '').toLowerCase();

        if (errStr === 'not-allowed' || errStr === 'service-not-allowed') {
          type = 'PERMISSION_DENIED';
        } else if (errStr === 'no-speech') {
          type = 'NO_SPEECH';
        } else if (errStr === 'audio-capture') {
          type = 'AUDIO_CAPTURE';
        } else if (errStr === 'network') {
          type = 'NETWORK';
        } else if (errStr === 'aborted') {
          type = 'ABORTED';
        }

        options.onError({
          type,
          message: event.message || event.error || 'Speech recognition error',
        });
      };

      recognition.onend = () => {
        options.onEnd();
      };

      recognition.start();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to start speech recognition';
      options.onError({
        type: 'UNKNOWN',
        message,
      });
    }
  }

  stop(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignored
      }
    }
  }

  abort(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignored
      }
      this.recognition = null;
    }
  }
}

export type ExpoSpeechRecognitionPackage = typeof import('expo-speech-recognition');

function getExpoSpeechRecognitionModule(): ExpoSpeechRecognitionPackage | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-speech-recognition') as ExpoSpeechRecognitionPackage;
  } catch {
    return null;
  }
}

/**
 * Native Speech Recognition Adapter using expo-speech-recognition (Android & iOS).
 * Processes speech through native OS recognizers (Google Speech Services / Apple Dictation).
 */
export class NativeSpeechAdapter implements SpeechRecognitionAdapter {
  private module: ExpoSpeechRecognitionPackage | null;
  private subscriptions: { remove: () => void }[] = [];

  constructor(customModule?: ExpoSpeechRecognitionPackage | null) {
    if (customModule !== undefined) {
      this.module = customModule;
    } else {
      this.module = getExpoSpeechRecognitionModule();
    }
  }

  isSupported(): boolean {
    try {
      if (this.module && typeof this.module.isRecognitionAvailable === 'function') {
        return Boolean(this.module.isRecognitionAvailable());
      }
      return false;
    } catch {
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      if (this.module?.ExpoSpeechRecognitionModule?.requestPermissionsAsync) {
        const response =
          await this.module.ExpoSpeechRecognitionModule.requestPermissionsAsync();
        return response.status === 'granted' || response.granted === true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async start(options: SpeechRecognitionOptions): Promise<void> {
    this.abort(); // Cancel any existing session and clean up listeners

    if (!this.isSupported() || !this.module) {
      options.onError({
        type: 'NOT_SUPPORTED',
        message:
          'Native speech recognition is not supported or available on this device.',
      });
      return;
    }

    try {
      const { ExpoSpeechRecognitionModule, addSpeechRecognitionListener } = this.module;

      if (
        !ExpoSpeechRecognitionModule ||
        typeof addSpeechRecognitionListener !== 'function'
      ) {
        throw new Error(
          'Native speech recognition module or listener function is unavailable.'
        );
      }

      // Register start listener
      const startSub = addSpeechRecognitionListener('start', () => {
        options.onStart?.();
      });
      this.subscriptions.push(startSub);

      // Register result listener
      const resultSub = addSpeechRecognitionListener(
        'result',
        (event: ExpoSpeechRecognitionResultEvent) => {
          const primary = event.results?.[0];
          const transcript = primary?.transcript?.trim() || '';
          const confidence =
            typeof primary?.confidence === 'number' && primary.confidence >= 0
              ? primary.confidence
              : 1.0;

          options.onResult({
            transcript,
            isFinal: Boolean(event.isFinal),
            confidence,
          });
        }
      );
      this.subscriptions.push(resultSub);

      // Register error listener
      const errorSub = addSpeechRecognitionListener(
        'error',
        (event: ExpoSpeechRecognitionErrorEvent) => {
          const type = this.mapErrorCode(event.error);
          options.onError({
            type,
            message: event.message || `Speech recognition error: ${event.error}`,
          });
        }
      );
      this.subscriptions.push(errorSub);

      // Register end listener
      const endSub = addSpeechRecognitionListener('end', () => {
        this.clearSubscriptions();
        options.onEnd();
      });
      this.subscriptions.push(endSub);

      const langTag = VOICE_LANGUAGE_TAGS[options.language] || 'en-IN';
      const recognitionOptions: ExpoSpeechRecognitionOptions = {
        lang: langTag,
        interimResults: options.interimResults ?? true,
        continuous: options.continuous ?? false,
        maxAlternatives: 1,
      };

      ExpoSpeechRecognitionModule.start(recognitionOptions);
    } catch (err: unknown) {
      this.clearSubscriptions();
      const message =
        err instanceof Error ? err.message : 'Failed to start native speech recognition';
      options.onError({
        type: 'UNKNOWN',
        message,
      });
    }
  }

  stop(): void {
    try {
      this.module?.ExpoSpeechRecognitionModule?.stop?.();
    } catch {
      // Ignored
    }
  }

  abort(): void {
    try {
      this.module?.ExpoSpeechRecognitionModule?.abort?.();
    } catch {
      // Ignored
    }
    this.clearSubscriptions();
  }

  private clearSubscriptions(): void {
    for (const sub of this.subscriptions) {
      try {
        sub.remove();
      } catch {
        // Ignored
      }
    }
    this.subscriptions = [];
  }

  private mapErrorCode(code: ExpoSpeechRecognitionErrorCode | string): VoiceErrorType {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'PERMISSION_DENIED';
      case 'language-not-supported':
        return 'NOT_SUPPORTED';
      case 'no-speech':
      case 'speech-timeout':
        return 'NO_SPEECH';
      case 'audio-capture':
        return 'AUDIO_CAPTURE';
      case 'network':
        return 'NETWORK';
      case 'aborted':
        return 'ABORTED';
      default:
        return 'UNKNOWN';
    }
  }
}

/**
 * Deterministic Mock Adapter for Automated Unit & Integration Testing.
 */
export class MockSpeechAdapter implements SpeechRecognitionAdapter {
  private activeScenario:
    | 'success'
    | 'permission_denied'
    | 'no_speech'
    | 'network'
    | 'not_supported' = 'success';
  private mockTranscript = 'WP 1234/2024';
  private timer: ReturnType<typeof setTimeout> | null = null;

  setScenario(
    scenario: 'success' | 'permission_denied' | 'no_speech' | 'network' | 'not_supported',
    transcript: string = 'WP 1234/2024'
  ): void {
    this.activeScenario = scenario;
    this.mockTranscript = transcript;
  }

  isSupported(): boolean {
    return this.activeScenario !== 'not_supported';
  }

  async requestPermission(): Promise<boolean> {
    return this.activeScenario !== 'permission_denied';
  }

  async start(options: SpeechRecognitionOptions): Promise<void> {
    if (this.activeScenario === 'not_supported') {
      options.onError({
        type: 'NOT_SUPPORTED',
        message: 'Speech recognition not supported in this environment.',
      });
      return;
    }

    if (this.activeScenario === 'permission_denied') {
      options.onError({
        type: 'PERMISSION_DENIED',
        message: 'Microphone permission denied.',
      });
      return;
    }

    options.onStart?.();

    if (this.activeScenario === 'no_speech') {
      this.timer = setTimeout(() => {
        this.timer = null;
        options.onError({
          type: 'NO_SPEECH',
          message: 'No speech was detected.',
        });
        options.onEnd();
      }, 50);
      return;
    }

    if (this.activeScenario === 'network') {
      this.timer = setTimeout(() => {
        this.timer = null;
        options.onError({
          type: 'NETWORK',
          message: 'Network error encountered.',
        });
        options.onEnd();
      }, 50);
      return;
    }

    // Success scenario: emit transcript
    this.timer = setTimeout(() => {
      this.timer = null;
      options.onResult({
        transcript: this.mockTranscript,
        isFinal: true,
        confidence: 0.95,
      });
      options.onEnd();
    }, 50);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  abort(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Singleton Speech Recognition Service.
 */
class SpeechRecognitionService {
  private adapter: SpeechRecognitionAdapter;
  private defaultAdapter: SpeechRecognitionAdapter;

  constructor() {
    if (Platform.OS === 'web') {
      this.defaultAdapter = new WebSpeechAdapter();
    } else {
      this.defaultAdapter = new NativeSpeechAdapter();
    }
    this.adapter = this.defaultAdapter;
  }

  setAdapter(adapter: SpeechRecognitionAdapter): void {
    this.adapter = adapter;
  }

  resetToDefaultAdapter(): void {
    this.adapter = this.defaultAdapter;
  }

  getAdapter(): SpeechRecognitionAdapter {
    return this.adapter;
  }

  isSupported(): boolean {
    return this.adapter.isSupported();
  }

  async requestPermission(): Promise<boolean> {
    if (this.adapter.requestPermission) {
      return this.adapter.requestPermission();
    }
    return true;
  }

  async startRecognition(options: SpeechRecognitionOptions): Promise<void> {
    return this.adapter.start(options);
  }

  stopRecognition(): void {
    this.adapter.stop();
  }

  abortRecognition(): void {
    this.adapter.abort();
  }
}

export const speechRecognitionService = new SpeechRecognitionService();
