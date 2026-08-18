import type { FeatureType, ProviderType } from '@deepseek-plugins/shared/providers/types';

export interface ModelEntry {
  index: number;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface SourceEntry {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  features: FeatureType[];
}

export interface ProviderInfo {
  type: ProviderType;
  name: string;
  website: string;
  defaultBaseUrl: string;
  supportedFeatures: FeatureType[];
}

export interface ConfigResponse {
  deepseekKeySet: boolean;
  models: ModelEntry[];
  sources: SourceEntry[];
}
