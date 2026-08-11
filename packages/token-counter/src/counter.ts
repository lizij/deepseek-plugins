// 桶文件：按职责拆分到各子模块，此处统一重新导出，保持对外 API 不变。
export * from './types.js';
export * from './storage.js';
export * from './scanner.js';
export * from './parser.js';
export * from './aggregator.js';
export * from './query.js';
