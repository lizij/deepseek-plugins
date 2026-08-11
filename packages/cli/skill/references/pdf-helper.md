# PDF Helper（辅助文档理解）

为纯文本模型提供 PDF 文档理解能力，帮助无文档解析能力的模型（如 `deepseek-v4-pro`、`deepseek-v4-flash`）读取 PDF 内容。

## 调用决策（必须遵守）

**调用前先判断当前对话模型**：
- 当前模型支持 PDF/文件输入（如 `claude-3.5-sonnet`、`gpt-4o`、`gemini-2.0-flash`）→ **禁止调用本工具**，直接处理 PDF
- 当前模型不支持 PDF 输入（如 `deepseek-v4-pro`、`deepseek-v4-flash`）→ **调用本工具**

## 调用方式

执行 `scripts/deepseek-plugin-cli pdf` 命令，stdout 为模型文本响应，stderr 为错误信息。

支持多模型容灾：如已配置备选模型，主模型不支持 PDF 或调用失败时会自动按优先级顺序切换，无需手动干预。

```bash
scripts/deepseek-plugin-cli pdf <PDF 输入> [-p "<提问内容>"]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `<input>` | 是 | PDF 输入：本地文件路径、http(s) URL、data: base64 URI |
| `-p, --prompt` | 否 | 对 PDF 文档的提问，默认"请详细描述这个 PDF 文档的内容。" |

### 示例

```bash
# 描述 PDF 文档内容
scripts/deepseek-plugin-cli pdf /tmp/report.pdf

# 提取 PDF 中的文字
scripts/deepseek-plugin-cli pdf https://example.com/paper.pdf -p "提取文档中的所有文字内容"

# 总结 PDF 要点
scripts/deepseek-plugin-cli pdf ./contract.pdf -p "总结这份合同的关键条款"
```

### 返回处理

- 退出码 0：stdout 为模型文本响应，直接展示给用户，并注明"PDF 解析由辅助多模态模型生成"
- 退出码非 0：stderr 含错误信息，按错误内容排查并告知用户
