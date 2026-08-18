import { createServer } from 'node:http';
import { getAllKeys, getKey, setKey } from '@deepseek-plugins/shared';
import { fetchBalanceForSource, fetchAllBalances } from '@deepseek-plugins/shared/balance';
import { fetchUsageForSource, fetchAllUsages } from '@deepseek-plugins/shared/usage';
import { fetchModelsForSource, fetchAllModels } from '@deepseek-plugins/shared/models';
import {
  loadAllSources,
  getSource,
  addSource,
  updateSource,
  removeSource,
  moveSource,
} from '@deepseek-plugins/shared/sources';
import { listProviders, isProviderSupported } from '@deepseek-plugins/shared/providers';
import {
  loadAllModels,
  setModel,
  addModel,
  removeModel,
  updateModel,
  moveModel,
} from '@deepseek-plugins/shared/multimodal-config';
import {
  scanAndAggregate,
  getSummary,
  getBuckets,
  generateDailyReport,
  type TokenSummary,
  type TokenBucket,
  type DailyReport,
} from '@deepseek-plugins/token-counter';
import { DEEPSEEK_SERVICE } from './constants.js';
import { toModelEntries } from './model-adapter.js';
import { readBody, sendHtml, sendJson } from './http-utils.js';
import type { ConfigResponse } from './types.js';

