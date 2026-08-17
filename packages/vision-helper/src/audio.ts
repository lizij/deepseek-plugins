import { extname } from 'node:path';
import { normalizeToDataUri } from './normalize.js';

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
};

const FORMAT_BY_EXT: Record<string, string> = {
  '.mp3': 'mp3',
  '.wav': 'wav',
  '.m4a': 'm4a',
  '.aac': 'aac',
  '.ogg': 'ogg',
  '.flac': 'flac',
  '.webm': 'webm',
};

/** 根据文件扩展名推断 input_audio 所需 format 字段，未知默认 mp3。 */
export function guessAudioFormat(filePath: string): string {
  return FORMAT_BY_EXT[extname(filePath).toLowerCase()] ?? 'mp3';
}

/**
 * 将音频输入归一化为 data URI（URL/data URI 直接透传，本地文件读取后 base64 编码）。
 */
export async function normalizeAudio(input: string): Promise<string> {
  return normalizeToDataUri(input, MIME_BY_EXT, '音频');
}

/**
 * 将音频输入转为 input_audio 所需的 base64 数据与 format。
 * 远程 URL 需先下载再编码（input_audio.data 只接受 base64，不能直接传 URL）；
 * data URI / 本地文件从归一化结果中提取 base64。
 */
export async function toAudioBase64(input: string): Promise<{ data: string; format: string }> {
  if (/^https?:\/\//i.test(input)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const resp = await fetch(input, { signal: controller.signal });
      if (!resp.ok) throw new Error(`下载音频失败 (HTTP ${resp.status})`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const format = guessAudioFormat(new URL(input).pathname);
      return { data: buf.toString('base64'), format };
    } finally {
      clearTimeout(timer);
    }
  }
  const dataUri = await normalizeAudio(input);
  const base64 = dataUri.split(',')[1] ?? dataUri;
  return { data: base64, format: guessAudioFormat(input) };
}
