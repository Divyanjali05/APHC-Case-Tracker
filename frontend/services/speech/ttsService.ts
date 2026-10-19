import * as Speech from 'expo-speech';

export const speechService = {
  speak(text: string, language: string = 'en'): void {
    Speech.stop();
    Speech.speak(text, {
      language: language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-IN',
      pitch: 1.0,
      rate: 0.95,
    });
  },

  stop(): void {
    Speech.stop();
  },

  async isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
  },
};
