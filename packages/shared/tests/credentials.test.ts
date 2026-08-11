import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setKey, getKey, getKeys, unsetKey, listServices, updateCredentials, clearCache } from '../src/credentials.js';

// 内存文件系统模拟
let fsStore: Record<string, Buffer> = {};
let dirs: Set<string> = new Set();

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path in fsStore) return fsStore[path];
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }),
  writeFileSync: vi.fn((path: string, data: Buffer) => {
    fsStore[path] = data;
  }),
  existsSync: vi.fn((path: string) => {
    return path in fsStore || dirs.has(path);
  }),
  mkdirSync: vi.fn((path: string) => {
    dirs.add(path);
  }),
  unlinkSync: vi.fn((path: string) => {
    delete fsStore[path];
  }),
}));

vi.mock('node:os', () => ({
  homedir: () => '/home/test',
  hostname: () => 'test-machine',
  userInfo: () => ({ username: 'testuser' }),
  platform: () => 'darwin',
  arch: () => 'arm64',
}));

describe('credentials', () => {
  beforeEach(() => {
    fsStore = {};
    dirs = new Set();
    vi.clearAllMocks();
    clearCache();
  });

  describe('setKey', () => {
    it('正常写入凭据', async () => {
      await expect(setKey('test-svc', 'test-key')).resolves.toBeUndefined();
      // 写入后应能读取
      const key = await getKey('test-svc');
      expect(key).toBe('test-key');
    });

    it('覆盖已有凭据', async () => {
      await setKey('test-svc', 'old-key');
      await setKey('test-svc', 'new-key');
      const key = await getKey('test-svc');
      expect(key).toBe('new-key');
    });

    it('多个 service 并存', async () => {
      await setKey('svc1', 'k1');
      await setKey('svc2', 'k2');
      expect(await getKey('svc1')).toBe('k1');
      expect(await getKey('svc2')).toBe('k2');
    });
  });

  describe('getKey', () => {
    it('正常读取', async () => {
      await setKey('test-svc', 'test-key');
      const result = await getKey('test-svc');
      expect(result).toBe('test-key');
    });

    it('不存在时返回 null', async () => {
      const result = await getKey('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('unsetKey', () => {
    it('正常删除', async () => {
      await setKey('test-svc', 'test-key');
      await expect(unsetKey('test-svc')).resolves.toBeUndefined();
      expect(await getKey('test-svc')).toBeNull();
    });

    it('不存在时静默返回', async () => {
      await expect(unsetKey('nonexistent')).resolves.toBeUndefined();
    });

    it('删除最后一条凭据后文件被清理', async () => {
      const { unlinkSync } = await import('node:fs');
      await setKey('test-svc', 'test-key');
      await unsetKey('test-svc');
      expect(unlinkSync).toHaveBeenCalled();
    });
  });

  describe('listServices', () => {
    it('返回已注册的 service 列表', async () => {
      await setKey('deepseek', 'k1');
      await setKey('vision', 'k2');
      const services = await listServices();
      expect(services.sort()).toEqual(['deepseek', 'vision']);
    });

    it('无凭据时返回空数组', async () => {
      const services = await listServices();
      expect(services).toEqual([]);
    });
  });

  describe('加密安全性', () => {
    it('凭据文件不包含明文 key', async () => {
      const { writeFileSync } = await import('node:fs');
      await setKey('test-svc', 'secret-api-key');
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const data = writeCall[1] as Buffer;
      expect(data.toString()).not.toContain('secret-api-key');
    });
  });

  describe('getKeys', () => {
    it('批量读取多个 service 的 key', async () => {
      await setKey('svc1', 'k1');
      await setKey('svc2', 'k2');
      const result = await getKeys(['svc1', 'svc2', 'nonexistent']);
      expect(result).toEqual({ svc1: 'k1', svc2: 'k2', nonexistent: null });
    });

    it('空数组返回空对象', async () => {
      const result = await getKeys([]);
      expect(result).toEqual({});
    });
  });

  describe('updateCredentials', () => {
    it('批量新增多个凭据（单次写入）', async () => {
      const { writeFileSync } = await import('node:fs');
      await updateCredentials((creds) => {
        creds['svc1'] = 'k1';
        creds['svc2'] = 'k2';
      });
      // 只应触发一次写入
      expect(writeFileSync).toHaveBeenCalledTimes(1);
      expect(await getKey('svc1')).toBe('k1');
      expect(await getKey('svc2')).toBe('k2');
    });

    it('批量删除凭据后清空文件', async () => {
      const { unlinkSync } = await import('node:fs');
      await setKey('svc1', 'k1');
      await updateCredentials((creds) => {
        delete creds['svc1'];
      });
      expect(unlinkSync).toHaveBeenCalled();
      expect(await getKey('svc1')).toBeNull();
    });

    it('可同时增删改', async () => {
      await setKey('svc1', 'old');
      await updateCredentials((creds) => {
        creds['svc1'] = 'new';
        creds['svc2'] = 'k2';
      });
      expect(await getKey('svc1')).toBe('new');
      expect(await getKey('svc2')).toBe('k2');
    });
  });
});