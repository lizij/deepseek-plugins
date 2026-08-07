import { getKey } from '@deepseek-plugins/shared';

const BALANCE_URL = 'https://api.deepseek.com/user/balance';

export interface BalanceInfo {
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
}

export interface BalanceResult {
  isAvailable: boolean;
  balances: BalanceInfo[];
}

interface ApiResponse {
  is_available: boolean;
  balance_infos: Array<{
    currency: string;
    total_balance: string;
    granted_balance: string;
    topped_up_balance: string;
  }>;
}

/** 格式化余额数值，自动选择合适的精度。 */
export function formatBalance(s: string, currency: string): string {
  const n = parseFloat(s);
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '';
  if (isNaN(n)) return `${symbol}${s}`;
  if (n >= 1000) return `${symbol}${n.toFixed(0)}`;
  if (n >= 10) return `${symbol}${n.toFixed(1)}`;
  return `${symbol}${n.toFixed(2)}`;
}

/** 获取 DeepSeek 账户余额，失败返回 null。 */
export async function fetchBalance(): Promise<{ result: BalanceResult | null; error?: string }> {
  try {
    const apiKey = await getKey('deepseek');
    if (!apiKey) {
      return { result: null, error: '未配置 API Key，请执行: deepseek-plugin-cli auth set deepseek' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const resp = await fetch(BALANCE_URL, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!resp.ok) {
      return { result: null, error: `API 请求失败 (HTTP ${resp.status})` };
    }
    const data = (await resp.json()) as ApiResponse;
    return {
      result: {
        isAvailable: data.is_available,
        balances: data.balance_infos.map((b) => ({
          currency: b.currency,
          totalBalance: b.total_balance,
          grantedBalance: b.granted_balance,
          toppedUpBalance: b.topped_up_balance,
        })),
      },
    };
  } catch (err) {
    return { result: null, error: `网络错误: ${err instanceof Error ? err.message : String(err)}` };
  }
}