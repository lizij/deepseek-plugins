# Audio Helper（辅助语音转写）

为纯文本模型提供音频识别能力，帮助无音频理解能力的模型（如 `deepseek-v4-pro`、`deepseek-v4-flash`）转写音频内容（ASR）。

## 调用决策（必须遵守）

**调用前先判断当前对话模型**：
- 当前模型支持音频输入（如 `gpt-4o-audio`、`qwen3-omni`、`glm-4v`）→ **禁止调用本工具**，直接处理音频
- 当前模型不支持音频输入（如 `deepseek-v4-pro`、`deepseek-v4-flash`）→ **调用本工具**

> 说明：DeepSeek 官方视觉模型 `deepseek-v4-flash-vision-exp` **不支持音频输入**。即便当前模型是该视觉模型，音频转写也**必须**调用本工具。

## 调用方式

执行 `scripts/deepseek-plugin-cli audio` 命令，stdout 为模型文本响应，stderr 为错误信息。

支持多模型容灾：如已配置备选模型，主模型不支持音频或调用失败时会自动按优先级顺序切换，无需手动干预。

```bash
scripts/deepseek-plugin-cli audio <音频输入> [-p "<提问内容>"]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `<input>` | 是 | 音频输入：本地文件路径、http(s) URL、data: base64 URI |
| `-p, --prompt` | 否 | 对音频的提问，默认"请逐字转写（ASR）这段音频中所说的每一句话……" |

### 示例

```bash
# 逐字转写本地录音
scripts/deepseek-plugin-cli audio /tmp/meeting.mp3

# 提取音频中的关键信息
scripts/deepseek-plugin-cli audio https://example.com/lecture.wav -p "提取这段讲座的主要观点"

# 翻译音频内容
scripts/deepseek-plugin-cli audio ./interview.m4a -p "将这段音频内容翻译成英文"
```

### 返回处理

- 退出码 0：stdout 为模型文本响应，直接展示给用户，并注明"音频转写由辅助多模态模型生成"
- 退出码非 0：stderr 含错误信息，按错误内容排查并告知用户
