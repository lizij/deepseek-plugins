import { describe, it, expect } from 'vitest';
import { normalizePdf, extractPdfFilename } from '../src/pdf.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';

describe('pdf', () => {
  describe('normalizePdf', () => {
    it('http URL 直接透传', async () => {
      const url = 'https://example.com/doc.pdf';
      const result = await normalizePdf(url);
      expect(result).toBe(url);
    });

    it('data: URI 直接透传', async () => {
      const uri = 'data:application/pdf;base64,JVBERi0xLjMKJcTl8uXrp/Og0MTGCjMgMCBvYmoKPDwgL0ZpbHRlciAvRmxhdGVEZWNvZGU';
      const result = await normalizePdf(uri);
      expect(result).toBe(uri);
    });

    it('本地 PDF 文件转为 data URI', async () => {
      const tmpPath = join(tmpdir(), 'test-doc.pdf');
      const buf = Buffer.from('%PDF-1.3\n');
      await writeFile(tmpPath, buf);

      const result = await normalizePdf(tmpPath);
      expect(result).toMatch(/^data:application\/pdf;base64,/);
      await unlink(tmpPath);
    });

    it('非 PDF 扩展名抛出错误', async () => {
      const tmpPath = join(tmpdir(), 'test-doc.txt');
      await writeFile(tmpPath, Buffer.from('test'));

      await expect(normalizePdf(tmpPath)).rejects.toThrow('不支持的文档格式');
      await unlink(tmpPath);
    });
  });

  describe('extractPdfFilename', () => {
    it('data URI 返回默认文件名', () => {
      expect(extractPdfFilename('data:application/pdf;base64,abc')).toBe('document.pdf');
    });

    it('本地 .pdf 文件返回文件名', () => {
      expect(extractPdfFilename('/tmp/my-report.pdf')).toBe('my-report.pdf');
    });

    it('非 .pdf 文件追加 .pdf 后缀', () => {
      expect(extractPdfFilename('/tmp/my-report')).toBe('my-report.pdf');
    });
  });
});
