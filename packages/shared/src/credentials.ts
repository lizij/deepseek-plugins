import keytar from 'keytar';

/** Keychain 中统一管理所有凭据的 service 名，account 用于区分不同 key。 */
const KEYCHAIN_SERVICE = 'deepseek-plugins';

/**
 * 安全存储一条 API Key 到 macOS Keychain。
 * @param service 凭据标识，如 `deepseek`、`vision`
 */
export async function setKey(service: string, key: string): Promise<void> {
  try {
    await keytar.setPassword(KEYCHAIN_SERVICE, service, key);
  } catch (err) {
    throw new Error(
      `Keychain 写入失败 (service: ${service}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 读取指定 service 的 API Key；不存在返回 null。 */
export async function getKey(service: string): Promise<string | null> {
  try {
    return await keytar.getPassword(KEYCHAIN_SERVICE, service);
  } catch (err) {
    throw new Error(
      `Keychain 读取失败 (service: ${service}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 删除指定 service 的 API Key；不存在时静默返回。 */
export async function unsetKey(service: string): Promise<void> {
  try {
    await keytar.deletePassword(KEYCHAIN_SERVICE, service);
  } catch (err) {
    throw new Error(
      `Keychain 删除失败 (service: ${service}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 列出当前已注册的所有 service 名（不包含 key 值）。 */
export async function listServices(): Promise<string[]> {
  try {
    const creds = await keytar.findCredentials(KEYCHAIN_SERVICE);
    return creds.map((c) => c.account);
  } catch (err) {
    throw new Error(
      `Keychain 查询失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
