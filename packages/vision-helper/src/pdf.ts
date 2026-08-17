import { basename, extname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

/** 按文件名中的数字自然排序（page-2 排在 page-10 前）。 */
function naturalSort(a: string, b: string): number {
  const num = (s: string) => parseInt(s.match(/(\d+)(?=\.png$)/)?.[1] ?? '0', 10);
  return num(a) - num(b);
}

/**
 * 将本地 PDF 文件转换为 PNG 图片（每页一张），返回图片的 data URI 数组。
 * 优先使用 pdftoppm（Linux / macOS 均支持，多页）；macOS 无 poppler 时回退 sips（仅第一页，零依赖）。
 * 临时文件写入唯一临时目录，结束时统一清理。
 */
export async function pdfToImages(pdfPath: string): Promise<string[]> {
  // 输入文件不存在/不可读时提前失败（sips 对不存在文件会 exit 0 但无输出，需在此拦截）
  try {
    await access(pdfPath);
  } catch (err) {
    throw new Error(`PDF 转图片失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'dsp-pdf-'));
  const images: string[] = [];

  try {
    let files: string[];

    if (process.platform === 'darwin') {
      try {
        // 优先 pdftoppm（多页）
        await execFileAsync('pdftoppm', ['-png', '-r', '150', pdfPath, join(tmpDir, 'page')]);
        files = (await readdir(tmpDir)).filter((f) => f.endsWith('.png')).sort(naturalSort);
      } catch {
        // poppler 未安装，回退 sips（仅第一页，零依赖）
        await execFileAsync('sips', ['-s', 'format', 'png', pdfPath, '--out', join(tmpDir, 'page.png')]);
        files = (await readdir(tmpDir)).filter((f) => f.endsWith('.png')).sort(naturalSort);
      }
    } else {
      await execFileAsync('pdftoppm', ['-png', '-r', '150', pdfPath, join(tmpDir, 'page')]);
      files = (await readdir(tmpDir)).filter((f) => f.endsWith('.png')).sort(naturalSort);
    }

    // 转换未产出任何页面（文件已损坏/为空）时按失败处理，避免发出空请求
    if (files.length === 0) {
      throw new Error('未能生成任何页面图片（文件可能已损坏或为空）');
    }

    for (const f of files) {
      const data = await readFile(join(tmpDir, f));
      images.push(`data:image/png;base64,${data.toString('base64')}`);
    }
  } catch (err) {
    throw new Error(`PDF 转图片失败: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // 无论成功失败都清理临时目录，避免 /tmp 泄漏
    await rm(tmpDir, { recursive: true, force: true });
  }

  return images;
}
