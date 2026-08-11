import { basename } from 'node:path';
import { normalizeToDataUri } from './normalize.js';

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
