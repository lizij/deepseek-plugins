import { statSync } from 'node:fs';
import {
  bucketKey,
  ensureDataDir,
  floorToBucket,
  hashLine,
  loadBuckets,
  loadScanMeta,
  RETENTION_MS,
  saveBuckets,
  saveScanMeta,
} from './storage.js';
import { discoverScanTargets, readTargetLines } from './scanner.js';
import { extractProject, parseLine } from './parser.js';
import type { ScanResult, TokenBucket } from './types.js';

/** 扫描所有 agent 日志，增量解析并聚合到桶 */
export async function scanAndAggregate(): Promise<ScanResult> {
  ensureDataDir();
  const targets = await discoverScanTargets();
  const meta = loadScanMeta();
  const buckets = loadBuckets();
  const bucketMap = new Map<string, TokenBucket>();
  for (const b of buckets) {
    bucketMap.set(bucketKey(new Date(b.bucket_start).getTime(), b.source, b.model, b.project), b);
  }

  let newEntries = 0;
  const sources = new Set<string>();

  for (const target of targets) {
    sources.add(target.source);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(target.path);
    } catch {
      continue;
    }

    const cached = meta.files[target.path];
    // opencode 使用 WAL 模式，主 .db 文件 mtime/size 不随新消息更新，需每次重读
    if (target.source !== 'opencode' && cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
      continue;
    }

    let lines: string[];
    try {
      lines = await readTargetLines(target);
    } catch {
      continue;
    }

    let startLine: number;
    if (cached?.last_hash && lines.length > 0) {
      // 判断旧内容前缀是否完好：上一轮最后已处理行仍位于其在旧文件中的位置
      const oldIdx = (cached.last_line ?? 0) - 1;
      const oldLine = oldIdx >= 0 && oldIdx < lines.length ? lines[oldIdx] : undefined;
      const prefixIntact =
        oldLine !== undefined && hashLine(oldLine) === cached.last_hash;
      if (prefixIntact) {
        // 纯追加：从上次的 last_line 继续增量解析
        startLine = (cached.last_line ?? 0) > lines.length ? 0 : (cached.last_line ?? 0);
      } else {
        // 内容已变化（轮转/替换/截断）：从最后已处理行的下一行恢复，找不到则从头解析
        const idx = lines.findIndex((l) => hashLine(l) === cached.last_hash);
        startLine = idx >= 0 ? idx + 1 : 0;
      }
    } else {
      startLine = 0;
    }

    const newLines = startLine > 0 ? lines.slice(startLine) : lines;
    if (newLines.length === 0) {
      const lastLine = lines[lines.length - 1];
      meta.files[target.path] = {
        mtime: stat.mtimeMs,
        size: stat.size,
        last_line: lines.length,
        last_hash: lastLine !== undefined ? hashLine(lastLine) : (cached?.last_hash ?? ''),
      };
      continue;
    }

    const project = extractProject(target.source, target.path, lines);

    for (const line of newLines) {
      const entry = parseLine(line, target.source);
      if (!entry) continue;
      entry.project = project;

      newEntries++;

      const ts = new Date(entry.timestamp).getTime();
      const bucketStart = floorToBucket(ts);
      const key = bucketKey(bucketStart, entry.source, entry.model, entry.project);
      const existing = bucketMap.get(key);
      if (existing) {
        existing.input_tokens += entry.usage.input_tokens;
        existing.output_tokens += entry.usage.output_tokens;
        existing.cached_input_tokens += entry.usage.cached_input_tokens;
        existing.cache_creation_input_tokens += entry.usage.cache_creation_input_tokens;
        existing.reasoning_output_tokens += entry.usage.reasoning_output_tokens;
        existing.total_tokens +=
          entry.usage.input_tokens +
          entry.usage.output_tokens +
          entry.usage.cached_input_tokens +
          entry.usage.cache_creation_input_tokens +
          entry.usage.reasoning_output_tokens;
        existing.rounds += 1;
      } else {
        const total =
          entry.usage.input_tokens +
          entry.usage.output_tokens +
          entry.usage.cached_input_tokens +
          entry.usage.cache_creation_input_tokens +
          entry.usage.reasoning_output_tokens;
        bucketMap.set(key, {
          bucket_start: new Date(bucketStart).toISOString(),
          source: entry.source,
          model: entry.model,
          project: entry.project,
          input_tokens: entry.usage.input_tokens,
          output_tokens: entry.usage.output_tokens,
          cached_input_tokens: entry.usage.cached_input_tokens,
          cache_creation_input_tokens: entry.usage.cache_creation_input_tokens,
          reasoning_output_tokens: entry.usage.reasoning_output_tokens,
          total_tokens: total,
          rounds: 1,
        });
      }
    }

    const lastProcessed = lines[Math.min(startLine + newLines.length, lines.length) - 1];
    meta.files[target.path] = {
      mtime: stat.mtimeMs,
      size: stat.size,
      last_line: lines.length,
      last_hash: lastProcessed ? hashLine(lastProcessed) : (cached?.last_hash ?? ''),
    };
  }

  const cutoff = Date.now() - RETENTION_MS;
  const allBuckets = Array.from(bucketMap.values())
    .filter((b) => new Date(b.bucket_start).getTime() >= cutoff)
    .sort((a, b) => a.bucket_start.localeCompare(b.bucket_start));
  saveBuckets(allBuckets);
  meta.last_scan = new Date().toISOString();
  saveScanMeta(meta);

  return {
    scanned: targets.length,
    new_entries: newEntries,
    total_buckets: allBuckets.length,
    sources: Array.from(sources),
  };
}
