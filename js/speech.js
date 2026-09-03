// js/speech.js
// Thin wrapper around the Web Speech API. This is what makes Spotigo usable
// without reading or typing: descriptions can be spoken in, and every readback
// (duplicate-check results, the confirmation summary) can be spoken out.
//
// Both SpeechRecognition and speechSynthesis are optional browser APIs and are
// absent in many test/CI environments, so every method degrades gracefully.

const hasRecognition =
  typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
const hasSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;

export function isVoiceInputSupported() {
  return !!hasRecognition;
}

export function isVoiceOutputSupported() {
  return !!hasSynthesis;
}

/**
 * Starts one-shot speech recognition. Resolves with the transcript, or rejects
 * if the API is unavailable or recognition fails/times out.
 */
export function listenOnce({ timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!hasRecognition) {
      reject(new Error("Speech recognition is not supported in this browser."));
      return;
    }
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognizer = new SpeechRecognitionImpl();
    recognizer.lang = "en-US";
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    const timer = setTimeout(() => {
      recognizer.stop();
      reject(new Error("Listening timed out."));
    }, timeoutMs);

    recognizer.onresult = (event) => {
      clearTimeout(timer);
      const transcript = event.results[0][0].transcript;
      resolve(transcript);
    };
    recognizer.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Speech recognition error: ${event.error}`));
    };
    recognizer.onend = () => clearTimeout(timer);

    recognizer.start();
  });
}

/**
 * Speaks plain text aloud. Resolves once speaking finishes (or immediately if
 * speech synthesis is unsupported — callers should still show the text visually).
 */
export function speak(text, { rate = 1, pitch = 1 } = {}) {
  return new Promise((resolve) => {
    if (!hasSynthesis || !text) {
      resolve(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (hasSynthesis) window.speechSynthesis.cancel();
}
