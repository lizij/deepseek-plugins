import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { setKey, getKey, unsetKey, listServices } from '../src/credentials.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setKey', () => {
    it('正常写入 Keychain', async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      await expect(setKey('test-svc', 'test-key')).resolves.toBeUndefined();
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("security add-generic-password"),
        expect.any(Object),
      );
    });

    it('security 命令失败时抛出明确错误', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('security error');
      });
      await expect(setKey('test-svc', 'test-key')).rejects.toThrow('Keychain 写入失败');
    });
  });

  describe('getKey', () => {
    it('正常读取', async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('test-key\n'));
      const result = await getKey('test-svc');
      expect(result).toBe('test-key');
    });

    it('不存在时返回 null', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found');
      });
      const result = await getKey('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('unsetKey', () => {
    it('正常删除', async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      await expect(unsetKey('test-svc')).resolves.toBeUndefined();
    });

    it('条目不存在时静默返回', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('The specified item could not be found');
      });
      await expect(unsetKey('test-svc')).resolves.toBeUndefined();
    });

    it('其他异常时抛出明确错误', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('permission denied');
      });
      await expect(unsetKey('test-svc')).rejects.toThrow('Keychain 删除失败');
    });
  });

  describe('listServices', () => {
    it('返回已注册的 service 列表', async () => {
      vi.mocked(execSync).mockReturnValue(
        Buffer.from('keychain: "/Users/test/Library/Keychains/login.keychain-db"\n' +
          'class: "genp"\n' +
          'attributes:\n' +
          '    0x00000007 <blob>="deepseek"\n' +
          '    "acct"<blob>="deepseek"\n' +
          '    "svce"<blob>="deepseek-plugins"\n' +
          'class: "genp"\n' +
          'attributes:\n' +
          '    "acct"<blob>="vision"\n' +
          '    "svce"<blob>="deepseek-plugins"'),
      );
      const services = await listServices();
      expect(services).toEqual(['deepseek', 'vision']);
    });

    it('无凭据时返回空数组', async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      const services = await listServices();
      expect(services).toEqual([]);
    });

    it('security 命令失败时返回空数组', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('security error');
      });
      const services = await listServices();
      expect(services).toEqual([]);
    });
  });
});