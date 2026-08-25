# Token 统计支持 DeepSeek Harness —— 可行性调研

> 状态：**已实现并测试通过**（本文档为前期调研记录 + 实现参考；当前 token-counter 已支持 `deepseek-harness` 源）
> 实现：新增 `src/zstd.ts`（多帧 zstd 解码）、`scanner.ts` 的 `findHarnessLogs`/`readHarnessLines`、`parser.ts` 的 `parseDeepseekHarnessLine`/`parseDeepseekHarnessLines`（从 `request/context` 解析 model），`aggregator.ts` 接入批量解析；CLI 版本 1.5.0。

## 1. 当前支持情况：不支持（调研时的基线，现已实现）

`packages/token-counter` 目前只支持 4 个 agent 源（扫描器 `src/scanner.ts` + 解析器 `src/parser.ts`）：

| 源 | 落盘格式 | 扫描位置 |
|---|---|---|
| `claude-code` | JSONL（assistant 消息含 `message.usage`） | `~/.claude/projects/**/*.jsonl` |
| `codex` | JSONL / LOG | `~/.codex/logs/`、`~/.config/codex/logs/` |
| `cursor` | JSONL / LOG | `~/Library/Application Support/Cursor/logs/` |
| `opencode` | SQLite（`opencode.db` 的 `message` 表） | `~/.local/share/opencode/opencode.db` |

`discoverScanTargets()` 不涉及任何 harness 路径；`parseLine()` 的 switch 分支也没有 harness。全局搜索 `harness` / `dsh-` / `deepseek-harness`，token-counter 内**零匹配**。

## 2. DeepSeek Harness 的 token 落盘机制

以下基于 `/Users/lizijian/Projects/deepseek-harness` 源码核实：

### 2.1 会话数据（可扫描的来源）

harness 提供多种持久化后端，其中对 token 统计有意义的是 **`session-persistence-jsonl`**：

```
<root>/
  --<normalized-cwd>--/          # readable 项目目录（或 _no-cwd/）
    <encoded-id>/
      session.jsonl.zstd         # 默认 zstd 压缩
      session.jsonl              # 仅当 compression: 'none'
```

- 每行是一个 `SessionEvent` JSON（或 packChunks 合并后的 chunk 行）。
- 关键点：`assistant/message` 事件内嵌 `usage?: TokenUsage`（见 `packages/core/session/src/types.ts:277`）：

  ```json
  { "type": "assistant/message", "turn": 0, "step": 1,
    "message": { "...": "..." },
    "usage": {
      "inputTokens": 123, "outputTokens": 45,
      "cacheReadTokens": 10, "cacheWriteTokens": 5, "reasoningTokens": 7
    } }
  ```

  这**与 claude-code 的 JSONL 形态高度相似**，只是 usage 字段命名不同（harness 用驼峰，token-counter 现用下划线）。

### 2.2 Token 如何被结算（两个层面混淆点）

- **`@deepseek-ai/dsh-token-meter`**：真正的计费感知服务，通过 `ctx.tokenMeter.measure()` 折叠会话日志，可注册 `tokenUsage` 投影。它把 usage 写入**分立的投影 checkpoint**（JSON checkpoint 路径），字段为 `uncachedInputTokens / outputTokens / cacheReadTokens / cacheWriteTokens`。这些 checkpoint 是聚合/估算数据，**不建议**作为统计源（偏离真实计费、形态不统一）。
- **真实计费数据**：`assistant/message.usage`（provider 上报的原生值），落在会话 JSONL 日志里。这是最贴近真实 token 用量的数据。

### 2.3 注意点

- **压缩**：默认 `.jsonl.zstd`（内嵌 Zstandard 帧），需要 `compression: 'none'` 或用内置 zstd API（Node ≥ 较新版本内置 `node:zstd`？）解压才能按行读。若部署侧开的是 zstd，token-counter 需新增 zstd 解压逻辑，否则无法直接扫描。
- **root 无默认值**：会话日志根目录是部署配置的（可 project-local / 共享 / 临时 / 集中），没有稳定的 `~/.xxx` 默认路径。**扫描路径需要配置化，或扫描已知常见目录。**
- **project 名**：目录 `--<normalized-cwd>--` 保留了可读的规范化 cwd，比 claude-code 的连字符编码更友好，可直接取项目名。
- **Node 版本**：若走 SQLite 会话后端（`session-persistence-sqlite`）而非 JSONL，会像 opencode 分支一样依赖 `node:sqlite`（Node 22.5–22.12 需 `--experimental-sqlite`）。

## 3. 三条可行路线对比

| 路线 | 数据源 | 优点 | 缺点 | 可信度 |
|---|---|---|---|---|
| **A. 扫描会话 JSONL 日志**（推荐） | `assistant/message.usage` | 与 claude-code 解析器结构类似，改动最小；provider 原生计费最准 | 需新解 source；可能需处理 zstd 压缩；root 需配置化 | ★★★★★ |
| B. 扫描 token-meter 投影 checkpoint | token-meter 落盘的 JSON checkpoint | 形态简单、无需解压 | 是聚合/估算值，非逐次明细；字段为投影专用，偏离原生 usage；多文件散落 | ★★★ |
| C. 读会话 SQLite 库的 usage 事件 | `session-persistence-sqlite` | 一条 DB 查询可能拿到全部 | 事件压缩/打包；依赖 node:sqlite 版本；性能与并发处理较复杂 | ★★★☆ |

## 4. 推荐实现方案（A 路线）

在 `packages/token-counter` 新增一个 source（如 `deepseek-harness`）：

