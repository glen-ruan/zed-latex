# Changelog

## 0.4.15

- Expand the bundled Workshop catalog from 32 to 51 records at the same pinned revision, with the existing MIT license.
- Respect literal conditional dependency options instead of enabling all deps.if records unconditionally.
- Normalize combined option-key aliases; add package option completion when the package name is present after the bracket, and simple enum value completion with precise suffix replacement.
- Rank exact command matches first, followed by project custom commands, loaded-package commands and basic commands; provide stable sortText and bracket/equal completion triggers.
- Preserve the pending native Zed verification status of 0.4.14.


## 0.4.14

- Track TeX source-file contexts and following l.N lines for traditional errors; join multi-line package warnings and resolve paths against the build working directory.
- Select a uniquely identifiable control sequence from error context, otherwise highlight the reported source line; deduplicate repeated diagnostics.
- Publish compile diagnostics for unopened source files and clear them after successful builds.
- Avoid adding a generic main-file failure when an error is already attributed to a child file; retain the tool-failure fallback when no source error is available.
- Verify exact child error locations and clearing after real XeLaTeX rebuilds, alongside static nested-file and wrapped-warning fixtures.


## 0.4.13

- Make build, clean, stop and log CodeLens actions easier to recognize with Chinese labels, visual brackets and action glyphs.
- Preserve command identifiers and build-state feedback; appearance remains rendered by Zed rather than a custom button widget.


## 0.4.12

- Aggregate configuration errors with setting keys and actionable hints, including recipe/tool shapes, empty or duplicate recipes, unknown tool references and placeholders.
- Check main-file resolution, working/search directories, blocked output paths and selected tool availability without executing tools or modifying configuration.
- Expand supported _W32 placeholders correctly and flag unknown placeholders containing digits.
- Keep the configuration-check action available for malformed recipe arrays; distinguish skipped checks, missing required tools and optional warnings.
- Return issues even when a report cannot be saved, with complete language-server log output. Retain the latex-workshop.checkTools command identifier.


## 0.4.11

- Extend Zed native outline queries with floats, captions, mathematical environments and label keys.
- Add hierarchical LSP symbols and cross-file workspace search for captions, equations and labels, including unsaved buffers and precise selection ranges.
- Prefer optional short titles; ignore comments, verbatim examples and macro definition bodies in LSP structure. Recover unclosed environments at following sections.
- Keep native outline and LSP responsibilities explicit; no merged cross-file outline tree or rendered counter evaluation.


## 0.4.10

- Bundle 32 Workshop package/dependency metadata files from fixed upstream revision c5bdf430a1577e2df28139ed4b1bd5c9ad859865 with the MIT license.
- Discover literal package loads and project-local class/style loads; activate available dependency metadata and update completion from unsaved buffers.
- Share argument signatures, snippets and documentation between completion and hover; add loaded-package environment and option-key completion.
- Prefer project command overrides and exclude commented loads. Passing options alone does not activate a package. Runtime use remains offline.

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
