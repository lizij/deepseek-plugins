import { access, constants } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 兼容 CJS 和 ESM 的 __dirname 获取。 */
export function getCurrentDir(): string {
  // @ts-ignore CJS global
  if (typeof __dirname !== 'undefined') return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}

/** 检查文件是否存在。 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** 打印错误信息并以非零状态退出。 */
export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
