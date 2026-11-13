import { formatDurationMs } from './formatTime';

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function encodePcm16Wav(samples: Float32Array, sampleRate = 16000): Uint8Array {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates an audible multi-cadence demo WAV track with gentle spoken-rhythm pulses
 * matching speaker turn markers so demo playback and Click-to-Speak seeking are genuinely audible.
 */
export function createDemoMeetingWavDataUrl(durationSec = 18): string {
  const sampleRate = 8000;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(totalSamples);
  const notes = [261.63, 293.66, 329.63, 349.23, 392.0, 329.63];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const phraseIdx = Math.floor(t / 1.5);
    const localT = t % 1.5;
    const freq = notes[phraseIdx % notes.length];
    const syllableGate =
      localT < 1.15 ? Math.sin((localT / 1.15) * Math.PI) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 3.4 * localT)) : 0.02;
    const fund = Math.sin(2 * Math.PI * freq * t);
    const harm = 0.35 * Math.sin(2 * Math.PI * freq * 1.5 * t);
    samples[i] = 0.16 * syllableGate * (fund + harm);
  }

  const wavBytes = encodePcm16Wav(samples, sampleRate);
  return `data:audio/wav;base64,${bytesToBase64(wavBytes)}`;
}

export async function convertAudioDataUrlForExport(
  sourceDataUrl: string,
  durationMs: number,
  targetFormat: 'wav' | 'mp3' | 'webm',
): Promise<{ dataUrl: string; mimeType: string; sizeBytes: number }> {
  const cleanUrl = sourceDataUrl || createDemoMeetingWavDataUrl(Math.max(4, Math.min(20, Math.round(durationMs / 1000))));

  if (targetFormat === 'webm' && cleanUrl.startsWith('data:audio/webm')) {
    const bytes = dataUrlToBytes(cleanUrl);
    return { dataUrl: cleanUrl, mimeType: 'audio/webm', sizeBytes: bytes.byteLength };
  }

  if (targetFormat === 'wav' && cleanUrl.startsWith('data:audio/wav')) {
    const bytes = dataUrlToBytes(cleanUrl);
    return { dataUrl: cleanUrl, mimeType: 'audio/wav', sizeBytes: bytes.byteLength };
  }

  // Decode via AudioContext when possible to transcode into standard 16-bit PCM WAV container
  if (typeof window !== 'undefined' && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const bytes = dataUrlToBytes(cleanUrl);
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const decoded = await ctx.decodeAudioData(ab);
      const ch0 = decoded.getChannelData(0);
      const wavBytes = encodePcm16Wav(ch0, decoded.sampleRate);
      await ctx.close().catch(() => undefined);
      const mimeType = targetFormat === 'mp3' ? 'audio/mpeg' : targetFormat === 'webm' ? 'audio/webm' : 'audio/wav';
      return {
        dataUrl: `data:${mimeType};base64,${bytesToBase64(wavBytes)}`,
        mimeType,
        sizeBytes: wavBytes.byteLength,
      };
    } catch {
      // Fallback below
    }
  }

  const bytes = dataUrlToBytes(cleanUrl);
  const mimeType = targetFormat === 'mp3' ? 'audio/mpeg' : targetFormat === 'webm' ? 'audio/webm' : 'audio/wav';
  const base64 = bytesToBase64(bytes);
  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    sizeBytes: bytes.byteLength,
  };
}

export { formatDurationMs };
