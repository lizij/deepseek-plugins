# Vision Analyze Helper（辅助识图）

为纯文本模型提供辅助识图能力，帮助无视觉能力的模型（如 `deepseek-v4-pro`、`deepseek-v4-flash`）识别图片。

## 调用决策（必须遵守）

**调用前先判断当前对话模型**：
- 当前模型支持图片输入（如 `gpt-4o`、`claude-3.5-sonnet`、`gemini-2.0-flash`、`qwen-vl-max`）→ **禁止调用本工具**，直接处理图片
- 当前模型不支持图片输入（如 `deepseek-v4-pro`、`deepseek-v4-flash`）→ **调用本工具**

## 调用方式

执行 `scripts/deepseek-plugin-cli vision` 命令，stdout 为模型文本响应，stderr 为错误信息。

支持多模型容灾：如已配置备选模型，主模型失败时会自动按优先级顺序切换，无需手动干预。

```bash
scripts/deepseek-plugin-cli vision <图片输入> [-p "<提问内容>"] [-d low|high]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `<image>` | 是 | 图片输入：本地文件路径、http(s) URL、data: base64 URI |
| `-p, --prompt` | 否 | 对图片的提问，默认"请详细描述这张图片的内容。" |
| `-d, --detail` | 否 | 采样精度：`low`（更快更省 token）、`high`（更精细），默认 `high` |

### 示例

```bash
# 描述本地截图
scripts/deepseek-plugin-cli vision /tmp/screenshot.png

# 提取图片中的文字
scripts/deepseek-plugin-cli vision https://example.com/doc.png -p "提取图片中的所有文字"

# 低精度快速识别
scripts/deepseek-plugin-cli vision ./photo.jpg -d low -p "这张照片里有什么物体？"
```

### 返回处理

- 退出码 0：stdout 为模型文本响应，直接展示给用户，并注明"图片描述由辅助视觉模型生成"
- 退出码非 0：stderr 含错误信息，按错误内容排查并告知用户