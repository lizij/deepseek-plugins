import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeImage } from '../src/vision.js';
import type { VisionConfig } from '../src/config.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock normalizeImage
vi.mock('../src/image.js', () => ({
  normalizeImage: vi.fn((input: string) => Promise.resolve(input)),
}));

const mockConfig: VisionConfig = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: 'sk-test-key',
};

describe('vision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeImage', () => {
    it('正常调用返回文本内容', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '这是一张测试图片的描述。' } }],
        }),
      });

      const text = await analyzeImage(mockConfig, {
        image: 'https://example.com/photo.png',
        prompt: '描述这张图片',
        detail: 'low',
      });
      expect(text).toBe('这是一张测试图片的描述。');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.openai.com/v1/chat/completions');
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('gpt-4o');
      expect(body.messages[0].content[0].text).toBe('描述这张图片');
      expect(body.messages[0].content[1].image_url.detail).toBe('low');
    });

    it('默认 prompt 和 detail', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '描述。' } }],
        }),
      });

      await analyzeImage(mockConfig, { image: 'https://example.com/photo.png' });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].content[0].text).toBe('请详细描述这张图片的内容。');
      expect(body.messages[0].content[1].image_url.detail).toBe('high');
    });

    it('HTTP 错误时抛出异常', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(
        analyzeImage(mockConfig, { image: 'https://example.com/photo.png' })
      ).rejects.toThrow('视觉模型请求失败 (HTTP 401)');
    });

    it('响应无内容时抛出异常', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });

      await expect(
        analyzeImage(mockConfig, { image: 'https://example.com/photo.png' })
      ).rejects.toThrow('视觉模型未返回内容');
    });

    it('baseUrl 尾部斜杠被正确去除', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' } }],
        }),
      });

      const configWithSlash = { ...mockConfig, baseUrl: 'https://api.openai.com/v1/' };
      await analyzeImage(configWithSlash, { image: 'https://example.com/photo.png' });
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    });
  });
});