import { describe, it, expect } from 'vitest';
import { normalizeImage } from '../src/image.js';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';

describe('image', () => {
  describe('normalizeImage', () => {
    it('http URL 直接透传', async () => {
      const url = 'https://example.com/photo.png';
      const result = await normalizeImage(url);
      expect(result).toBe(url);
    });

    it('https URL 直接透传', async () => {
      const url = 'https://example.com/photo.jpg';
      const result = await normalizeImage(url);
      expect(result).toBe(url);
    });

    it('data: URI 直接透传', async () => {
      const uri = 'data:image/png;base64,iVBORw0KGgo=';
      const result = await normalizeImage(uri);
      expect(result).toBe(uri);
    });

    it('本地 PNG 文件转为 data URI', async () => {
      // 创建 1x1 像素 PNG
      const tmpPath = join(tmpdir(), 'test-vision.png');
      const pngData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      await writeFile(tmpPath, pngData);

      const result = await normalizeImage(tmpPath);
      expect(result).toMatch(/^data:image\/png;base64,/);
      await unlink(tmpPath);
    });

    it('本地 JPG 文件转为 data URI', async () => {
      const tmpPath = join(tmpdir(), 'test-vision.jpg');
      const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
      await writeFile(tmpPath, buf);

      const result = await normalizeImage(tmpPath);
      expect(result).toMatch(/^data:image\/jpeg;base64,/);
      await unlink(tmpPath);
    });

    it('不支持的扩展名抛出错误', async () => {
      const tmpPath = join(tmpdir(), 'test-vision.xyz');
      await writeFile(tmpPath, Buffer.from('test'));

      await expect(normalizeImage(tmpPath)).rejects.toThrow('不支持的图片格式');
      await unlink(tmpPath);
    });
  });
});