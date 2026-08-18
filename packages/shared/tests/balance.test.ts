import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBalance, formatBalance } from '../src/balance.js';

// Mock credentials module (balance.ts imports getKey from ./credentials.js, sources.ts imports getAllKeys)
vi.mock('../src/credentials.js', () => ({
  getKey: vi.fn(),
  getAllKeys: vi.fn(),
  updateCredentials: vi.fn(),
}));

import { getKey, getAllKeys } from '../src/credentials.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('balance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAllKeys).mockResolvedValue({});
  });

  describe('fetchBalance', () => {
    it('正常返回余额数据', async () => {
      vi.mocked(getKey).mockResolvedValue('sk-test-key');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          is_available: true,
          balance_infos: [
            {
              currency: 'CNY',
              total_balance: '100.50',
              granted_balance: '50.00',
              topped_up_balance: '50.50',
            },
          ],
        }),
      });

      const { result, error } = await fetchBalance();
      expect(error).toBeUndefined();
      expect(result).toEqual({
        isAvailable: true,
        balances: [
          {
            currency: 'CNY',
            totalBalance: '100.50',
            grantedBalance: '50.00',
            toppedUpBalance: '50.50',
          },
        ],
      });
    });

    it('未配置 API Key 时返回错误', async () => {
      vi.mocked(getKey).mockResolvedValue(null);
      const { result, error } = await fetchBalance();
      expect(result).toBeNull();
      expect(error).toContain('deepseek-plugin-cli auth set deepseek');
    });

    it('API 请求失败时返回错误', async () => {
      vi.mocked(getKey).mockResolvedValue('sk-test-key');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      const { result, error } = await fetchBalance();
      expect(result).toBeNull();
      expect(error).toContain('HTTP 403');
    });

    it('网络错误时返回错误', async () => {
      vi.mocked(getKey).mockResolvedValue('sk-test-key');
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result, error } = await fetchBalance();
      expect(result).toBeNull();
      expect(error).toContain('网络错误');
      expect(error).toContain('Network error');
    });

    it('fetch 请求使用正确的 Authorization header', async () => {
      vi.mocked(getKey).mockResolvedValue('sk-abc123');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          is_available: true,
          balance_infos: [{ currency: 'CNY', total_balance: '0', granted_balance: '0', topped_up_balance: '0' }],
        }),
      });

      await fetchBalance();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.deepseek.com/user/balance',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer sk-abc123',
            Accept: 'application/json',
          },
        }),
      );
    });
  });

  describe('formatBalance', () => {
    it('CNY 货币使用 ¥ 符号', () => {
      // parseFloat('100.50') = 100.5 >= 10 → toFixed(1)
      expect(formatBalance('100.50', 'CNY')).toBe('¥100.5');
    });

    it('USD 货币使用 $ 符号', () => {
      // parseFloat('50.25') = 50.25 >= 10 → toFixed(1)
      expect(formatBalance('50.25', 'USD')).toBe('$50.3');
    });

    it('未知货币无符号', () => {
      expect(formatBalance('100', 'EUR')).toBe('100.0');
    });

    it('大于等于 1000 时无小数', () => {
      expect(formatBalance('1234.56', 'CNY')).toBe('¥1235');
    });

    it('小于 10 时两位小数', () => {
      expect(formatBalance('5.5', 'CNY')).toBe('¥5.50');
    });

    it('非数字字符串原样返回（带符号）', () => {
      expect(formatBalance('N/A', 'CNY')).toBe('¥N/A');
    });
  });
});
