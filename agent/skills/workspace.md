---
name: "工作区"
---

# 何时使用
用户要看文件、记笔记，或准备上传前的本地路径。

# 工具
- list_workspace_files：相对路径和字节大小。
- write_workspace_note：写入 triverse- 前缀的 Markdown。不要写密钥、令牌或 .env。

路径必须留在当前工作区。拒绝 ..、绝对路径和盘符。不要读取工作区以外的文件。