/** 启动共享后台服务，监听 127.0.0.1，返回实际端口。 */
export function startService(): Promise<number> {
  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    const host = req.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\]|\[::ffff:127\.0\.0\.1\])(:\d+)?$/.test(host)) {
      sendJson(res, 403, { error: '仅允许本机访问' });
      return;
    }

    try {
      // 健康检查（供单例探测使用）
      if (method === 'GET' && url === '/health') {
        sendJson(res, 200, { ok: true, pid: process.pid });
        return;
      }

      // GUI 页面
      if (method === 'GET' && (url === '/' || url === '/index.html')) {
        sendHtml(res);
        return;
      }

      // 读取全部配置
      if (method === 'GET' && url === '/api/config') {
        const all = await getAllKeys();
        const configs = await loadAllModels();
        const sources = await loadAllSources();
        const resp: ConfigResponse = {
          deepseekKeySet: !!all[DEEPSEEK_SERVICE],
          models: toModelEntries(configs),
          sources,
        };
        sendJson(res, 200, resp);
        return;
      }

      // 列出所有已支持的供应商
      if (method === 'GET' && url === '/api/providers') {
        const providers = listProviders().map((p) => ({
          type: p.type,
          name: p.name,
          website: p.website,
          defaultBaseUrl: p.defaultBaseUrl,
          supportedFeatures: p.supportedFeatures,
        }));
        sendJson(res, 200, { providers });
        return;
      }

      // 列出所有来源
      if (method === 'GET' && url === '/api/sources') {
        const sources = await loadAllSources();
        sendJson(res, 200, { sources });
        return;
      }

      // 新增来源
      if (method === 'POST' && url === '/api/sources') {
        const body = (await readBody(req)) as {
          id?: string;
          type?: string;
          name?: string;
          apiKey?: string;
          baseUrl?: string;
          features?: string[];
        };
        if (!body.id || !body.type || !body.apiKey) {
          sendJson(res, 400, { error: 'id / type / apiKey 均为必填' });
          return;
        }
        if (!isProviderSupported(body.type)) {
          sendJson(res, 400, { error: `不支持的供应商类型: ${body.type}` });
          return;
        }
        try {
          await addSource(body.id, body.type as any, {
            name: body.name,
            apiKey: body.apiKey,
            baseUrl: body.baseUrl,
            features: body.features as any,
          });
          sendJson(res, 200, { ok: true });
        } catch (e) {
          sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }

      // 更新指定来源
      const putSourceMatch = url.match(/^\/api\/sources\/([^/]+)$/);
      if (method === 'PUT' && putSourceMatch) {
        const id = decodeURIComponent(putSourceMatch[1]!);
        const existing = await getSource(id);
        if (!existing) {
          sendJson(res, 404, { error: '来源不存在' });
          return;
        }
        const body = (await readBody(req)) as {
          name?: string;
          apiKey?: string;
          baseUrl?: string;
          features?: string[];
        };
        const patch: { name?: string; apiKey?: string; baseUrl?: string; features?: any } = {};
        if (body.name !== undefined) patch.name = body.name;
        if (body.apiKey !== undefined && body.apiKey !== '') patch.apiKey = body.apiKey;
        if (body.baseUrl !== undefined) patch.baseUrl = body.baseUrl || undefined;
        if (body.features !== undefined) patch.features = body.features;
        try {
          await updateSource(id, patch);
          sendJson(res, 200, { ok: true });
        } catch (e) {
          sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }

      // 删除指定来源
      const delSourceMatch = url.match(/^\/api\/sources\/([^/]+)$/);
      if (method === 'DELETE' && delSourceMatch) {
        const id = decodeURIComponent(delSourceMatch[1]!);
        const ok = await removeSource(id);
        if (!ok) {
          sendJson(res, 404, { error: '来源不存在' });
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      // 移动来源
      const moveSourceMatch = url.match(/^\/api\/sources\/([^/]+)\/move$/);
      if (method === 'POST' && moveSourceMatch) {
        const id = decodeURIComponent(moveSourceMatch[1]!);
        const body = (await readBody(req)) as { dir?: number };
        if (body.dir !== -1 && body.dir !== 1) {
          sendJson(res, 400, { error: 'dir 仅支持 -1（上移）或 1（下移）' });
          return;
        }
        const ok = await moveSource(id, body.dir);
        if (!ok) {
          sendJson(res, 400, { error: '无法移动到该位置' });
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      // 读取 DeepSeek API Key（明文，仅本机访问）
      if (method === 'GET' && url === '/api/deepseek-key') {
        const apiKey = await getKey(DEEPSEEK_SERVICE);
        sendJson(res, 200, { apiKey: apiKey ?? '' });
        return;
      }

      // 设置 DeepSeek API Key
      if (method === 'PUT' && url === '/api/deepseek-key') {
        const body = (await readBody(req)) as { apiKey?: string };
        if (!body.apiKey || !body.apiKey.trim()) {
          sendJson(res, 400, { error: 'apiKey 不能为空' });
          return;
        }
        await setKey(DEEPSEEK_SERVICE, body.apiKey.trim());
        sendJson(res, 200, { ok: true });
        return;
      }

      // 新增模型
      if (method === 'POST' && url === '/api/models') {
        const body = (await readBody(req)) as { baseUrl?: string; model?: string; apiKey?: string };
        if (!body.baseUrl?.trim() || !body.model?.trim() || !body.apiKey?.trim()) {
          sendJson(res, 400, { error: 'base_url / model / apiKey 均为必填' });
          return;
        }
        const idx = await addModel(body.baseUrl.trim(), body.model.trim(), body.apiKey.trim());
        sendJson(res, 200, { ok: true, index: idx });
        return;
      }

      // 更新指定位置模型
      const putMatch = url.match(/^\/api\/models\/(\d+)$/);
      if (method === 'PUT' && putMatch) {
        const pos = parseInt(putMatch[1]!, 10);
        const configs = await loadAllModels();
        if (pos < 0 || pos >= configs.length) {
          sendJson(res, 404, { error: '模型不存在' });
          return;
        }
        const body = (await readBody(req)) as { baseUrl?: string; model?: string; apiKey?: string };
        const patch: { baseUrl?: string; model?: string; apiKey?: string } = {};
        if (body.baseUrl !== undefined) patch.baseUrl = body.baseUrl.trim();
        if (body.model !== undefined) patch.model = body.model.trim();
        if (body.apiKey !== undefined && body.apiKey !== '') patch.apiKey = body.apiKey.trim();
        await updateModel(pos, patch);
        sendJson(res, 200, { ok: true });
        return;
      }

      // 删除指定位置模型
      const delMatch = url.match(/^\/api\/models\/(\d+)$/);
      if (method === 'DELETE' && delMatch) {
        const pos = parseInt(delMatch[1]!, 10);
        const configs = await loadAllModels();
        if (pos < 0 || pos >= configs.length) {
          sendJson(res, 404, { error: '模型不存在' });
          return;
        }
        await removeModel(pos);
        sendJson(res, 200, { ok: true });
        return;
      }

      // 移动模型
      const moveMatch = url.match(/^\/api\/models\/(\d+)\/move$/);
      if (method === 'POST' && moveMatch) {
        const pos = parseInt(moveMatch[1]!, 10);
        const body = (await readBody(req)) as { dir?: number };
        if (body.dir !== -1 && body.dir !== 1) {
          sendJson(res, 400, { error: 'dir 仅支持 -1（上移）或 1（下移）' });
          return;
        }
        const ok = await moveModel(pos, body.dir);
        if (!ok) { sendJson(res, 400, { error: '无法移动到该位置' }); return; }
        sendJson(res, 200, { ok: true });
        return;
      }

      // ─── Token 端点 ───

      // 扫描 + 汇总
      if (method === 'GET' && url === '/api/token/summary') {
        await scanAndAggregate();
        const summary: TokenSummary = getSummary();
        sendJson(res, 200, summary);
        return;
      }

      // 最近桶数据
      if (method === 'GET' && url.startsWith('/api/token/buckets')) {
        const u = new URL(url, 'http://localhost');
        const parsed = parseInt(u.searchParams.get('limit') ?? '100', 10);
        const limit = Number.isNaN(parsed) ? 100 : parsed;
        const buckets: TokenBucket[] = getBuckets().slice(-limit).reverse();
        sendJson(res, 200, { buckets });
        return;
      }

      // 按日报告
      if (method === 'GET' && url.startsWith('/api/token/report')) {
        const u = new URL(url, 'http://localhost');
        const parsed = parseInt(u.searchParams.get('days') ?? '7', 10);
        const days = Number.isNaN(parsed) ? 7 : parsed;
        const report: DailyReport[] = generateDailyReport(days);
        sendJson(res, 200, { report });
        return;
      }

      // 触发扫描
      if (method === 'POST' && url === '/api/token/scan') {
        const result = await scanAndAggregate();
        sendJson(res, 200, result);
        return;
      }

      // ─── 余额端点 ───

      if (method === 'GET' && url.startsWith('/api/balance')) {
        const u = new URL(url, 'http://localhost');
        const sourceId = u.searchParams.get('source');
        if (sourceId) {
          const source = await getSource(sourceId);
          if (!source) {
            sendJson(res, 404, { error: `来源不存在: ${sourceId}` });
            return;
          }
          const result = await fetchBalanceForSource(source);
          sendJson(res, 200, [result]);
        } else {
          const results = await fetchAllBalances();
          sendJson(res, 200, results);
        }
        return;
      }

      // ─── 使用量端点 ───

      if (method === 'GET' && url.startsWith('/api/usage')) {
        const u = new URL(url, 'http://localhost');
        const sourceId = u.searchParams.get('source');
        if (sourceId) {
          const source = await getSource(sourceId);
          if (!source) {
            sendJson(res, 404, { error: `来源不存在: ${sourceId}` });
            return;
          }
          const result = await fetchUsageForSource(source);
          sendJson(res, 200, [result]);
        } else {
          const results = await fetchAllUsages();
          sendJson(res, 200, results);
        }
        return;
      }

      // ─── 来源模型列表端点 ───

      if (method === 'GET' && url.startsWith('/api/source-models')) {
        const u = new URL(url, 'http://localhost');
        const sourceId = u.searchParams.get('source');
        if (sourceId) {
          const source = await getSource(sourceId);
          if (!source) {
            sendJson(res, 404, { error: `来源不存在: ${sourceId}` });
            return;
          }
          const result = await fetchModelsForSource(source);
          sendJson(res, 200, [result]);
        } else {
          const results = await fetchAllModels();
          sendJson(res, 200, results);
        }
        return;
      }

      sendJson(res, 404, { error: 'Not Found' });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // 端口 0 = 随机可用端口；若指定端口被占用，Node 会自动报错，由调用方处理
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(port);
    });
  });
}
