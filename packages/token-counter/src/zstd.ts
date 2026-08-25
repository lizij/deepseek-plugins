// ─── DeepSeek Harness 会话日志的多帧 Zstandard 解码 ───
// harness（session-persistence-jsonl）把每个 append 批次写成一个独立 Zstandard 帧，
// 首帧是 header 行，后续每追加一次快照追加一帧。单次 zstdDecompressSync 只会解出第一帧，
// 必须逐帧扫描边界后再各自解压拼接，才能得到完整逻辑日志。

import { zstdDecompressSync } from 'node:zlib';

const ZSTD_MAGIC = 0xfd2fb528;

/** 扫描拼接的 Zstandard 流的每一帧字节范围，返回所有完整帧。 */
export function scanZstdFrames(buffer: Buffer): Array<{ start: number; end: number }> {
  const frames: Array<{ start: number; end: number }> = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4 || buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      break; // 结构性不完整（EOF 截断），忽略尾部残缺帧
    }
    offset += 4;

    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 0x18) !== 0) break; // 保留位被占用，视为坏帧

    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 0x20) !== 0;
    const checksum = (descriptor & 0x04) !== 0;
    const dictionaryFlag = descriptor & 0x03;
    const contentSizeBytes = contentSizeFlag === 0
      ? (singleSegment ? 1 : 0)
      : 1 << contentSizeFlag;
    const headerBytes = (singleSegment ? 0 : 1) + (dictionaryFlag === 3 ? 4 : dictionaryFlag) + contentSizeBytes;
    if (buffer.length - offset < headerBytes) break;
    offset += headerBytes;

    for (;;) {
      if (buffer.length - offset < 3) return frames; // 帧不完整
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 0x03;
      const blockSize = blockHeader >>> 3;
      if (blockType === 0x03) return frames; // 保留块类型，视为坏帧
      const payloadBytes = blockType === 0x01 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return frames; // 帧不完整
      offset += payloadBytes;
      if (lastBlock) break;
    }

    if (checksum) {
      if (buffer.length - offset < 4) return frames;
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return frames;
}

/** 尝试解压一整个 zstd 文件（内含多帧时逐帧解压拼接）。成功返回字符串，失败返回 null。 */
export function decompressZstd(buffer: Buffer): string | null {
  try {
    const frames = scanZstdFrames(buffer);
    if (frames.length === 0) return null; // 无完整帧（非 zstd 或完全残缺）
    let out = Buffer.alloc(0);
    for (const f of frames) {
      out = Buffer.concat([out, zstdDecompressSync(buffer.subarray(f.start, f.end))]);
    }
    return out.toString('utf-8');
  } catch {
    return null;
  }
}