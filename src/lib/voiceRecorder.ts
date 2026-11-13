export const SUPPORTED_SPEECH_LANGUAGES = [
  { code: 'ko-KR', label: '한국어' },
  { code: 'en-US', label: 'English' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'zh-CN', label: '中文(简体)' },
  { code: 'zh-TW', label: '中文(繁體)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'vi-VN', label: 'Tiếng Việt' },
  { code: 'th-TH', label: 'ไทย' },
  { code: 'id-ID', label: 'Bahasa Indonesia' },
  { code: 'ru-RU', label: 'Русский' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'hi-IN', label: 'हिन्दी' },
];

export const TRANSLATION_TARGETS = [
  { code: 'en', label: 'English (영어)' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語 (일본어)' },
  { code: 'zh', label: '中文 (중국어)' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
];

export interface VoiceSessionController {
  stop: () => Promise<{ dataUrl: string; mimeType: string; durationMs: number }>;
  getElapsedMs: () => number;
}

export async function startSyncedVoiceSession(
  lang: string,
  onTranscript: (text: string, isFinal: boolean, offsetMs: number) => void,
  onError?: (msg: string) => void,
): Promise<VoiceSessionController> {
  const startTime = Date.now();
  let mediaRecorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  let stream: MediaStream | null = null;
  let mimeType = 'audio/webm';

  if (navigator.mediaDevices?.getUserMedia) {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const found = preferred.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
    mimeType = found || '';
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    mimeType = mediaRecorder.mimeType || mimeType || 'audio/webm';
    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    mediaRecorder.start(500);
  }

  // Concurrent Web Speech API transcription when browser/WebView supports it
  type SpeechCtor = new () => {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: (ev: {
      resultIndex: number;
      results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
    }) => void;
    onerror: (ev: { error: string }) => void;
    start: () => void;
    stop: () => void;
  };
  const win = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  const SpeechApi = win.SpeechRecognition || win.webkitSpeechRecognition;
  let recognition: InstanceType<SpeechCtor> | null = null;
  let stopped = false;

  if (SpeechApi) {
    try {
      recognition = new SpeechApi();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (ev) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const text = r[0]?.transcript?.trim();
          if (text) onTranscript(text, r.isFinal, Date.now() - startTime);
        }
      };
      recognition.onerror = (ev) => {
        if (!stopped && ev.error !== 'no-speech' && ev.error !== 'aborted') {
          onError?.(`음성 인식 알림: ${ev.error}`);
        }
      };
      recognition.start();
    } catch {
      recognition = null;
    }
  }

  return {
    getElapsedMs: () => Date.now() - startTime,
    stop: async () => {
      stopped = true;
      try {
        recognition?.stop();
      } catch {
        // ignore
      }
      const durationMs = Date.now() - startTime;
      if (!mediaRecorder) {
        return { dataUrl: '', mimeType: 'audio/webm', durationMs };
      }
      await new Promise<void>((resolve) => {
        mediaRecorder!.onstop = () => resolve();
        mediaRecorder!.stop();
      });
      stream?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mimeType });
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      return { dataUrl, mimeType, durationMs };
    },
  };
}
