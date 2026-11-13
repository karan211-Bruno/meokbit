import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export function isNativeRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPlatformLabel(): 'android' | 'ios' | 'web' {
  const platform = Capacitor.getPlatform();
  if (platform === 'android' || platform === 'ios') {
    return platform;
  }
  return 'web';
}

export async function exportTextArtifact(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8'
): Promise<boolean> {
  if (isNativeRuntime()) {
    try {
      const result = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: filename,
        url: result.uri,
        dialogTitle: `${filename} 내보내기`,
      });
      return true;
    } catch {
      // Fall through to browser download when native share is dismissed or unavailable
    }
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function exportDataUrlArtifact(
  filename: string,
  dataUrl: string
): Promise<boolean> {
  if (isNativeRuntime()) {
    try {
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const result = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({
        title: filename,
        url: result.uri,
        dialogTitle: `${filename} 공유`,
      });
      return true;
    } catch {
      // Fallback to browser download
    }
  }

  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}
