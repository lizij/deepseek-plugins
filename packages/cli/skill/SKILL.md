---
name: deepseek-plugin-skill
description: |
  当用户需要识别图片、分析图像内容、查询 DeepSeek API 余额或配置视觉模型时使用此 skill。
  为 DeepSeek V4 Pro/Flash 等纯文本模型提供辅助识图与余额查询能力。
  通过 scripts/deepseek-plugin-cli 调用视觉模型分析图片，查询 DeepSeek API 账户余额。
  支持多视觉模型容灾切换。
license: MIT
compatibility: Requires Node.js 20+, designed for Claude Code, TRAE, and other AI agents
metadata:
  version: "0.3.0"
---

# DeepSeek Plugin Skill

为 DeepSeek V4 Pro/Flash 等纯文本模型提供辅助能力集合。通过 `scripts/deepseek-plugin-cli` 调用各项子能力。

## 子能力

### 1. Vision Analyze Helper（辅助识图）

为纯文本模型补充图片识别能力，通过调用第三方视觉模型分析图片。

详见 [references/vision-analyze-helper.md](references/vision-analyze-helper.md)

### 2. 余额查询（Balance）

查询 DeepSeek API 账户余额。

```bash
scripts/deepseek-plugin-cli balance        # 人类可读格式
scripts/deepseek-plugin-cli balance --json # JSON 格式
```

## 前置配置

所有子能力共用 `deepseek-plugin-cli`，首次使用前需一次性配置：

### DeepSeek API Key（余额查询）

```bash
scripts/deepseek-plugin-cli auth set deepseek
```

### 视觉模型（识图）

```bash
scripts/deepseek-plugin-cli auth set vision
scripts/deepseek-plugin-cli vision config --base-url https://api.openai.com/v1 --model gpt-4o
```

### 多模型容灾（可选）

```bash
scripts/deepseek-plugin-cli vision fallback add --base-url https://api.anthropic.com/v1 --model claude-3-5-sonnet
scripts/deepseek-plugin-cli auth set vision.fallback.0
```

## 命令速查

```bash
scripts/deepseek-plugin-cli auth set <service>      # 设置 API Key
scripts/deepseek-plugin-cli auth list               # 列出已注册 service
scripts/deepseek-plugin-cli auth unset <service>    # 删除 API Key
scripts/deepseek-plugin-cli vision <image> [-p <prompt>] [-d low|high]  # 识图
scripts/deepseek-plugin-cli vision config [--base-url <url>] [--model <name>]  # 配置主视觉模型
scripts/deepseek-plugin-cli vision fallback add --base-url <url> --model <name>  # 添加备选模型
scripts/deepseek-plugin-cli vision fallback list    # 列出所有视觉模型
scripts/deepseek-plugin-cli vision fallback remove <index>  # 删除备选模型
scripts/deepseek-plugin-cli balance [--json]        # 查询余额
```

