import { execSync } from 'node:child_process';

/** Keychain 中统一管理所有凭据的 service 名，account 用于区分不同 key。 */
const KEYCHAIN_SERVICE = 'deepseek-plugins';

/**
 * 安全存储一条 API Key 到 macOS Keychain。
 * @param service 凭据标识，如 `deepseek`、`vision`
 */
export async function setKey(service: string, key: string): Promise<void> {
  try {
    execSync(
      `security add-generic-password -a '${escapeArg(service)}' -s '${escapeArg(KEYCHAIN_SERVICE)}' -w '${escapeArg(key)}' -U`,
      { stdio: 'pipe' },
    );
  } catch (err) {
    throw new Error(
      `Keychain 写入失败 (service: ${service}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 读取指定 service 的 API Key；不存在返回 null。 */
export async function getKey(service: string): Promise<string | null> {
  try {
    const out = execSync(
      `security find-generic-password -a '${escapeArg(service)}' -s '${escapeArg(KEYCHAIN_SERVICE)}' -w`,
      { stdio: 'pipe' },
    );
    return out.toString().trim() || null;
  } catch {
    return null;
  }
}

/** 删除指定 service 的 API Key；不存在时静默返回。 */
export async function unsetKey(service: string): Promise<void> {
  try {
    execSync(
      `security delete-generic-password -a '${escapeArg(service)}' -s '${escapeArg(KEYCHAIN_SERVICE)}'`,
      { stdio: 'pipe' },
    );
  } catch (err) {
    // 如果条目不存在，security 会返回非零退出码，静默忽略
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('not found') && !msg.includes('The specified item could not be found')) {
      throw new Error(
        `Keychain 删除失败 (service: ${service}): ${msg}`,
      );
    }
  }
}

/** 列出当前已注册的所有 service 名（不包含 key 值）。 */
export async function listServices(): Promise<string[]> {
  try {
    const out = execSync(
      `security find-generic-password -s '${escapeArg(KEYCHAIN_SERVICE)}' 2>&1 || true`,
      { stdio: 'pipe' },
    );
    const text = out.toString();
    // 匹配 "acct"<blob>="<account>" 模式
    const accounts: string[] = [];
    const re = /"acct"<blob>="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match[1]) accounts.push(match[1]);
    }
    return accounts;
  } catch {
    return [];
  }
}

/** 转义单引号，防止 shell 注入 */
function escapeArg(s: string): string {
  return s.replace(/'/g, "'\\''");
}