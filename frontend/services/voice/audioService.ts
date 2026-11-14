export interface AudioRecordResult {
  uri: string;
  durationSeconds: number;
  name: string;
  sizeBytes: number;
}

export type PlaybackCallback = (positionMs: number, durationMs: number) => void;

class AudioService {
  private isRecording = false;
  private isPaused = false;
  private recordStartTime = 0;
  private accumulatedDuration = 0;
  private recordInterval: ReturnType<typeof setInterval> | null = null;

  private isPlaying = false;
  private currentUri: string | null = null;
  private playbackPositionMs = 0;
  private playbackDurationMs = 0;
  private playbackInterval: ReturnType<typeof setInterval> | null = null;
  private playbackCallback: PlaybackCallback | null = null;

  async requestPermissions(): Promise<boolean> {
    // Permission request adapter
    return true;
  }

  async startRecording(): Promise<void> {
    this.isRecording = true;
    this.isPaused = false;
    this.accumulatedDuration = 0;
    this.recordStartTime = Date.now();

    if (this.recordInterval) clearInterval(this.recordInterval);
    this.recordInterval = setInterval(() => {
      if (!this.isPaused) {
        this.accumulatedDuration = (Date.now() - this.recordStartTime) / 1000;
      }
    }, 200);
  }

  async pauseRecording(): Promise<void> {
    if (this.isRecording && !this.isPaused) {
      this.isPaused = true;
      this.accumulatedDuration += (Date.now() - this.recordStartTime) / 1000;
    }
  }

  async resumeRecording(): Promise<void> {
    if (this.isRecording && this.isPaused) {
      this.isPaused = false;
      this.recordStartTime = Date.now();
    }
  }

  async stopRecording(): Promise<AudioRecordResult> {
    if (this.recordInterval) {
      clearInterval(this.recordInterval);
      this.recordInterval = null;
    }

    let finalDuration = this.accumulatedDuration;
    if (this.isRecording && !this.isPaused) {
      finalDuration += (Date.now() - this.recordStartTime) / 1000;
    }

    this.isRecording = false;
    this.isPaused = false;
    const durationSeconds = Math.max(1, Math.round(finalDuration * 10) / 10);

    const timestamp = Date.now();
    return {
      uri: `file:///data/user/0/com.aphc.lawyer/cache/rec_${timestamp}.m4a`,
      durationSeconds,
      name: `recording_${timestamp}.m4a`,
      sizeBytes: Math.round(durationSeconds * 16000), // ~16KB/s
    };
  }

  async playAudio(
    uri: string,
    durationSeconds = 30,
    onProgress?: PlaybackCallback
  ): Promise<void> {
    await this.stopAudio();

    this.currentUri = uri;
    this.isPlaying = true;
    this.playbackDurationMs = durationSeconds * 1000;
    this.playbackPositionMs = 0;
    this.playbackCallback = onProgress || null;

    if (this.playbackCallback) {
      this.playbackCallback(0, this.playbackDurationMs);
    }

    this.playbackInterval = setInterval(() => {
      if (this.isPlaying) {
        this.playbackPositionMs += 250;
        if (this.playbackPositionMs >= this.playbackDurationMs) {
          this.playbackPositionMs = this.playbackDurationMs;
          if (this.playbackCallback) {
            this.playbackCallback(this.playbackPositionMs, this.playbackDurationMs);
          }
          this.stopAudio();
        } else if (this.playbackCallback) {
          this.playbackCallback(this.playbackPositionMs, this.playbackDurationMs);
        }
      }
    }, 250);
  }

  async pauseAudio(): Promise<void> {
    this.isPlaying = false;
  }

  async resumeAudio(): Promise<void> {
    this.isPlaying = true;
  }

  async stopAudio(): Promise<void> {
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
    this.isPlaying = false;
    this.playbackPositionMs = 0;
    if (this.playbackCallback) {
      this.playbackCallback(0, this.playbackDurationMs);
    }
    this.currentUri = null;
  }

  async seekAudio(positionMs: number): Promise<void> {
    this.playbackPositionMs = Math.max(0, Math.min(positionMs, this.playbackDurationMs));
    if (this.playbackCallback) {
      this.playbackCallback(this.playbackPositionMs, this.playbackDurationMs);
    }
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }

  getIsPaused(): boolean {
    return this.isPaused;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  getCurrentUri(): string | null {
    return this.currentUri;
  }
}

export const audioService = new AudioService();

