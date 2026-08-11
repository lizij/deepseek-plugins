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
