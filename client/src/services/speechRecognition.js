/**
 * Web Speech API Service for Real-Time Speech-to-Text Transcription
 * Utilizes window.webkitSpeechRecognition / window.SpeechRecognition
 */

class SpeechToTextService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSupported = false;
    this.onCaptionCallback = null;
    this.onErrorCallback = null;
    this.lang = 'en-US';

    this.init();
  }

  init() {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (SpeechRecognition) {
      this.isSupported = true;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.lang;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const transcriptText = result[0].transcript;
          const confidence = result[0].confidence || 1.0;

          if (result.isFinal) {
            finalTranscript += transcriptText;
            if (this.onCaptionCallback && finalTranscript.trim()) {
              this.onCaptionCallback({
                text: finalTranscript.trim(),
                isFinal: true,
                confidence,
                timestamp: new Date(),
              });
            }
          } else {
            interimTranscript += transcriptText;
          }
        }

        // Send interim transcript for instant live sub-second caption preview
        if (interimTranscript.trim() && this.onCaptionCallback) {
          this.onCaptionCallback({
            text: interimTranscript.trim(),
            isFinal: false,
            confidence: 0.8,
            timestamp: new Date(),
          });
        }
      };

      this.recognition.onerror = (event) => {
        // 'no-speech' is expected during silent intervals
        if (event.error === 'no-speech') {
          return;
        }

        console.warn('[STT] Speech recognition warning/error:', event.error);
        if (this.onErrorCallback) {
          this.onErrorCallback(event.error);
        }
      };

      this.recognition.onend = () => {
        // Automatically restart if still active (Web Speech API pauses on brief silences)
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch {
            // Already active or restarting
          }
        }
      };
    } else {
      this.isSupported = false;
      console.warn('[STT] Web Speech API is not supported in this browser.');
    }
  }

  setLanguage(lang) {
    this.lang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  onCaption(callback) {
    this.onCaptionCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }

  start() {
    if (!this.isSupported || !this.recognition) {
      return false;
    }

    if (!this.isListening) {
      try {
        this.isListening = true;
        this.recognition.start();
        return true;
      } catch (err) {
        console.warn('[STT] Could not start speech recognition:', err.message);
        this.isListening = false;
        return false;
      }
    }
    return true;
  }

  stop() {
    if (this.recognition && this.isListening) {
      this.isListening = false;
      try {
        this.recognition.stop();
      } catch (err) {
        console.warn('[STT] Could not stop speech recognition:', err.message);
      }
    }
  }

  destroy() {
    this.stop();
    this.recognition = null;
    this.onCaptionCallback = null;
    this.onErrorCallback = null;
  }
}

export default SpeechToTextService;
