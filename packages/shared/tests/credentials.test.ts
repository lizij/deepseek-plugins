import { describe, it, expect, vi, beforeEach } from 'vitest';
import keytar from 'keytar';
import { setKey, getKey, unsetKey, listServices } from '../src/credentials.js';

vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn(),
    getPassword: vi.fn(),
    deletePassword: vi.fn(),
    findCredentials: vi.fn(),
  },
}));

describe('credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setKey', () => {
    it('正常写入 Keychain', async () => {
      vi.mocked(keytar.setPassword).mockResolvedValue(undefined);
      await expect(setKey('test-svc', 'test-key')).resolves.toBeUndefined();
      expect(keytar.setPassword).toHaveBeenCalledWith('deepseek-plugins', 'test-svc', 'test-key');
    });

    it('keytar 异常时抛出明确错误', async () => {
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error('keychain error'));
      await expect(setKey('test-svc', 'test-key')).rejects.toThrow('Keychain 写入失败');
    });
  });

  describe('getKey', () => {
    it('正常读取', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue('test-key');
      const result = await getKey('test-svc');
      expect(result).toBe('test-key');
    });

    it('不存在时返回 null', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);
      const result = await getKey('nonexistent');
      expect(result).toBeNull();
    });

    it('keytar 异常时抛出明确错误', async () => {
      vi.mocked(keytar.getPassword).mockRejectedValue(new Error('keychain error'));
      await expect(getKey('test-svc')).rejects.toThrow('Keychain 读取失败');
    });
  });

  describe('unsetKey', () => {
    it('正常删除', async () => {
      vi.mocked(keytar.deletePassword).mockResolvedValue(true);
      await expect(unsetKey('test-svc')).resolves.toBeUndefined();
    });

    it('keytar 异常时抛出明确错误', async () => {
      vi.mocked(keytar.deletePassword).mockRejectedValue(new Error('keychain error'));
      await expect(unsetKey('test-svc')).rejects.toThrow('Keychain 删除失败');
    });
  });

  describe('listServices', () => {
    it('返回已注册的 service 列表', async () => {
      vi.mocked(keytar.findCredentials).mockResolvedValue([
        { account: 'deepseek', password: 'sk-xxx' },
        { account: 'vision', password: 'sk-yyy' },
      ]);
      const services = await listServices();
      expect(services).toEqual(['deepseek', 'vision']);
    });

    it('无凭据时返回空数组', async () => {
      vi.mocked(keytar.findCredentials).mockResolvedValue([]);
      const services = await listServices();
      expect(services).toEqual([]);
    });

    it('keytar 异常时抛出明确错误', async () => {
      vi.mocked(keytar.findCredentials).mockRejectedValue(new Error('keychain error'));
      await expect(listServices()).rejects.toThrow('Keychain 查询失败');
    });
  });
});