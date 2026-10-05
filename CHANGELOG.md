# Changelog

## 0.4.9

- Show usage signatures and short explanations when hovering supported LaTeX commands, independently of reference-key previews.
- Show argument counts and optional first arguments for project newcommand-style definitions, giving local overrides precedence over built-in help.
- Verify cite/frac usage, custom optional arguments, comment exclusion and preserved bibliography metadata through LSP.

## 0.4.8

- Add reference hover previews with label source context and bibliography title, author/editor, year/date, publication and DOI fields.
- Resolve labels and bibliography keys by reference type and return exact definition-key ranges; return all matching definitions when ambiguous.
- Keep comments/verbatim out of definition lookup and handle literal quotes inside braced BibTeX fields without swallowing subsequent entries.

## 0.4.7

- Add capability-gated LSP work-done progress, recipe/step feedback, elapsed time, build-state lenses and project-scoped cancellation. Manual builds report successful completion; finished lenses link to the log.
- Complete local TeX, image and bibliography paths with precise replacement ranges; navigate to referenced files and search sections across the workspace.
- Complete installed packages/classes from kpsewhich and the TeX filename database, with local package fallback; add argument snippets for supported clients.
- Add Check LaTeX tools with resolved executable paths and a saved report. Expand inherited environment references in imported tool settings without changing user configuration.

## 0.4.6

- Add standard LSP build/clean Code Lens and a Show LaTeX build log action. Code Lens display requires the user's Zed code_lens setting.
- Persist complete build output, commands and retry records; include concrete converter/tool failures in messages and diagnostics.
- Guard unsaved source edits without blocking external disk changes; cancel pending automatic builds on manual build and snapshot each job's configuration.
- Verify duplicate build coalescing and reject conflicting recipe requests. Native terminal tasks remain independent of the plugin pipeline.

## 0.4.5

- Request the full Zed workspace configuration instead of a nonexistent latex-workshop section. Preserve Zed auto-build overrides over imported VS Code settings; ignore null configuration responses.
- Verify saved-file incremental builds without cleanup and configuration precedence after initialization.

## 0.4.4

- Fix project discovery with empty workspaceFolders; fall back to rootUri, rootPath or the language-server working directory.

- Move recovery into the plugin build pipeline: support Workshop cleanAndRetry.enabled and command-based cleanup, retry a failed tool step once, and add Clean LaTeX project.
- Keep PDF lock detection, cancellation, final diagnostics and normal incremental compilation. Remove project-task wrapper examples and obsolete tests.

## 0.4.3

- Synchronize diagnostics from completed external compiler logs, including with auto-build disabled; ignore incomplete logs and clear stale errors after successful native tasks.

## 0.4.2

- Add project references and rename for labels and bibliography keys, including BibTeX crossref, through standard LSP edits. Reject duplicate definitions and conflicting keys.
- Add portable external-tool discovery and configurable search directories, preserving user settings and inherited environment.

## 0.4.1


- Add an independent BST grammar and Workshop-style highlighting, function outline, folds and indentation.
- Keep BST strings isolated from TeX injections and language-server diagnostics.


## 0.4.0

- Replace TexLab integration with an embedded Node companion using Workshop-style recipes, tool arguments/environment/cwd, root comments and dependency discovery.
- Add project completion/definitions, section symbols, syntax and compiler diagnostics, debounced automatic builds, build recipe code actions and formatting adapters.
- Default to XeLaTeX + latexmk with build output; preserve DOC versus DOC_EXT placeholder semantics.
- Add snippets, environment/group indentation, macro outline queries and an explicit plain-text BibTeX Style language.
- Keep PDF preview and SyncTeX integration out of this iteration. Document incomplete Workshop parity and external dependencies.
- Add isolated multi-file LSP/TeX integration checks and parser smoke checks.

# 更新记录

## 0.3.1

- 新增 XeLaTeX 单次与持续构建入口，统一输出到 `build/`。
- 修正 expl3 命令名及命名变量识别，保留普通数学下标规则。
- 增加 `.def` 文件类型识别。
- 将修改后的固定版本解析器纳入仓库，保留其 MIT 许可证。
- 补充开发版安装、TeX 工具路径及主文件构建说明。
