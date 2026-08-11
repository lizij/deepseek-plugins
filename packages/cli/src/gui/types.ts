export interface ModelEntry {
  role: 'primary' | 'fallback';
  index: number;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ConfigResponse {
  deepseekKeySet: boolean;
  models: ModelEntry[];
}
