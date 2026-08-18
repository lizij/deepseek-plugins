import { describe, it, expect } from 'vitest';
import { listProviders, getProvider, isProviderSupported } from '../src/providers/registry.js';

describe('providers', () => {
  describe('listProviders', () => {
    it('返回所有已注册的供应商', () => {
      const providers = listProviders();
      expect(providers.length).toBeGreaterThan(0);
      const types = providers.map((p) => p.type);
      expect(types).toContain('deepseek');
      expect(types).toContain('opencode-zen');
      expect(types).toContain('opencode-go');
      expect(types).toContain('openrouter');
    });
  });

  describe('getProvider', () => {
    it('返回指定类型的供应商适配器', () => {
      const p = getProvider('deepseek');
      expect(p).toBeDefined();
      expect(p!.type).toBe('deepseek');
      expect(p!.name).toBe('DeepSeek 官方');
      expect(p!.website).toBe('https://platform.deepseek.com');
    });

    it('未知类型返回 undefined', () => {
      expect(getProvider('unknown' as any)).toBeUndefined();
    });
  });

  describe('isProviderSupported', () => {
    it('已支持的供应商返回 true', () => {
      expect(isProviderSupported('deepseek')).toBe(true);
      expect(isProviderSupported('openrouter')).toBe(true);
    });

    it('未支持的供应商返回 false', () => {
      expect(isProviderSupported('unknown')).toBe(false);
    });
  });

  describe('deepseek adapter', () => {
    it('支持 balance 和 models 功能', () => {
      const p = getProvider('deepseek')!;
      expect(p.supportedFeatures).toContain('balance');
      expect(p.supportedFeatures).toContain('models');
      expect(p.fetchBalance).toBeDefined();
      expect(p.fetchModels).toBeDefined();
    });
  });

  describe('opencode-zen adapter', () => {
    it('支持 models 功能', () => {
      const p = getProvider('opencode-zen')!;
      expect(p.supportedFeatures).toContain('models');
      expect(p.fetchModels).toBeDefined();
    });
  });

  describe('opencode-go adapter', () => {
    it('支持 models 功能', () => {
      const p = getProvider('opencode-go')!;
      expect(p.supportedFeatures).toContain('models');
      expect(p.fetchModels).toBeDefined();
    });
  });

  describe('openrouter adapter', () => {
    it('支持 balance 和 models 功能', () => {
      const p = getProvider('openrouter')!;
      expect(p.supportedFeatures).toContain('balance');
      expect(p.supportedFeatures).toContain('models');
      expect(p.fetchBalance).toBeDefined();
      expect(p.fetchModels).toBeDefined();
    });
  });
});
