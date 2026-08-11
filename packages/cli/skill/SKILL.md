---
name: deepseek-plugin-skill
description: |
  当用户需要识别图片、分析图像内容、转写音频、理解 PDF 文档、查询 DeepSeek API 余额、统计 token 用量或配置多模态模型时使用此 skill。
  为 DeepSeek V4 Pro/Flash 等纯文本模型提供辅助识图、语音转写、文档理解、余额查询与 token 用量统计能力。
  通过 scripts/deepseek-plugin-cli 调用多模态模型分析图片/音频/PDF，查询 DeepSeek API 账户余额，扫描本地 agent 日志统计 token 消耗。
  支持多多模态模型容灾切换。
license: MIT
compatibility: Requires Node.js 20+, designed for Claude Code, TRAE, and other AI agents
metadata:
  version: "0.16.0"
---

# DeepSeek Plugin Skill

为 DeepSeek V4 Pro/Flash 等纯文本模型提供辅助能力集合。通过 `scripts/deepseek-plugin-cli` 调用各项子能力。

## 子能力

### 1. Vision Helper（辅助识图）

为纯文本模型补充图片识别能力，通过调用第三方多模态模型分析图片。

详见 [references/vision-helper.md](references/vision-helper.md)

### 2. Audio Helper（辅助语音转写）

为纯文本模型补充音频识别能力，通过调用第三方多模态模型转写音频内容（ASR）。

详见 [references/audio-helper.md](references/audio-helper.md)

### 3. PDF Helper（辅助文档理解）

为纯文本模型补充 PDF 文档理解能力，通过调用第三方多模态模型解析 PDF 内容。

详见 [references/pdf-helper.md](references/pdf-helper.md)

### 4. 多模态模型配置（Multimodal Config）

管理多模态模型的 base_url / model / 备选容灾配置，同一套配置同时服务 vision/audio/pdf。

```bash
scripts/deepseek-plugin-cli multimodal config --base-url <url> --model <name>   # 配置主模型
scripts/deepseek-plugin-cli multimodal fallback add --base-url <url> --model <name>  # 添加备选模型
scripts/deepseek-plugin-cli multimodal fallback list    # 列出所有模型
scripts/deepseek-plugin-cli multimodal fallback remove <index>  # 删除备选模型
```

### 5. 余额查询（Balance）

查询 DeepSeek API 账户余额。

```bash
scripts/deepseek-plugin-cli balance        # 人类可读格式
scripts/deepseek-plugin-cli balance --json # JSON 格式
```

### 6. Token 用量统计（Token Counter）

扫描本地 agent 日志（Claude Code / Codex / Cursor / opencode），按 30 分钟桶聚合 token 用量，支持按 Agent / 按 Model 拆分今日消耗。数据存储在本地 `~/.deepseek-plugins/`，无需联网。

```bash
scripts/deepseek-plugin-cli token scan              # 扫描日志并聚合到桶
scripts/deepseek-plugin-cli token today             # 今日汇总（人类可读）
scripts/deepseek-plugin-cli token today --json      # 今日汇总 JSON（含 by_source / by_model 拆分）
scripts/deepseek-plugin-cli token buckets           # 查看最近桶数据
scripts/deepseek-plugin-cli token report --days 7   # 按日用量报告
scripts/deepseek-plugin-cli token clear             # 清空所有 token 数据
```

### 7. 菜单栏应用（MenuBar）

启动原生 macOS 菜单栏应用，在菜单栏实时显示余额、可用状态和今日 token 用量（按 Agent / 按 Model 拆分），每 10 分钟自动刷新。仅支持 macOS。Swift 源码内嵌于 CLI 单文件，运行时自动编译，独立分发即可用，无需额外文件。

```bash
scripts/deepseek-plugin-cli menubar        # 启动菜单栏应用（自动编译）
scripts/deepseek-plugin-cli menubar --build # 强制重新编译
```

## 前置配置

### 环境要求

本 skill 依赖 `Node.js 20+`。首次使用前请先确认环境：

```bash
node --version  # 需 >= v20.0.0
```

若未安装 Node.js 或版本过低，请先安装/升级：https://nodejs.org

所有子能力共用 `deepseek-plugin-cli`，首次使用前需一次性配置：

### DeepSeek API Key（余额查询）

```bash
scripts/deepseek-plugin-cli auth set deepseek
```

### 多模态模型（识图/音频/PDF）

图片、音频、PDF 共用同一套多模态模型配置，配置一次即可服务所有模态：

```bash
scripts/deepseek-plugin-cli auth set vision
scripts/deepseek-plugin-cli multimodal config --base-url https://api.openai.com/v1 --model gpt-4o
```

### 多模型容灾（可选）

不同模型支持的模态可能不同（如某模型支持图片但不支持音频），容灾链会自动切换到支持当前模态的模型：

```bash
scripts/deepseek-plugin-cli multimodal fallback add --base-url https://api.anthropic.com/v1 --model claude-3-5-sonnet
scripts/deepseek-plugin-cli auth set vision.fallback.0
```

## 命令速查

```bash
scripts/deepseek-plugin-cli auth set <service>      # 设置 API Key
scripts/deepseek-plugin-cli auth list               # 列出已注册 service
scripts/deepseek-plugin-cli auth unset <service>    # 删除 API Key
scripts/deepseek-plugin-cli vision <image> [-p <prompt>] [-d low|high]  # 识图
scripts/deepseek-plugin-cli multimodal config [--base-url <url>] [--model <name>]  # 配置主多模态模型
scripts/deepseek-plugin-cli multimodal fallback add --base-url <url> --model <name>  # 添加备选模型
scripts/deepseek-plugin-cli multimodal fallback list    # 列出所有多模态模型
scripts/deepseek-plugin-cli multimodal fallback remove <index>  # 删除备选模型
scripts/deepseek-plugin-cli audio <input> [-p <prompt>]  # 音频转写（ASR）
scripts/deepseek-plugin-cli pdf <input> [-p <prompt>]    # PDF 文档理解
scripts/deepseek-plugin-cli balance [--json]        # 查询余额
scripts/deepseek-plugin-cli token scan              # 扫描 agent 日志聚合 token
scripts/deepseek-plugin-cli token today [--json]    # 今日 token 汇总（含按 Agent/Model 拆分）
scripts/deepseek-plugin-cli token buckets           # 查看桶数据
scripts/deepseek-plugin-cli token report [--days N] # 按日用量报告
scripts/deepseek-plugin-cli menubar [--build]       # 启动 macOS 菜单栏应用
scripts/deepseek-plugin-cli gui [--no-open]  # 启动/复用后台服务并打开图形化配置界面（管理 API Key / 多模态模型 / Token 用量，后台常驻）
scripts/deepseek-plugin-cli service status    # 查看后台服务运行状态
scripts/deepseek-plugin-cli service stop      # 终止后台服务
```
