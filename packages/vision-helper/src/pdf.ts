import { basename, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import { normalizeToDataUri } from './normalize.js';

const execFileAsync = promisify(execFile);

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
};

/**
 * 将 PDF 输入归一化为 data URI（URL/data URI 直接透传，本地文件读取后 base64 编码）。
 */
export async function normalizePdf(input: string): Promise<string> {
  return normalizeToDataUri(input, MIME_BY_EXT, '文档');
}

/** 从输入中提取文件名，用于 file 类型 content 的 filename 字段。 */
export function extractPdfFilename(input: string): string {
  if (/^data:/i.test(input)) {
    return 'document.pdf';
  }
  const name = basename(input);
  return name.endsWith('.pdf') ? name : `${name}.pdf`;
}

/**
 * 将本地 PDF 文件转换为 PNG 图片（每页一张），返回图片的 data URI 数组。
 * 使用 sips（macOS）或 pdftoppm（Linux）。
 */
export async function pdfToImages(pdfPath: string): Promise<string[]> {
  const tmpPrefix = `/tmp/pdf-page-${Date.now()}`;
  const images: string[] = [];

  try {
    if (process.platform === 'darwin') {
      await execFileAsync('sips', ['-s', 'format', 'png', pdfPath, '--out', `${tmpPrefix}.png`]);
      const data = await readFile(`${tmpPrefix}.png`);
      images.push(`data:image/png;base64,${data.toString('base64')}`);
    } else {
      await execFileAsync('pdftoppm', ['-png', '-r', '150', pdfPath, tmpPrefix]);
      const fs = await import('node:fs/promises');
      const files = (await fs.readdir('/tmp')).filter((f) => f.startsWith(basename(tmpPrefix)) && f.endsWith('.png')).sort();
      for (const f of files) {
        const data = await readFile(`/tmp/${f}`);
        images.push(`data:image/png;base64,${data.toString('base64')}`);
        await unlink(`/tmp/${f}`);
      }
    }
  } catch (err) {
    throw new Error(`PDF 转图片失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  return images;
}

