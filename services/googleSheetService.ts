import type { BackupData } from '../types';
import { parseBackup } from '../utils/backup';

export const saveToGoogleSheet = async (url: string, data: BackupData, signal?: AbortSignal): Promise<boolean> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'save', data: parseBackup(data) }),
    signal,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('雲端連線失敗');
  const result = await response.json();
  if (result.success !== true) throw new Error('雲端未確認保存成功');
  return true;
};

export const loadFromGoogleSheet = async (url: string, signal?: AbortSignal): Promise<BackupData | null> => {
  const target = new URL(url);
  target.searchParams.set('action', 'load');
  const response = await fetch(target.toString(), { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('雲端連線失敗');
  const result = await response.json();
  if (result.success !== true) throw new Error('雲端未確認載入成功');
  if (result.chunks !== undefined) {
    if (!Array.isArray(result.chunks) || !result.chunks.every((chunk: unknown) => typeof chunk === 'string')) throw new Error('雲端分段資料格式不正確');
    const json = result.chunks.join('');
    return json ? parseBackup(json) : null;
  }
  return result.data == null ? null : parseBackup(result.data);
};
