// ─── 类型定义 ───

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
}

export interface TokenEntry {
  timestamp: string;
  source: string;
  model: string;
  project: string;
  usage: TokenUsage;
}

export interface TokenBucket {
  bucket_start: string;
  source: string;
  model: string;
  project: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
  rounds: number;
}

export interface TokenBreakdownItem {
  name: string;
  tokens: number;
}

export interface TokenSummary {
  today: number;
  today_input: number;
  today_output: number;
  today_cached: number;
  today_cache_creation: number;
  today_reasoning: number;
  seven_day: number;
  all_time: number;
  updated_at: string;
  by_source: TokenBreakdownItem[];
  by_model: TokenBreakdownItem[];
}

export interface DailyReport {
  date: string;
  rounds: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

export interface ScanMeta {
  files: Record<string, { mtime: number; size: number; last_line: number; last_hash: string }>;
  last_scan: string;
}

export interface ScanResult {
  scanned: number;
  new_entries: number;
  total_buckets: number;
  sources: string[];
}
