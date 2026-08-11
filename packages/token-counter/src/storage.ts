import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ScanMeta, TokenBucket } from './types.js';

export const DATA_DIR = join(homedir(), '.deepseek-plugins');
export const BUCKET_FILE = join(DATA_DIR, 'token-buckets.json');
export const SCAN_META_FILE = join(DATA_DIR, 'token-scan-meta.json');

export const BUCKET_MS = 30 * 60 * 1000;

/** 桶数据保留天数：超过该时间的桶在扫描保存时裁剪，防止文件无限膨胀 */
export const BUCKET_RETENTION_DAYS = 90;
export const RETENTION_MS = BUCKET_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// ─── 工具函数 ───

export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

export function floorToBucket(ts: number): number {
  return Math.floor(ts / BUCKET_MS) * BUCKET_MS;
}

/** 解析时间戳；无效（含缺失/非法）返回 null */
export function safeParseTime(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const ts = new Date(value as string).getTime();
  return isNaN(ts) ? null : ts;
}

export function bucketKey(bucketStart: number, source: string, model: string, project: string): string {
  return `${bucketStart}|${source}|${model}|${project}`;
}

/** FNV-1a 哈希：用于检测日志行内容变化，无需密码学安全性，计算极快。 */
export function hashLine(line: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < line.length; i++) {
    h ^= line.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── 存储：桶数据（带 mtime 内存缓存，避免频繁全量读取+反序列化） ───

interface BucketCacheEntry {
  mtime: number;
  buckets: TokenBucket[];
}

let bucketCache: BucketCacheEntry | null = null;

export function getBucketFileMtime(): number {
  try {
    return statSync(BUCKET_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

export function loadBuckets(): TokenBucket[] {
  const mtime = getBucketFileMtime();
  if (bucketCache && bucketCache.mtime === mtime) {
    return bucketCache.buckets;
  }
  if (!existsSync(BUCKET_FILE)) {
    bucketCache = { mtime, buckets: [] };
    return bucketCache.buckets;
  }
  try {
    const raw = readFileSync(BUCKET_FILE, 'utf-8');
    const buckets = raw.trim() ? (JSON.parse(raw) as TokenBucket[]) : [];
    bucketCache = { mtime, buckets };
    return buckets;
  } catch {
    bucketCache = { mtime, buckets: [] };
    return bucketCache.buckets;
  }
}

export function saveBuckets(buckets: TokenBucket[]): void {
  ensureDataDir();
  writeFileSync(BUCKET_FILE, JSON.stringify(buckets), 'utf-8');
  // 写入后更新缓存
  bucketCache = { mtime: getBucketFileMtime(), buckets };
}

export function loadScanMeta(): ScanMeta {
  if (!existsSync(SCAN_META_FILE)) return { files: {}, last_scan: '' };
  try {
    return JSON.parse(readFileSync(SCAN_META_FILE, 'utf-8')) as ScanMeta;
  } catch {
    return { files: {}, last_scan: '' };
  }
}

export function saveScanMeta(meta: ScanMeta): void {
  ensureDataDir();
  writeFileSync(SCAN_META_FILE, JSON.stringify(meta), 'utf-8');
}
