import { describe, it, expect } from 'vitest';
import { normalizeAudio, guessAudioFormat } from '../src/audio.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';

describe('audio', () => {
  describe('normalizeAudio', () => {
    it('http URL 直接透传', async () => {
      const url = 'https://example.com/audio.mp3';
      const result = await normalizeAudio(url);
      expect(result).toBe(url);
    });

    it('data: URI 直接透传', async () => {
      const uri = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB6ahUQRp';
      const result = await normalizeAudio(uri);
      expect(result).toBe(uri);
    });

    it('本地 MP3 文件转为 data URI', async () => {
      const tmpPath = join(tmpdir(), 'test-audio.mp3');
      const buf = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);
      await writeFile(tmpPath, buf);

      const result = await normalizeAudio(tmpPath);
      expect(result).toMatch(/^data:audio\/mpeg;base64,/);
      await unlink(tmpPath);
    });

    it('本地 WAV 文件转为 data URI', async () => {
      const tmpPath = join(tmpdir(), 'test-audio.wav');
      const buf = Buffer.from([0x52, 0x49, 0x46, 0x46]);
      await writeFile(tmpPath, buf);

      const result = await normalizeAudio(tmpPath);
      expect(result).toMatch(/^data:audio\/wav;base64,/);
      await unlink(tmpPath);
    });

    it('不支持的扩展名抛出错误', async () => {
      const tmpPath = join(tmpdir(), 'test-audio.xyz');
      await writeFile(tmpPath, Buffer.from('test'));

      await expect(normalizeAudio(tmpPath)).rejects.toThrow('不支持的音频格式');
      await unlink(tmpPath);
    });
  });

  describe('guessAudioFormat', () => {
    it('mp3 扩展名返回 mp3', () => {
      expect(guessAudioFormat('test.mp3')).toBe('mp3');
    });

    it('wav 扩展名返回 wav', () => {
      expect(guessAudioFormat('test.wav')).toBe('wav');
    });

    it('未知扩展名默认返回 mp3', () => {
      expect(guessAudioFormat('test.unknown')).toBe('mp3');
    });
  });
});