1. **scanner.ts**：新增 `findHarnessLogs()`，扫描配置的 `root`（`--<cwd>--/<id>/session.jsonl(.zstd)`）。路径做成可选配置，或扫描常见位置（如 `~/.deepseek-harness/`、工作区 `.dsh/`）。若命中 `.jsonl.zstd`，用内置 zstd 解码帧后取逻辑行。
2. **parser.ts**：新增 `parseDeepseekHarnessLine()`，识别 `type === 'assistant/message'` 且有 `usage` 的事件，做字段映射：

   ```
   inputTokens            -> input_tokens
   outputTokens           -> output_tokens
   cacheReadTokens        -> cached_input_tokens
   cacheWriteTokens       -> cache_creation_input_tokens
   reasoningTokens        -> reasoning_output_tokens
   ```

   时间戳取事件自带时间（JSONL header 里的 `createdAt` 或事件时间戳）。
3. **types.ts**：无需改结构（token-counter 的 `TokenUsage` 已是 `_tokens` 下划线命名，映射即可）。

## 5. 实测确认（本机 deepseek-plugins 工作区已验证）

在真实 harness 环境核实了上文的两个待确认问题，均已落实：

### 5.1 数据目录（root）位置
harness 数据根目录是 `~/.dsh/`：

```
~/.dsh/
├── settings.yaml                        # 模型/供应商等配置
├── storages/                            # 工作区 → 会话 id 索引（workspace.json）
├── sessions/
│   └── --<规范化cwd缩写>--/              # 每个项目一个目录（replace 连字符连写）
│       ├── session-<id>/session.jsonl.zstd
│       └── ...
```

- 每个会话一个目录，内含单个日志文件 `session.jsonl.zstd`。
- 目录名 `--<cwd>--` 保留了可读项目路径，可直接作为 project 名（比 claude-code 的连字符编码更友好）。

### 5.2 压缩默认就是 zstd，且是"多帧拼接"
- 本机所有会话都是 `.jsonl.zstd`，`compression:'none'` 的 raw `.jsonl` 不存在。
- magic 字节 `28 b5 2f fd` = Zstandard。
- **关键坑：不是单帧**——`zstdDecompressSync(buf)` / `createZstdDecompress` 单次都只解出第一帧（仅 header 行 `{type:'session',...}`,约 200 字节）。文件是"每追加批次一帧"的拼接流（README: *one checksummed frame per durable append batch*），**必须逐帧扫描 + 各自解压再拼接**成完整逻辑日志。
- 帧定位算法见 harness `packages/session/session-persistence-jsonl/src/zstd.ts` 的 `scanZstdFrames`（按 magic + frame descriptor 计算帧边界）。
- Node 22.22+ 内置 `node:zlib` zstd API（`zstdDecompressSync`），**无需第三方依赖**。

### 5.3 token 数据实际结构（已解压真实会话验证）
解压后是 `SessionEvent` JSON 行。usage 事件内嵌于 `assistant/message`：

```json
{ "type": "assistant/message", "seq": 1675, "time": 1787639733089,
  "data": { "turn": 2, "step": 13,
    "message": { "role": "assistant", "content": [ ... ] },
    "usage": { "inputTokens": 24796, "outputTokens": 161,
               "cacheReadTokens": 24576 } } }
```

- usage 是分层荷马 `data.usage`（**不在顶层**），字段为驼峰：`inputTokens / outputTokens / cacheReadTokens? / cacheWriteTokens? / reasoningTokens?`。
- 时间戳在事件顶层 `time`（**毫秒数字**）。
- 这是 provider 上报的**原生精确计费**（实测真实值）。
- 注意事件里 `assistant/message` 的 usage 是可选字段（adapter 未报计费时 absence），解析器需兼容。

## 6. 工作量与风险

- **改动面**：需要 3 个文件 + 测试——`scanner.ts`（新增 `findHarnessLogs` + `discoverScanTargets` 路由 + `readTargetLines` 解压）、`parser.ts`（新增 `parseDeepseekHarnessLine` + `parseLine` 路由 + `extractProject` 支持 harness 路径）、新增一个 zstd 多帧解码模块、以及单元测试。
- **低风险**：现有源逻辑不变；新 source 是纯增量。
- **bootstrap 探测**：扫描位置默认 `~/.dsh/sessions/`（实测根目录），无需用户配置。
- **容错**：若当前 Node 版本无内置 zstd，输出一次性警告并跳过（同 opencode 的 `node:sqlite` 处理），避免数据静默缺失。

## 7. 实现建议汇总

1. `scanner.ts` 新增 `findHarnessLogs()`：递归扫 `~/.dsh/sessions/`，命中 `session.jsonl.zstd`（或 `session.jsonl`）作为 target，source=`deepseek-harness`。
2. 新增 zstd 多帧解码（复刻 `scanZstdFrames` + 逐帧 `zstdDecompressSync`），在 `readTargetLines` 中对 harness 解压后按行返回。增量扫描依赖稳定行序列——JSONL append-only 保证追加帧只在文件末尾，`last_line`/`last_hash` 增量逻辑天然兼容。
3. `parser.ts` 新增 `parseDeepseekHarnessLine()`：识别 `assistant/message` 且 `data.usage` 存在的事件，做驼峰→下划线字段映射，时间戳用顶层 `time`。
4. `extractProject` 支持 harness：从路径 `sessions/--<cwd>--/<id>/` 提取 cwd basename。
5. 复用现有聚合/存储/查询流程，无需改动 aggregator/counter 主流程。