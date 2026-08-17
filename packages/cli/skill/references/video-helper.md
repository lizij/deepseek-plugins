# Video Helper（辅助视频理解）

为纯文本模型提供辅助视频理解能力，帮助无视频理解能力的模型分析视频内容。

## 调用决策（必须遵守）

**调用前先判断当前对话模型**：
- 当前模型支持视频输入（如 `gpt-4o`、`gemini-2.0-flash`、`qwen-vl-max`）→ **禁止调用本工具**，直接处理视频
- 当前模型不支持视频输入（如 `deepseek-v4-pro`、`deepseek-v4-flash`）→ **调用本工具**

## 调用方式

执行 `scripts/deepseek-plugin-cli video` 命令，stdout 为模型文本响应，stderr 为错误信息。

支持多模型容灾：如已配置备选模型，主模型失败时会自动按优先级顺序切换，无需手动干预。

```bash
scripts/deepseek-plugin-cli video <视频输入> [-p "<提问内容>"]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `<video>` | 是 | 视频输入：本地文件路径、http(s) URL |
| `-p, --prompt` | 否 | 对视频的提问，默认"请详细描述这段视频的内容。" |

### 示例

```bash
# 描述本地视频
scripts/deepseek-plugin-cli video /tmp/demo.mp4

# 提取视频中的关键事件
scripts/deepseek-plugin-cli video https://example.com/clip.mp4 -p "这段视频中发生了什么？"
```

### 返回处理

- 退出码 0：stdout 为模型文本响应，直接展示给用户，并注明"视频描述由辅助多模态模型生成"
- 退出码非 0：stderr 含错误信息，按错误内容排查并告知用户
