import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname, userInfo, platform, arch } from 'node:os';

const CONFIG_DIR = join(homedir(), '.deepseek-plugins');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.enc');

/** 从机器指纹派生加密密钥，确保跨机器不可解密。 */
function getMachineFingerprint(): string {
  return `${hostname()}:${userInfo().username}:${platform()}:${arch()}`;
}

function deriveKey(salt: Buffer): Buffer {
  return pbkdf2Sync(getMachineFingerprint(), salt, 100000, 32, 'sha256');
}

/** 读取并解密凭据文件，返回所有 service → key 的映射。 */
function readCredentials(): Record<string, string> {
  if (!existsSync(CREDENTIALS_FILE)) return {};

  const data = readFileSync(CREDENTIALS_FILE);
  // 格式: salt(16) | iv(12) | authTag(16) | ciphertext
  if (data.length < 44) return {};

  const salt = data.subarray(0, 16);
  const iv = data.subarray(16, 28);
  const authTag = data.subarray(28, 44);
  const encrypted = data.subarray(44);

  try {
    const key = deriveKey(salt);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
  } catch {
    // 解密失败（机器指纹变化或文件损坏）→ 视为空
    return {};
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

  const output = Buffer.concat([salt, iv, authTag, encrypted]);
  writeFileSync(CREDENTIALS_FILE, output, { mode: 0o600 });
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

/** 删除指定 service 的凭据；不存在时静默返回。 */
export async function unsetKey(service: string): Promise<void> {
  const creds = readCredentials();
  if (service in creds) {
    delete creds[service];
    if (Object.keys(creds).length === 0) {
      // 无凭据时删除文件，避免残留空文件
      try { unlinkSync(CREDENTIALS_FILE); } catch { /* ignore */ }
    } else {
      writeCredentials(creds);
    }
  }
}

/** 列出当前已注册的所有 service 名（不包含 key 值）。 */
export async function listServices(): Promise<string[]> {
  return Object.keys(readCredentials());
}