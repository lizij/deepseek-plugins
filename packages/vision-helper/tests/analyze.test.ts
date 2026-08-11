import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyze, analyzeWithFallback, DEFAULT_PROMPT_BY_MODALITY } from '../src/vision.js';
import { isPassthroughInput, normalizeToDataUri } from '../src/normalize.js';
import type { VisionConfig } from '../src/config.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock 各模态的归一化函数，避免实际读取文件
vi.mock('../src/image.js', () => ({
  normalizeImage: vi.fn((input: string) => Promise.resolve(input)),
}));
vi.mock('../src/audio.js', () => ({
  normalizeAudio: vi.fn((input: string) => Promise.resolve(input)),
  guessAudioFormat: vi.fn(() => 'mp3'),
}));
vi.mock('../src/pdf.js', () => ({
  normalizePdf: vi.fn((input: string) => Promise.resolve(input)),
  extractPdfFilename: vi.fn(() => 'test.pdf'),
}));

const mockConfig: VisionConfig = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: 'sk-test-key',
};

describe('analyze（通用多模态）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('image 模态正常调用', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '图片描述' } }] }),
    });
    const text = await analyze(mockConfig, 'image', { input: 'https://example.com/photo.png', prompt: '描述图片' });
    expect(text).toBe('图片描述');
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.messages[0].content[1].type).toBe('image_url');
  });

  it('audio 模态正常调用', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '转写文本' } }] }),
    });
    const text = await analyze(mockConfig, 'audio', { input: 'https://example.com/audio.mp3' });
    expect(text).toBe('转写文本');
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.messages[0].content[1].type).toBe('input_audio');
  });

  it('pdf 模态正常调用', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'PDF 内容' } }] }),
    });
    const text = await analyze(mockConfig, 'pdf', { input: 'https://example.com/doc.pdf' });
    expect(text).toBe('PDF 内容');
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.messages[0].content[1].type).toBe('file');
  });

  it('使用模态默认 prompt（未提供时）', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
    });
    await analyze(mockConfig, 'audio', { input: 'https://example.com/audio.mp3' });
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.messages[0].content[0].text).toBe(DEFAULT_PROMPT_BY_MODALITY.audio);
  });

  it('HTTP 错误时抛出 MultimodalApiError', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });
    await expect(analyze(mockConfig, 'image', { input: 'https://example.com/photo.png' }))
      .rejects.toThrow('多模态模型请求失败 (HTTP 429)');
  });

  it('响应无内容时抛出异常', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ choices: [] }) });
    await expect(analyze(mockConfig, 'image', { input: 'https://example.com/photo.png' }))
      .rejects.toThrow('多模态模型未返回内容');
  });

  it('baseUrl 尾部斜杠被正确去除', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
    });
    const config = { ...mockConfig, baseUrl: 'https://api.openai.com/v1/' };
    await analyze(config, 'image', { input: 'https://example.com/photo.png' });
    expect(mockFetch.mock.calls[0]![0]).toBe('https://api.openai.com/v1/chat/completions');
  });
});

describe('analyzeWithFallback（通用容灾）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('空配置数组时抛出异常', async () => {
    await expect(analyzeWithFallback([], 'image', { input: 'x' }))
      .rejects.toThrow('未配置任何多模态模型');
  });

  it('主模型成功时直接返回，不尝试备选', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '主模型结果' } }] }),
    });
    const text = await analyzeWithFallback([mockConfig, { ...mockConfig, model: 'fb' }], 'image', { input: 'https://example.com/photo.png' });
    expect(text).toBe('主模型结果');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('主模型失败时自动切换到备选', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '备选结果' } }] }) });
    const text = await analyzeWithFallback([mockConfig, { ...mockConfig, model: 'fb' }], 'image', { input: 'https://example.com/photo.png' });
    expect(text).toBe('备选结果');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('所有模型均失败时抛出聚合错误', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(analyzeWithFallback([mockConfig, { ...mockConfig, model: 'fb' }], 'image', { input: 'https://example.com/photo.png' }))
      .rejects.toThrow('所有多模态模型均调用失败');
  });

  it('401 错误跳过剩余模型', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(analyzeWithFallback([mockConfig, { ...mockConfig, model: 'fb' }, { ...mockConfig, model: 'fb2' }], 'image', { input: 'https://example.com/photo.png' }))
      .rejects.toThrow('所有多模态模型均调用失败');
    // 只应调用一次（401 跳过剩余）
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('audio 模态容灾切换', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '音频转写' } }] }) });
    const text = await analyzeWithFallback([mockConfig, { ...mockConfig, model: 'fb' }], 'audio', { input: 'https://example.com/audio.mp3' });
    expect(text).toBe('音频转写');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('normalize 工具函数', () => {
  describe('isPassthroughInput', () => {
    it('http URL 返回 true', () => {
      expect(isPassthroughInput('http://example.com/image.png')).toBe(true);
    });

    it('https URL 返回 true', () => {
      expect(isPassthroughInput('https://example.com/image.png')).toBe(true);
    });

    it('data URI 返回 true', () => {
      expect(isPassthroughInput('data:image/png;base64,abc123')).toBe(true);
    });

    it('本地路径返回 false', () => {
      expect(isPassthroughInput('/tmp/image.png')).toBe(false);
      expect(isPassthroughInput('./image.png')).toBe(false);
      expect(isPassthroughInput('image.png')).toBe(false);
    });
  });

  describe('normalizeToDataUri', () => {
    it('URL 直接透传', async () => {
      const result = await normalizeToDataUri('https://example.com/image.png', { '.png': 'image/png' }, '图片');
      expect(result).toBe('https://example.com/image.png');
    });

    it('data URI 直接透传', async () => {
      const result = await normalizeToDataUri('data:image/png;base64,abc', { '.png': 'image/png' }, '图片');
      expect(result).toBe('data:image/png;base64,abc');
    });

    it('不支持的扩展名抛出错误', async () => {
      // 模拟一个本地文件路径（非 URL/data URI），但扩展名不在映射表中
      // 需要 mock readFile 使其不抛 ENOENT
      vi.mock('node:fs/promises', () => ({
        readFile: vi.fn(() => Promise.resolve(Buffer.from('test'))),
      }));
      await expect(normalizeToDataUri('/tmp/image.xyz', { '.png': 'image/png' }, '图片'))
        .rejects.toThrow('不支持的图片格式');
    });
  });
});
