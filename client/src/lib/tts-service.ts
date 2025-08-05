// Text-to-Speech utility for EchoLearn
export class TTSService {
  private isEnabled: boolean = false;
  private synthesis: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private speakingCallbacks: Set<() => void> = new Set();

  constructor() {
    this.synthesis = window.speechSynthesis;
    
    // Load TTS preference from localStorage
    const savedPreference = localStorage.getItem('echolearn-tts-enabled');
    this.isEnabled = savedPreference === 'true';
  }

  /**
   * Speak the given text using browser TTS
   */
  speak(text: string): void {
    if (!this.isEnabled || !text.trim()) return;

    // Stop any currently speaking utterance
    this.stop();

    // Clean up text for better speech (remove markdown, etc.)
    const cleanText = this.cleanTextForSpeech(text);

    // Create new utterance
    this.currentUtterance = new SpeechSynthesisUtterance(cleanText);
    this.currentUtterance.lang = 'en-US';
    this.currentUtterance.pitch = 1;
    this.currentUtterance.rate = 1;
    this.currentUtterance.volume = 1;

    // Add event listeners
    this.currentUtterance.onend = () => {
      this.currentUtterance = null;
      this.notifySpeakingStateChange();
    };

    this.currentUtterance.onerror = (event) => {
      console.warn('TTS Error:', event.error);
      this.currentUtterance = null;
      this.notifySpeakingStateChange();
    };

    this.currentUtterance.onstart = () => {
      this.notifySpeakingStateChange();
    };

    // Speak the text
    this.synthesis.speak(this.currentUtterance);
  }

  /**
   * Stop current speech
   */
  stop(): void {
    if (this.synthesis.speaking) {
      this.synthesis.cancel();
    }
    this.currentUtterance = null;
    this.notifySpeakingStateChange();
  }

  /**
   * Enable or disable TTS
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    localStorage.setItem('echolearn-tts-enabled', enabled.toString());
    
    // Stop speaking when disabled
    if (!enabled) {
      this.stop();
    }
  }

  /**
   * Get current TTS state
   */
  getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Check if TTS is currently speaking
   */
  isSpeaking(): boolean {
    return this.synthesis.speaking;
  }

  /**
   * Add a callback for speaking state changes
   */
  onSpeakingStateChange(callback: () => void): () => void {
    this.speakingCallbacks.add(callback);
    return () => this.speakingCallbacks.delete(callback);
  }

  /**
   * Notify all callbacks about speaking state change
   */
  private notifySpeakingStateChange(): void {
    this.speakingCallbacks.forEach(callback => callback());
  }

  /**
   * Clean text for better speech synthesis
   */
  private cleanTextForSpeech(text: string): string {
    return text
      // Remove markdown formatting
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1')     // Italic
      .replace(/`(.*?)`/g, '$1')       // Code
      .replace(/#{1,6}\s/g, '')        // Headers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get available voices (for future customization)
   */
  getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.synthesis.getVoices().filter(voice => voice.lang.startsWith('en'));
  }
}

// Create singleton instance
export const ttsService = new TTSService();
