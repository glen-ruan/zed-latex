# LaTeX for Zed — XeLaTeX & expl3

基于 [rzukic/zed-latex](https://github.com/rzukic/zed-latex) 的公开分支，主要改善 LaTeX 模板源码的命令识别，并提供明确的 XeLaTeX 构建入口。

## 主要调整

- 完整识别 `\sys_if_engine_xetex:TF`、`\cs:w` 等 expl3 命令，以及 `\l_`、`\g_`、`\c_`、`\q_` 开头的命名变量。
- 保留 `@` 内部命令识别，并将 `.def` 文件识别为 LaTeX。
- 保留普通公式中 `\alpha_i`、`\omega_c` 的下标识别。
- 新增 **XeLaTeX (latexmk)** 与 **XeLaTeX (latexmk, watch)** 构建任务。
- 保留上游 TexLab、补全、诊断及其他构建任务。颜色由当前 Zed 主题决定。

## 安装

本分支尚未发布到 Zed 扩展市场。开发版安装方式：

1. 克隆本仓库。
2. 按 [Zed 开发扩展说明](https://zed.dev/docs/extensions/developing-extensions) 准备 Rust 与 `wasm32-wasip2` 目标；Windows 还需要 Rust 对应的本机 C/C++ 链接工具。
3. 在 Zed 命令面板运行 `zed: install dev extension`，选择仓库根目录。

扩展 ID 仍为 `latex`，开发版将覆盖已安装的同名扩展。卸载开发版即可恢复市场版本。

## 编译文档

打开包含 `\documentclass` 的主文件，点击旁边的运行按钮，选择 **XeLaTeX (latexmk)**。编译结果输出到主文件所在目录的 `build/`。持续编译可选择 watch 任务。

需要安装 TeX Live 或其他包含 `latexmk` 与 `xelatex` 的发行版，并将其可执行文件目录加入 Zed 进程的 PATH；更改 PATH 后应完全退出并重新打开 Zed。构建任务与 TexLab 的 `build.executable` 是独立配置，后者的绝对路径不会自动应用到任务。

Windows TeX Live 路径示例：`D:\software\texlive\2026\bin\windows`。多文件项目请从主文件运行；本分支未添加自动寻找主文件的功能。

## 源码结构

- `languages/latex/`：文件类型、高亮查询、结构导航与构建任务。
- `parser/latex/`：与原扩展固定版本保持一致的解析器源码，以及 expl3 命令名修正。
- `src/`：上游 Rust 扩展与 TexLab 集成。
- `extension.toml`：扩展元数据及固定的解析器来源。

修改语法后应在 `parser/latex/` 中执行 `tree-sitter generate --abi 14`，提交生成的 `src/` 文件，并更新清单的解析器提交号。命令识别采用静态规则，不能完整模拟 TeX 动态 category code；同名控制序列在特殊宏环境中的解释仍以实际 TeX 编译结果为准。

## 来源与许可

本仓库保留上游提交历史及作者信息。所包含的 Tree-sitter LaTeX 解析器遵循 [MIT 许可证](parser/latex/LICENSE)。本次检查的上游扩展快照未提供独立 LICENSE 文件，因此本仓库不擅自为全部上游代码重新指定许可证。
