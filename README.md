# LaTeX Workshop for Zed

基于 [rzukic/zed-latex](https://github.com/rzukic/zed-latex)，参照 [LaTeX Workshop](https://github.com/James-Yu/LaTeX-Workshop) 的编辑与编译工作流。使用 Zed 原生语言功能和独立 Node 语言服务，不依赖 TexLab。当前不实现 PDF 预览或 SyncTeX 联动。

## 当前实现

| 功能 | 实现 |
| --- | --- |
| 语法、高亮、折叠、缩进、结构导航 | Tree-sitter 查询，含 expl3、`@` 命令、数学下标；章节、公式、图表标题和标签的大纲；LSP 提供层级符号及跨文件搜索 |
| 代码片段 | `env/sec/subsec/fig/eq/itemize/cite/ref/input`，环境名共享占位符 |
| 补全和定义跳转 | 项目标签、BibTeX 引用、自定义命令和环境，常用命令、环境与输入文件 |
| 查找引用、重命名 | 项目内标签和 BibTeX 引用键，通过标准 LSP 编辑返回修改 |
| 主文件识别 | `% !TeX root`、`\documentclass` 与 input/include/subfile/import、bibliography/addbibresource 依赖；歧义时提示指定主文件 |
| 编译 recipes | 按顺序执行 tools，支持 args、env、cwd；默认 XeLaTeX + latexmk，输出到 `build` |
| 编译诊断 | 文件行号错误、常见警告；实时检查花括号和环境配对 |
| 自动编译 | `never/onSave/onFileChange`，防抖与同一主文件串行编译；监测已识别的依赖文件 |
| 格式化 | 内置 BibTeX 基础格式化；LaTeX 可选 latexindent 或 tex-fmt，默认关闭 |
| `.bst` | 独立 Tree-sitter 解析器，提供注释、字符串、数字、函数、控制词和内置操作高亮，以及函数导航、折叠；不交给 TeX 服务 |

这是按 Workshop 行为重建的实现，不是完整运行 VS Code 插件。当前补全集合小于 Workshop 的包数据库；复杂动态宏、跨文件 outline 树、自定义命令重命名、完整辅助文件清理规则、完整 BibTeX 格式化选项及所有 Workshop 命令尚未实现。格式化器和 TeX 编译器是外部工具。

## 安装

1. 按 [Rust 官方安装说明](https://rust-lang.org/tools/install/)安装 rustup；确认普通终端能运行 `rustc --version` 和 `cargo --version`。Windows 需要 Visual Studio C++ 工具集。仓库的 `rust-toolchain.toml` 声明 stable 与 `wasm32-wasip2`。
2. Zed 执行 `zed: install dev extension`，选择本仓库。扩展 ID 保持 `latex`，开发版会覆盖同名市场扩展。
3. 把 TeX Live 的工具目录加入 **Zed 进程的 PATH**，完全退出后重开。至少需要 `latexmk`、`xelatex`，参考文献按项目使用 BibTeX 或 Biber。

语言服务脚本嵌入扩展 WASM，不需要 npm 安装依赖。优先使用 PATH 上的 Node，缺少时使用 Zed 管理的 Node。已有 `lsp.texlab` 设置不会配置本服务；请使用 `lsp.latex-workshop.settings`。

```json
{
  "languages": {
    "LaTeX": { "language_servers": ["latex-workshop"] },
    "BibTeX": { "language_servers": ["latex-workshop"] }
  },
  "lsp": {
    "latex-workshop": {
      "settings": {
        "latex.autoBuild.run": "onSave",
        "latex.outDir": "build",
        "latex.tools.searchPaths": [],
        "formatting.latex": "tex-fmt",
        "formatting.tex-fmt.path": "tex-fmt"
      }
    }
  }
}
```

LaTeX 格式化默认 `none`，开启 `latexindent` 或 `tex-fmt` 后需要对应可执行文件。不存在时会报出工具名称和路径设置项，不静默成功。BibTeX 格式化无需外部依赖。

## 配置与操作

支持读取项目 `.vscode/settings.json` 中的 `latex-workshop.*` 设置以及上述 Zed 配置。Zed 配置优先。项目文件当前支持 JSON、整行注释和尾随逗号。

主要设置：`latex.recipes`、`latex.tools`、`latex.recipe.default`（first/lastUsed/名称）、`latex.outDir`、`latex.autoBuild.run`、`latex.autoBuild.interval`、`latex.build.enableMagicComments`、`formatting.latex`、`formatting.latexindent.path/args`、`formatting.tex-fmt.path/args`。扩展补充 `latex.rootFile` 可显式指定项目主文件。只声明这里列出的配置，不保证兼容所有 Workshop 设置。

工具参数支持 `%DOC%`（绝对路径，不含扩展名）、`%DOC_EXT%`、`%DOCFILE%`、`%DOCFILE_EXT%`、`%DIR%`、`%OUTDIR%`、`%AUXDIR%`、`%WORKSPACE_FOLDER%`、`%RELATIVE_DIR%`、`%RELATIVE_DOC%`、`%TMPDIR%`、`%JOBNAME%` 及 W32 变体。`AUXDIR` 当前与 `OUTDIR` 相同。遵循 Workshop 的 DOC/DOC_EXT 区分。默认主编译器和输出目录按本项目需求使用 XeLaTeX 与 build。

在 TeX 文件打开代码操作，选择 **Build LaTeX project** 或指定 recipe；编译期间可选择 **Terminate LaTeX compilation**。完整输出位于语言服务日志，错误同时进入 Zed 诊断。Zed 原生任务另提供 XeLaTeX 单次与 watch 编译；此路径的日志显示在任务终端。原生任务从主文件执行，固定主文件的示例见 `examples/multifile/.zed/tasks.json`。

子文件建议写：

```tex
% !TeX root = ../main.tex
```

保存文件后再编译。编译器读取磁盘文件；编辑补全与实时诊断读取编辑缓冲区。自定义 `.latexmkrc`、包依赖和编译器选择仍由项目管理。Windows 取消编译会终止工具及其子进程；其他平台终止直接工具进程。

## 开发与验证

```text
cargo build --locked --target wasm32-wasip2
node tests/workshop-probe.cjs
node --liftoff-only tests/grammar-smoke.cjs
```

语言服务测试需要 TeX Live 工具目录在 PATH，可用 `LATEXMK` 指定 latexmk 可执行文件；`SKIP_TEX_BUILD=1` 仅跳过实际 TeX 编译。语法测试需要 `.dev` 中的 web-tree-sitter 与生成的解析器 WASM。测试只写临时项目，不改个人论文。

接口依据：[Zed 语言扩展](https://zed.dev/docs/extensions/languages)、[Extension API](https://docs.rs/zed_extension_api/0.7.0/zed_extension_api/trait.Extension.html)、[代码片段](https://zed.dev/docs/extensions/snippets)、[任务](https://zed.dev/docs/tasks)、[Workshop 编译](https://github.com/James-Yu/LaTeX-Workshop/wiki/Compile)与[格式化](https://github.com/James-Yu/LaTeX-Workshop/wiki/Format)。Tree-sitter LaTeX 的 MIT 许可证保留在 `parser/latex/LICENSE`。
## 标准构建与安装边界

Zed 从 manifest 识别 Rust 扩展，调用 PATH 中的 rustc/cargo，构建 wasm32-wasip2，再写出 extension.wasm。Tree-sitter grammar 由 Zed 根据清单的固定 commit 拉取，使用其管理的 WASI SDK 编译。遵循 [官方开发流程](https://zed.dev/docs/extensions/developing-extensions)，无需本项目专用启动器或修改 Zed 全局配置。

本地 ".dev" 只存放开发测试缓存，不参与扩展安装。用户从正常入口启动 Zed，再选择仓库安装开发扩展。初次安装 Rust 后需重启终端和 Zed；若桌面仍继承旧 PATH，可注销再登录 Windows。

语言服务通过 Rust Extension trait 注册；服务源码嵌入 WASM并写入 Zed 分配的扩展工作目录，使用 Worktree 的 PATH 或 Zed Node API启动。这个工作目录方案参考 [Zed Svelte 扩展](https://github.com/zed-extensions/svelte/blob/main/src/svelte.rs)。不安装服务到论文目录，不改写用户设置。编译器/格式化器使用 PATH 或用户显式配置的工具路径，扩展代码不含开发机器路径。

CI 在 Windows/Linux 执行标准 Cargo 构建和无 TeX 的语言服务检查。CI、本地构建、Zed 安装、Zed 内功能验收分别记录，前两项通过不能代替后两项。

## 插件内清理与重试

0.4.4 参照 Workshop 的编译流程实现 latex.autoBuild.cleanAndRetry.enabled，默认 true。插件内手动编译与自动编译使用同一流程：工具步骤失败后清理辅助文件，并将失败步骤重试一次；持续失败仍报错。工具无法启动、用户取消或 PDF 仍不可写时不会清理重试。此实现不再向项目 tasks 注入脚本或编码命令。

打开 TeX 文件，通过代码操作选择 Build LaTeX project 或指定 recipe；选择 Clean LaTeX project 可手动清理。latex.clean.method 当前仅支持 command，默认 latexmk；latex.clean.command 和 latex.clean.args 可配置，默认使用 -outdir=%OUTDIR%、-auxdir=%AUXDIR%、-c、%TEX%。PDF 不在默认清理范围内。清理命令失败会提示，并仍尝试重跑原失败步骤一次。glob 清理、独立 auxDir 和所有 Workshop 清理配置尚未支持。

用户只需要配置工具路径与配方，清理重试默认启用，不必额外配置开关。需要禁用时，在服务 settings 中设置 latex.autoBuild.cleanAndRetry.enabled 为 false。插件服务自行提供编译入口；直接执行 latexmk 的原生任务仍由 latexmk 自身处理，不经过插件。

依据：[Workshop 配置默认值](https://github.com/James-Yu/LaTeX-Workshop/blob/master/package.json)与[失败步骤清理重试实现](https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/compile/plan.ts)。

## 跨设备工具配置

插件内的 Build LaTeX project、recipe 选择与自动编译使用同一编译服务，已自带 PDF 失败恢复，无需复制项目脚本或配置 tasks。原生终端任务仍是独立入口。Node 由 PATH 或 Zed 管理的运行时提供；TeX 发行版与格式化工具需另外安装。

工具从继承的 PATH 和 latex.tools.searchPaths 查找，也支持 latex.tools 中的 command 或格式化器 path 设置为绝对路径。searchPaths 是目录数组，优先于继承 PATH；请填写当前设备实际目录。通过绝对路径找到工具后，服务会把工具所在目录加入本次子进程 PATH，供 latexmk 查找同目录的编译器和参考文献工具。不会修改系统环境变量、Zed 全局设置或项目配置。

例如 Windows 可以在服务 settings 中配置：

```json
{ "latex.tools.searchPaths": ["C:/texlive/2026/bin/windows"] }
```

目录仅为示例，以实际安装为准。macOS 可使用实际 MacTeX 工具目录，Linux 可使用发行版提供的 PATH。

## 引用查找与重命名

0.4.2 通过标准 LSP 提供项目依赖范围内的标签和 BibTeX 引用键查找、重命名，支持常见 ref/cite 命令、逗号分隔的引用键及 BibTeX crossref。通过 Zed 的 Find All References / Rename 操作使用，具体键绑定以用户配置为准。会读取未保存的编辑缓冲区，并返回 WorkspaceEdit，由编辑器应用；服务不直接写文件。注释和 TeX verbatim 内容被排除，定义重复或新名称冲突时拒绝重命名。动态生成的键、自定义引用宏、复杂 BibLaTeX 多重引用语法及命令/环境重命名尚不支持。

修改扩展后需在 Zed 重新安装本目录的开发扩展，让嵌入的服务更新；已有论文任务不需要调整。

## 外部编译诊断同步

0.4.3 会监测已打开项目的当前输出目录中的编译日志。日志连续两次检查保持稳定且包含编译结束记录后，更新编译诊断；成功编译会清除前次错误。自动编译关闭时同样生效。生成文件的变化仅更新诊断，不触发新的编译。检测范围由 latex.outDir 和 latex.jobname 决定，外部任务应使用相同配置。此功能不为独立任务与插件编译提供跨进程互斥。

## 0.4.6 构建提示与日志

插件内的代码操作、Code Lens 和自动编译共用构建流程。同一主文件的重复构建请求复用正在执行的编译；同时选择不同配方会提示等待，不会把另一配方误报为已执行。手动构建会取消尚未启动的自动构建定时器。每次构建固定使用启动时的配置，修改设置不会改变正在执行的步骤。

构建前检查项目中已打开的源文件。尚未保存的编辑会提示先保存；外部修改磁盘文件不会被误判为编辑器中未保存的修改。插件不会代替用户保存源文件。

编译失败的提示包含具体原因和日志路径，覆盖 XDV 转换失败、工具无法启动等情况。完整命令、工作目录、工具输出和清理重试记录保存为输出目录中的 `<主文件名>.latex-workshop.log`，每次构建覆盖。通过代码操作 **Show LaTeX build log** 打开。若客户端无法打开，错误提示仍给出路径。

Code Lens 提供 **Build LaTeX project** 和 **Clean LaTeX project**，位于主文件的 documentclass 行或子文件首行。Zed 默认关闭 Code Lens，需要用户通过 `zed: open settings file` 在用户设置的最外层启用；当前版本的项目 `.zed/settings.json` 不允许此字段。插件不会改写设置：

```json
{ "code_lens": "on" }
```

也可以设为 `menu`，或继续使用现有代码操作。依据：[Zed Code Lens 设置](https://zed.dev/docs/reference/all-settings#code-lens)。

F4 中直接执行 latexmk 的原生任务仍是独立入口，不会经过插件的互斥、清理重试或上述完整日志。当前 Zed 扩展任务接口不能把本服务的构建命令直接注册为语言服务任务；源码依据与版本边界见 [接口核查](docs/zed-integration.md)。
## 0.4.7 编译反馈、补全与工具检查

编译按钮在进行中显示当前配方和 Stop，结束后显示成功、失败或取消以及耗时；完成后可直接点击 Show build log。服务通过标准 LSP work-done progress 报告当前步骤和清理重试；只在客户端声明支持时发送进度和 Code Lens 刷新请求。手动编译也发送开始与完成提示，自动编译不弹出成功提示。具体进度位置由编辑器决定，原生终端任务仍独立。

路径补全支持 input/include/subfile、includegraphics、bibliography/addbibresource，包含目录及相应文件类型。查找主文件目录和当前文件目录，替换当前参数中的路径片段；逗号分隔引用或包名只替换当前项。路径跳转支持上述文件命令。当前不展开宏生成的路径、graphicspath 或复杂 import 路径上下文。

usepackage/RequirePackage 与 documentclass 补全读取本机 kpsewhich 返回的 TEXMFDIST 文件名数据库，并包含项目中的 sty/cls 文件。数据库按工具路径缓存，新增安装的包需要重启服务刷新；没有 kpsewhich 或 ls-R 时仍可补全项目本地包，不宣称覆盖所有发行版。命令补全为支持 snippets 的编辑器提供 frac、sqrt、文字样式、章节和环境等参数片段。工作区符号搜索支持跨文件章节标题、公式环境、图表标题和标签键，结果附带来源文件。

通过代码操作 **Check LaTeX configuration and tools** 检查当前配方工具、可识别的 latexmk 引擎、启用的格式化器，以及清理工具和包目录工具。报告保存为输出目录中的 `<主文件名>.latex-workshop-tools.log`；支持 showDocument 的客户端会打开报告。检查包含配置验证和程序查找，不执行编译、不安装依赖、不改写设置；实际工具运行和 TeX 包依赖仍由构建验证。

工具 env 支持 `${env:变量名}` 和 `$PATH` 引用继承环境，Windows 下环境变量名不区分大小写。例如导入 Workshop 的 `Path: "工具目录;${env:Path}"` 能保留原 PATH。这里是字符串替换，不执行 shell 表达式。无需向 tasks 添加包装脚本。
## 0.4.8 引用悬停与定位

悬停在 ref/eqref/cref 等标签键上，可查看定义位置和附近源代码；悬停在 cite 等文献键上，可查看对应 BibTeX 条目的标题、作者或编者、年份或日期、出版信息及 DOI。使用未保存的编辑缓冲区，原样保留 TeX 标记和未解析的 BibTeX 字符串表达式；不渲染公式、不访问网络、不改写源文件。

跳转按引用命令类型区分标签与文献键，同名键不会互相覆盖。目标范围定位到定义键；多处定义返回多个目标，悬停提示来源，避免静默选中一个。动态宏键、自定义引用命令以及复杂 BibLaTeX 多重引用语法仍不保证支持。
## 0.4.9 命令用法悬停

悬停在命令本身（例如 cite、frac、includegraphics）显示用法、参数形式和简短说明；悬停在引用键上仍显示对应标签或文献内容。内置说明只覆盖 command-help.cjs 中列出的常见命令，不保证覆盖所有宏包。包专属命令注明对应包，自定义同名命令优先使用项目定义。

newcommand、renewcommand、providecommand、DeclareRobustCommand 风格的项目命令可显示参数个数及第一参数是否可选，并保留定义片段。传统 def、复杂动态参数和带嵌套语法的默认值不做完整签名推断。说明以纯文本显示，不依赖公式渲染或网络查询。
## 0.4.10 宏包相关补全与说明

内置 32 份 LaTeX Workshop 官方宏包及依赖元数据，涵盖 amsmath、mathtools、graphicx、hyperref、cleveref、natbib、biblatex、siunitx、booktabs、fontspec、tikz 等。数据来源固定为 [Workshop c5bdf430](https://github.com/James-Yu/LaTeX-Workshop/tree/c5bdf430a1577e2df28139ed4b1bd5c9ad859865/data/packages)，MIT 许可证随扩展嵌入；运行时无需联网下载命令数据。

根据主文件及依赖文件中的 usepackage/RequirePackage 字面加载语句启用相应命令，并跟踪元数据中的依赖。项目本地 cls/sty 的字面加载语句和命令定义也会纳入索引。注释、verbatim 和仅传递选项的语句不会启用宏包。未保存的编辑缓冲区会更新补全，项目重新定义的命令优先于宏包定义。

命令补全显示参数签名和说明；支持 snippets 的客户端会插入参数占位符，悬停复用相同说明。begin/end 中会补全已加载宏包的环境；includegraphics 等有官方选项元数据的命令可补全选项键，例如 width=、height=。

例如加载 mathtools 后输入 dfr，可补全其 amsmath 依赖提供的 dfrac，并查看分子/分母参数；删除加载语句后，此类宏包命令不再出现在建议中。实际键绑定以编辑器配置为准。

这是静态索引，不执行 TeX 条件分支或展开宏生成的包名。未收录的宏包、未提供元数据的依赖、外部文档类的隐式加载、复杂包选项和键值语法不保证完整支持。数据中的少见/内部命令默认不加入补全；不能把此版本视为完整 Workshop 补全兼容。

## 0.4.11 结构导航

- Zed 原生大纲查询增加 figure/table（含子图表）、常用公式环境、caption 和 label；标题优先使用可选短标题。
- LSP 文档符号保留章节层级，将图表、公式及标签归入所属结构。项目符号搜索可按图表标题或标签键跨文件定位，读取尚未保存的编辑内容。
- 标签定位范围是键本身，图表定位到标题；评论、verbatim 和命令定义正文不计入 LSP 文档结构。未闭合环境在后续章节处恢复。
- 按 Zed 标准 outline.scm 捕获方式实现原生大纲，不依赖编辑器是否采用 LSP documentSymbol。两种大纲的条目和层级可能不同；目前不合并跨文件 outline 树，也不推算 PDF 中的章节/图表编号。静态扫描不能执行条件分支或动态宏。

更新后，在当前文件的大纲中查找 caption 或 label；跨文件使用命令面板的项目符号搜索，输入标签键或图表标题即可定位。原生大纲和项目符号搜索是不同入口。


## 0.4.12 配置检查

使用代码操作 **Check LaTeX configuration and tools**，检查当前合并后的有效配置（Zed 的 lsp.latex-workshop.settings 优先于导入的 .vscode Workshop 设置）。命令标识仍为 latex-workshop.checkTools，原有调用方式有效。

- 汇总配方/工具数组类型错误、空步骤、重名、未知工具引用、未知默认配方、不支持的格式化器和未知占位符，每条附带设置键及 Fix 修正提示。
- 检查主文件、当前配方的工作目录、搜索路径、输出目录的阻挡文件，以及当前配方工具、可识别的 latexmk 引擎和启用的格式化器。尚未创建的 build 目录是正常状态；searchPaths 中无效目录和可选工具缺失作为警告。
- 配置或主文件无法解析时明确标注跳过可执行文件检查，不能把 missing=0 当作工具验证成功。目录检查不能保证之后的实际编译不会遇到权限变化或阅读器占用。
- 报告保存到输出目录的 <主文件名>.latex-workshop-tools.log；报告路径不可写时，仍通过消息及语言服务器日志显示问题，返回空报告路径。

检查不执行编译器、不安装依赖、不改写设置；它会写入检查报告。它检查本插件支持的配置和当前配方，未验证所有 LaTeX Workshop 选项、其他配方的可执行文件或 Zed 顶层设置 schema。

配方和命名工具的格式参考 [LaTeX Workshop 官方编译说明](https://github.com/James-Yu/LaTeX-Workshop/wiki/Compile#latex-recipes)。


## 0.4.13 CodeLens 可辨识性

CodeLens 显示为 `[ ▶ 编译 ]`、`[ 清理 ]`，构建中为 `[ ■ 停止 ]`，完成后可通过 `[ 日志 ]` 查看输出。这些是带视觉边界的可点击文字，不是真正的背景/边框按钮。Zed 负责字号、颜色和悬停外观，插件不改写用户主题或全局设置。


## 0.4.14 编译错误定位

编译诊断解析 file:line: 报错、TeX 日志中的文件进入/退出关系、后续 l.N 行号以及跨行的包警告。相对路径优先按构建工作目录解析；日志片段能唯一标识源码中的命令时，定位到该命令，否则定位到报告的源码行。

未打开的子文件也会收到编译诊断，可从问题列表直接跳转。已定位到子文件的错误不再额外生成一条主文件构建失败诊断。缺少源码位置的工具/转换器失败仍显示在主文件并保留完整日志；TeX 未提供行号时会明确提示。再次编译成功会更新并清除旧错误。外部任务的完成日志使用同一解析器，但没有任务工作目录信息时按主文件目录解析。

静态解析不保证还原所有宏展开栈、特殊工具的日志格式或换行截断的文件名。诊断可点击跳转由 Zed 的标准 LSP 界面提供。

## 验证记录与后续计划

记录日期：2026-10-05。这里区分开发侧回归测试与用户在 Zed 中的实际验证；暂缓验证不代表功能已完成用户验收。

| 版本 | 内容 | 开发侧验证 | 用户 Zed 验证 |
| --- | --- | --- | --- |
| 0.4.11 | 结构导航与跨文件符号搜索 | 已通过对应测试及 WASM 构建 | 已确认完成 |
| 0.4.12 | 配置检查与修正提示 | 已通过配置/LSP 测试、实际编译回归及 WASM 构建 | 已确认完成 |
| 0.4.13 | 更易辨认的 CodeLens 文字按钮 | 已通过 LSP 回归及 WASM 构建 | 已确认完成 |
| 0.4.14 | 子文件与多行编译错误定位 | 已通过日志解析、实际 XeLaTeX 错误定位/修复回归及 WASM 构建 | **暂缓，尚未验证** |
| 0.4.15 | 扩充宏包数据、选项补全与排序 | 已通过对应 LSP 测试、实际编译回归及 WASM 构建 | 尚未验证 |
| 0.4.16 | 现代命令定义与参数签名 | 已通过解析/LSP 测试、实际 XeLaTeX 回归及 WASM 构建 | **暂缓，尚未验证** |
| 0.4.17 | 模板模块依赖与路径导航 | 已通过真实项目只读 LSP、路径/编译回归及 WASM 构建 | **暂缓，尚未验证** |
| 0.4.18 | 多主文件诊断隔离 | 诊断归属、多主文件 LSP、实际编译回归及 WASM 构建已通过 | **暂缓，尚未验证** |
| 0.4.19 | 文件与项目索引缓存 | 缓存失效/额度、真实项目导航、实际编译回归及 WASM 构建已通过；快速同长度改写问题在 0.4.20 修正 | **暂缓，尚未验证** |
| 0.4.20 | 命令复制、特殊声明及缓存修正 | 声明/真实项目导航、缓存、实际编译回归及 WASM 构建已通过 | **暂缓，尚未验证** |
| 0.4.21 | 静态文件包装命令与生成的定理环境 | 包装解析、真实项目 LSP、实际编译回归与 WASM 构建已通过 | **暂缓，尚未验证** |
| 0.4.22 | 现代包装命令及多层参数转发 | 包装解析、LSP、真实论文只读导航、实际编译回归及 WASM 构建已通过 | **暂缓，尚未验证** |

0.4.14 待验证项：

- 在单独的临时多文件项目中，让子文件包含一个未定义命令；检查问题列表是否指向该子文件和命令所在行，点击后是否正确跳转。
- 关闭出错子文件的编辑标签后再构建，确认问题列表仍显示错误。
- 删除未定义命令并重新构建，确认子文件的旧错误清除，主文件没有重复的通用失败诊断。
- 检查跨行包警告的文字和行号，以及缺少源码位置的工具失败是否仍保留日志入口。

以上只是待执行清单，不会自动修改论文源文件或用户配置。

后续候选改进（尚未实现，不等同于发布承诺）：

1. **宏包补全覆盖与质量**：0.4.15 已完成一批数据扩充、条件依赖、简单枚举值及排序；继续补充缺失记录和复杂键值语法，保留离线使用及许可证来源。
2. **现代命令定义解析**：0.4.16 已实现常见静态声明的签名、悬停与跳转；复杂动态宏及特殊参数保留原始声明。
3. **复杂路径导航**：0.4.17 已统一静态导入、图片搜索和本地包路径；后续处理包装命令及动态路径。
4. **多主文件诊断隔离**：0.4.18 已按主文件保存结果、合并共享诊断并独立清除；尚不按同一主文件的不同 recipe 保存历史。
5. **大项目响应速度**：0.4.19 已缓存文件解析与项目索引，按源文件变化更新；目录扫描、依赖和引用/结构搜索仍待进一步优化。

继续保留此前暂不考虑的范围：PDF 预览与联动、自动编译机制扩展、兼容性矩阵扩展。CodeLens 的真实背景/边框按钮需要 Zed 提供渲染支持，不能在插件内承诺实现。


## 0.4.15 宏包补全扩充

当前内置 51 份宏包及依赖记录，仍使用固定 Workshop c5bdf430 数据及 MIT 许可证，运行时离线。新增覆盖 multirow/tabularx/longtable、caption/subcaption、mhchem、algorithm2e、pgfplots、minted、glossaries 以及若干排版包。缺少上游导入记录的包和命令不虚构补全。

按加载选项启用条件依赖；例如普通加载 subcaption 不会自动启用 setspace，font=onehalfspacing 时才启用对应依赖。多个上游选项键别名会合并，命令排序优先精确匹配，再到项目自定义命令、已加载宏包命令和基础命令。

当 usepackage/RequirePackage 的右侧包名已经存在时，在方括号内可补全对应选项键和简单枚举值。若尚未输入包名，则无法确定包选项；宏生成选项、嵌套枚举/占位符、运行时条件及命令引起的动态加载尚未完整解析。

待在 Zed 验证：加载 mhchem/multirow 后检查 ce/multirow 补全；在已有包名的 usepackage[...]{subcaption} 中检查 format= 的 plain/hang 建议；检查自定义命令排序以及移除包后建议是否消失。0.4.14 的错误定位验证仍暂缓。

## 0.4.16 现代命令定义

静态识别 New/Renew/Provide/DeclareDocumentCommand 及 Expandable 变体，支持花括号或直接命令名；DocumentEnvironment 定义提供环境名补全和跳转。项目命令使用同一索引进行补全、悬停和跨文件跳转，支持未保存文本。

命令签名支持 m、o/O、s、t、d/D、r/R、v，以及 +、!、= 和 >{处理器} 修饰符；显示默认值，但不执行处理器或展开默认值。星号/测试标记用空的可编辑位置，不强制插入。e/E、环境体 b/c、旧式 u/g/G、动态声明或超过九个参数时保留原始声明，不生成推测参数。现代定义体中的章节、标签和嵌套定义不会被当作文档内容索引。静态解析不模拟 TeX 条件执行、作用域及 Provide 的运行时定义判断。

参数语义参考 [LaTeX 官方作者指南](https://latex-project.org/help/documentation/usrguide.pdf)。

用户 Zed 验证：**暂缓，尚未验证**。待本轮修改结束后统一测试：现代命令补全、默认值悬停、F12 跨文件跳转、未保存定义更新、环境名建议及复杂参数降级。开发侧已通过解析、LSP、结构导航、实际 XeLaTeX 编译/增量/锁定恢复回归，以及标准 WASM 构建。

## 0.4.17 项目依赖与路径导航

先以 NUAA 论文项目检查现有加载链：主文件加载本地文档类，再用 InputIfFileExists 加载 14 个 cfg/def 模块。旧索引没有追踪这些模块，造成 makecover 等命令在调用处无悬停/跳转；bibliographystyle 则缺少内置说明及样式文件导航。现已统一静态文件引用解析，并补齐对应接口，未修改论文源码和设置。

- 依赖跟踪支持本地 documentclass/LoadClass、usepackage/RequirePackage、InputIfFileExists 及 import/subimport 的 inputfrom/includefrom 别名。模板模块定义进入补全、悬停和跳转；命令后紧跟可选参数方括号时，按命令 token 定位，避免把选项误当命令名。模板/包定义先索引，正文定义随后覆盖。
- import 相对主文件目录，subimport 相对当前导入目录；普通输入和图片优先使用导入上下文。跟踪继承的静态 graphicspath 列表；普通路径依次按主目录、图片搜索目录、当前文件目录回退。
- import 的两个参数可分别补全目录和文件；bibliographystyle 支持本地 bst 名补全、用法悬停和路径跳转。文件名中的空格保留。
- 同一文件以不同导入上下文加载时，定义跳转返回各个实际候选，悬停列出多个位置。本地包不再从全项目扫描中随意选择同名文件。图片悬停显示路径，不把二进制内容当源码显示。

边界：静态解析不会运行 TeX、展开动态文件名或完整模拟条件/分组与跨文件赋值；导入、搜索路径使用主文件目录作为工作目录。默认常见图片扩展名有固定顺序，尚未读取 DeclareGraphicsExtensions。当前文件目录回退用于编辑导航，不承诺与所有 TeX 搜索配置完全等同。运行时发行版内的类/包和 bst 尚不提供源码跳转。目录补全每次读取最多 2000 项，依赖跟踪限制 25 层及 5000 个上下文，防止循环。

项目检查还发现两类后续工作：通过 nuaanotation/nuaaacronyms 包装 CatchFileDef 读取的内容文件，以及通过 nuaatheoremchapu 生成的定理环境；0.4.21 已加入通用的保守静态分析，具体边界见后文。DeclareSIUnit 与静态 let/CommandCopy 声明已在 0.4.20 支持；动态复制与运行时作用域仍不模拟。这里记录缺口，不对模板命令逐个硬编码支持。

开发侧验证：路径上下文、模板模块、现代命令及 LSP 回归已通过；使用真实 NUAA 项目只读检查，确认 makecover/makedeclare/makeabstract/nuaanotation 调用处悬停和跳转、bibliographystyle 用法及本地 bst 路径。Zed 手动验证仍暂缓，待本轮完成后统一测试。实际 XeLaTeX 编译、增量/占用恢复、诊断与格式化回归及标准 WASM 构建已通过。

## 0.4.18 多主文件诊断隔离

编译结果按构建主文件保存，再合并发布给 Zed。一个主文件构建成功或执行清理只清除该主文件自己的编译诊断；其他主文件对共享子文件的错误仍保留。已从当前依赖中移除的文件也会清除该次构建留下的旧诊断。

同一位置、严重度、文字和错误代码相同的诊断合并成一条，相关信息保留各个构建主文件的可跳转位置。生成通用构建失败提示时只检查本次主文件的结果，避免其他构建的错误抑制提示。插件构建和外部任务日志使用同一隔离逻辑，未打开子文件的诊断发布与清除继续有效。

共享源码修改后，各主文件的旧编译结果分别保留，直到它们各自重新构建或清理。此处按主文件隔离，同一个主文件的不同 recipe 不单独保存历史；若不同主文件使用同一输出日志路径，需要用不同 outDir/jobname 避免日志文件互相覆盖。

开发侧已通过诊断归属及多主文件 LSP 回归：共享错误合并、A 成功保留 B 的错误、B 成功清除最后一条，以及移除依赖和独立失败提示。实际 XeLaTeX 编译、增量/占用恢复、错误定位和格式化回归及 WASM 构建均已通过。用户 Zed 验证仍暂缓，最后统一进行。

## 0.4.19 文件与项目索引缓存

命令、环境、标签及文献索引按文件缓存解析结果；项目宏包上下文与合并索引也可复用。重复补全、悬停和定义请求在文件未改变时不再重新解析整个索引。文件变化时，只重新解析该文件；宏包上下文在项目内容变化后整体重建。

未保存缓冲区按实际文本变化检测，不能只依赖版本号；关闭文件后恢复读取磁盘内容。0.4.20 起，磁盘记录同时核对实际文本；不再仅凭时间、大小和文件标识相同就复用解析结果，避免 Windows 快速同长度改写漏更新。新增/删除依赖、文件列表变化也会更新缓存。缓存最多保留 256 个文件、32 MiB 源码文本及 16 份项目结果，并按最近使用情况淘汰；源码文本额度不等同于进程总内存限额。

本轮仍每次检查依赖关系与磁盘状态，不缓存目录扫描、依赖解析、引用重命名扫描和工作区结构搜索。这保证静态路径中新出现的文件能及时进入索引；后续再单独优化这些阶段，不宣称整个语言服务器已完成增量化。

开发侧测试：缓存命中、单文件修改、相同版本号的未保存编辑、关闭缓冲区、依赖新增/删除、数量/文本额度淘汰均通过。100 文件、6000 声明的临时项目中，core.index 阶段首次约 16.05 ms，缓存后 10 次请求中位数约 0.80 ms；这是本机一次开发测量，包含文件状态检查，不包含依赖发现、LSP 通信或 Zed 界面耗时，不设置固定性能验收阈值。完整 XeLaTeX 编译、增量/占用恢复、诊断/格式化回归及 WASM 构建已通过，真实论文项目的只读导航检查也已通过。

用户 Zed 验证仍暂缓；统一验证时检查保存/未保存/新增文件后的补全与跳转，确认没有旧索引残留。

## 0.4.20 命令复制、单位与运算符声明

新增 let 的直接控制序列复制，以及 New/Renew/DeclareCommandCopy 的静态索引。声明处可使用标准的直接命令或花括号形式；let 仅接受直接控制序列，不推断字符赋值、动态 csname 或运行时作用域。调用处支持补全、悬停和跳转到复制声明；悬停显示静态复制来源链及原命令当前索引位置。循环和过长的链停止解析。

复制命令保持无参数推测的补全：TeX 复制的是当时的含义，原命令后续重定义可能改变当前签名，不能把当前签名当作复制时的准确参数。命令复制语义参考 [LaTeX 官方作者指南](https://latex-project.org/help/documentation/usrguide.pdf)；此插件不执行 TeX 或恢复复制时的运行状态。

DeclareSIUnit 支持可选声明设置、命令名和嵌套单位内容；DeclareMathOperator 及星号形式支持运算符内容。声明进入补全、悬停和定义导航。定义体、现代命令体、常见列/定理样式定义里的复制操作不会被误当作已执行的项目声明；特殊声明内容也不会被当成结构导航中的章节。

真实论文项目只读检查通过：content/chap5.tex 中 rpm 调用可显示单位内容并跳转到 config/preamble.tex。自动测试覆盖命令复制链、循环、嵌套内容、精确范围、未保存删除后的补全消失及已有导航回归。

本轮回归还发现快速同长度改写可能具有相同磁盘状态信息，已修正 0.4.19 的缓存复用条件并加入模拟元数据完全相同的测试。改为实际文本校验后，同样 100 文件/6000 声明的本机索引测量为首次约 21.05 ms、重复中位数约 2.86 ms；不等同于整体 LSP/Zed 耗时。

包装文件命令 CatchFileDef、包装 newtheorem 所生成的环境在 0.4.21 增加了保守的静态支持，本轮未为 NUAA 模板硬编码特殊行为。开发侧实际 XeLaTeX 编译、增量/占用恢复、诊断与格式化回归及 WASM 构建已通过；用户 Zed 验证仍暂缓。


## 0.4.21 文件包装命令和生成的定理环境

通过通用静态分析识别 newcommand / renewcommand / providecommand / DeclareRobustCommand 的花括号参数。支持最多 9 个参数及首个可选参数默认值；从命令体中提取 CatchFileDef / CatchFileEdef、input / include / InputIfFileExists 的单个文件参数（必须是完整的 #N）。调用处提供路径补全、文件跳转，并将读取的文件加入项目依赖。类文件后续加载的模块也参与发现；依赖图最多迭代 25 次，原有深度与上下文数量限制继续生效。

识别包装命令体中的 newtheorem / newtheorem*：环境名称必须是单个 #N；显示标题可替换静态参数。实例注册进入 begin/end 补全和定义跳转，跳转到注册调用的环境名称。共享计数器形式同样支持。真实论文中的 notation/acronyms 内容读取及 definition/assumption 注册参与只读 LSP 检查。

这是静态索引：不执行 TeX、不判断条件分支、不恢复运行时作用域，不展开宏拼接、csname 或 def 参数语法。现代包装及静态参数转发在 0.4.22 扩展，见下文。重复环境注册以项目索引中后者为准；不能据此判断编译时是否有效。被读取文件加入编辑索引，不代表 TeX 会执行其内容。注释、逐字内容及完整宏定义内部的包装调用不计为实际调用。

用户 Zed 验证暂缓。集中验证时检查：文件参数中的补全/跳转、从这些内容文件识别论文主文件、生成环境的补全及跳转；修改包装定义或注册后，未保存状态也应更新。无需修改全局设置或论文配置。


## 0.4.22 现代包装命令和多层参数转发

现代 New/Renew/Provide/DeclareDocumentCommand（包括 Expandable 形式）复用现有定义解析，支持 m、o、O{默认值}、s 的组合，最多 9 个参数。文件路径补全、跳转、依赖识别和定理环境注册支持这些包装。星号占据其真实参数位置；省略可选参数不会使后面的文件参数错位。其他参数规格整体放弃包装分析，不猜测位置；处理器、特殊定界参数、非花括号必选参数和 DocumentEnvironment 包装仍不支持。

增加传统/现代命令之间的多层转发：只有完整 #N 转发的文件名、环境名继续追踪；参数交换和显式可选参数转发也参与分析。标题参数做静态替换，未提供的 o 参数保留 -NoValue- 标记，不模拟 TeX 判断。循环采用最多 32 轮的有界传播，每个命令每类最多 128 条结果，传播标题长度最多 4096 字符；不执行递归宏或声称还原实际运行结果。嵌套定义内部的读取不算执行效果。

待集中验证：现代包装和跨层转发的路径补全、精确跳转，生成环境导航，省略/填写可选参数和星号时的参数位置；删除或重定义内层命令后依赖更新。仍不修改全局设置和论文项目。

开发侧检查已通过：参数交换、星号与可选参数位置、跨层路径补全/跳转、生成环境注册、循环限制、未保存重定义失效、真实论文只读导航；实际 XeLaTeX、增量构建、PDF 占用恢复、诊断清除和格式化回归，以及标准 WASM 构建通过。Zed 手动验证继续暂缓。
