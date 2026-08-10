import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname, userInfo, platform, arch } from 'node:os';

const CONFIG_DIR = join(homedir(), '.deepseek-plugins');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.enc');

// 文件格式头：魔数(4) + 版本(1)，用于未来格式迁移时识别旧格式
const FILE_MAGIC = Buffer.from([0x44, 0x53, 0x43, 0x31]); // "DSC1"
const FILE_VERSION = 1;
const HEADER_SIZE = FILE_MAGIC.length + 1; // 5 bytes

/** 从机器指纹派生加密密钥，确保跨机器不可解密。 */
function getMachineFingerprint(): string {
  return `${hostname()}:${userInfo().username}:${platform()}:${arch()}`;
}

function deriveKey(salt: Buffer): Buffer {
  return pbkdf2Sync(getMachineFingerprint(), salt, 100000, 32, 'sha256');
}

// ─── 内存缓存：避免每次调用都重新 PBKDF2 + 解密 ───

interface CacheEntry {
  mtime: number;
  creds: Record<string, string>;
}

let cache: CacheEntry | null = null;

/** 读取凭据文件的 mtime，用于缓存失效判断。 */
function getFileMtime(): number {
  try {
    return statSync(CREDENTIALS_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

/** 读取并解密凭据文件，返回所有 service → key 的映射。带内存缓存。 */
function readCredentials(): Record<string, string> {
  const mtime = getFileMtime();

  // 缓存命中：文件未修改则直接返回缓存
  if (cache && cache.mtime === mtime) {
    return cache.creds;
  }

  if (!existsSync(CREDENTIALS_FILE)) {
    cache = { mtime, creds: {} };
    return cache.creds;
  }

  const data = readFileSync(CREDENTIALS_FILE);

  // 检测文件格式：有头部 → 新格式，无头部 → 旧格式（向后兼容）
  const hasHeader = data.length >= HEADER_SIZE &&
    data.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);

  let salt: Buffer, iv: Buffer, authTag: Buffer, encrypted: Buffer;
  if (hasHeader) {
    // 新格式: magic(4) | version(1) | salt(16) | iv(12) | authTag(16) | ciphertext
    if (data.length < HEADER_SIZE + 44) {
      cache = { mtime, creds: {} };
      return cache.creds;
    }
    const offset = HEADER_SIZE;
    salt = data.subarray(offset, offset + 16);
    iv = data.subarray(offset + 16, offset + 28);
    authTag = data.subarray(offset + 28, offset + 44);
    encrypted = data.subarray(offset + 44);
  } else {
    // 旧格式: salt(16) | iv(12) | authTag(16) | ciphertext
    if (data.length < 44) {
      cache = { mtime, creds: {} };
      return cache.creds;
    }
    salt = data.subarray(0, 16);
    iv = data.subarray(16, 28);
    authTag = data.subarray(28, 44);
    encrypted = data.subarray(44);
  }

  try {
    const key = deriveKey(salt);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const creds = JSON.parse(decrypted.toString('utf-8')) as Record<string, string>;
    cache = { mtime, creds };
    return creds;
  } catch {
    // 解密失败（机器指纹变化或文件损坏）→ 视为空
    cache = { mtime, creds: {} };
    return cache.creds;
  }
}

/** 加密并写入凭据文件。 */
function writeCredentials(creds: Record<string, string>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(creds);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const output = Buffer.concat([FILE_MAGIC, Buffer.from([FILE_VERSION]), salt, iv, authTag, encrypted]);
  writeFileSync(CREDENTIALS_FILE, output, { mode: 0o600 });

  // 写入后更新缓存
  cache = { mtime: getFileMtime(), creds };
}

/** 安全存储一条凭据到加密本地文件。 */
export async function setKey(service: string, key: string): Promise<void> {
  const creds = readCredentials();
  creds[service] = key;
  writeCredentials(creds);
}

/** 读取指定 service 的凭据；不存在返回 null。 */
export async function getKey(service: string): Promise<string | null> {
  const creds = readCredentials();
  return creds[service] ?? null;
}

/** 批量读取多个 service 的凭据，一次解密返回全部。 */
export async function getKeys(services: string[]): Promise<Record<string, string | null>> {
  const creds = readCredentials();
  const result: Record<string, string | null> = {};
  for (const s of services) {
    result[s] = creds[s] ?? null;
  }
  return result;
}

/** 读取所有已存储的凭据（service → key）。 */
export async function getAllKeys(): Promise<Record<string, string>> {
  return { ...readCredentials() };
}

/** 删除指定 service 的凭据；不存在时静默返回。 */
export async function unsetKey(service: string): Promise<void> {
  const creds = readCredentials();
  if (service in creds) {
    delete creds[service];
    if (Object.keys(creds).length === 0) {
      // 无凭据时删除文件，避免残留空文件
      try { unlinkSync(CREDENTIALS_FILE); } catch { /* ignore */ }
      cache = null;
    } else {
      writeCredentials(creds);
    }
  }
}

/** 列出当前已注册的所有 service 名（不包含 key 值）。 */
export async function listServices(): Promise<string[]> {
  return Object.keys(readCredentials());
}

/** 清除内存缓存（主要用于测试）。 */
export function clearCache(): void {
  cache = null;
}
