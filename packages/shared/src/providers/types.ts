/** 已支持的供应商类型（必须有对应 adapter 实现）。 */
export type ProviderType = 'deepseek' | 'opencode-zen' | 'opencode-go' | 'openrouter';

/** 功能类型。 */
export type FeatureType = 'balance' | 'usage' | 'models';

/** 余额信息。 */
export interface BalanceInfo {
  currency: string;
  totalBalance: string;
  grantedBalance?: string;
  toppedUpBalance?: string;
}

/** 余额查询结果。 */
export interface BalanceResult {
  isAvailable: boolean;
  balances: BalanceInfo[];
}

/** 单条使用量记录。 */
export interface UsageInfo {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  totalTokens?: number;
  cost?: number;
  currency?: string;
  period?: string;
}

/** 使用量查询结果。 */
export interface UsageResult {
  usage: UsageInfo[];
  totalCost?: number;
  currency?: string;
}

/** 模型信息。 */
export interface ModelInfo {
  id: string;
  ownedBy?: string;
}

/**
 * 供应商适配器接口。
 * 每个已支持的供应商实现此接口，声明自身支持的功能并提供对应实现。
 */
export interface ProviderAdapter {
  /** 供应商类型标识。 */
  type: ProviderType;
  /** 供应商显示名称。 */
  name: string;
  /** 供应商官网地址。 */
  website: string;
  /** 默认 API base URL。 */
  defaultBaseUrl: string;
  /** 该供应商技术上支持的功能列表。 */
  supportedFeatures: FeatureType[];

  /** 查询账户余额（仅当 supportedFeatures 包含 'balance' 时实现）。 */
  fetchBalance?(apiKey: string, baseUrl?: string): Promise<BalanceResult>;
  /** 查询使用量（仅当 supportedFeatures 包含 'usage' 时实现）。 */
  fetchUsage?(apiKey: string, baseUrl?: string): Promise<UsageResult>;
  /** 查询可用模型列表（仅当 supportedFeatures 包含 'models' 时实现）。 */
  fetchModels?(apiKey: string, baseUrl?: string): Promise<ModelInfo[]>;
}
