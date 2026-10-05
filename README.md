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

通过代码操作 **Check LaTeX tools** 检查当前配方工具、可识别的 latexmk 引擎、启用的格式化器，以及清理工具和包目录工具。报告保存为输出目录中的 `<主文件名>.latex-workshop-tools.log`；支持 showDocument 的客户端会打开报告。检查只查找程序，不执行编译、不安装依赖、不改写设置；实际工具运行和 TeX 包依赖仍由构建验证。

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
