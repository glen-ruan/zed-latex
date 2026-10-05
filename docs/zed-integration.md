# Zed integration evidence

## Sources checked

- [Zed extension development](https://zed.dev/docs/extensions/developing-extensions): manifest + Rust cdylib + wasm32-wasip2, ordinary dev installation, managed WASI SDK.
- [Builder at installed Zed revision 76659a55](https://github.com/zed-industries/zed/blob/76659a55a8c10ed355a070f8764a0b1733e3c115/crates/extension/src/extension_builder.rs): rustc target-libdir check, Cargo build, extension.wasm production, parser checkout/compile.
- [Svelte extension](https://github.com/zed-extensions/svelte/blob/main/src/svelte.rs): Extension registration, env::current_dir for the extension work directory, node_binary_path for Node services.
- [Rust installation](https://rust-lang.org/tools/install/): rustup and standard user .cargo/bin PATH.

## Project mapping

| Zed boundary | Implementation |
| --- | --- |
| Discovery | extension.toml, id latex, schema_version 1 |
| WASM | Cargo cdylib + zed_extension_api 0.7 + register_extension! |
| Toolchain | rust-toolchain.toml, stable, wasm32-wasip2 |
| Grammars | immutable repository commits in manifest, compiled by Zed |
| Editor features | languages/* queries, snippets/latex.json, native tasks |
| LSP | language_server_command, language_server_workspace_configuration |
| Service deployment | embedded scripts written to Zed extension work directory |
| Runtime tools | Worktree.which / shell_env and Zed Node API; user overrides through standard LspSettings |
| User configuration | read only; extension does not write user or project settings |

Embedding a custom LSP service is a project implementation choice. The Rust lifecycle and directory/Node APIs follow existing extensions; this does not claim Zed mandates embedding services.

## Verification on 2026-10-04

Installed standard user rustup, Rust 1.99.0 and wasm32-wasip2. Rust/cargo resolve to C:\Users\ruan\.cargo\bin. With normal machine + user PATH, without project CARGO_HOME/RUSTUP_HOME and without loading a VS developer shell, cargo build --locked --target wasm32-wasip2 --target-dir target passed.

Companion checks passed: root discovery/ambiguity/cycles, recipes, references/citations, definitions, outline, real multi-file XeLaTeX + BibTeX, child-file compiler errors and clearing errors, automatic builds on save/external changes. Actual tex-fmt integration was previously verified separately.

Added Windows/Linux CI build + companion checks; remote CI has not been run. Native Zed installation and UI acceptance are still pending. The earlier native failure was running rustc: program not found. Standard rustup installation addresses that missing tool; only a fresh normal Zed installation attempt can confirm the complete install pipeline.

Removed machine-specific launcher scripts. No Zed settings were changed during this correction. Existing .dev caches are ignored and are not a dependency of installation.

Native install verified at 18:12 on 2026-10-04: Zed compiled Rust and both grammars, finished the extension build in 120.31 seconds and loaded LaTeX Workshop for Zed 0.4.0 as a dev extension. Most elapsed time was the first managed WASI SDK download. UI feature acceptance and companion startup remain separate checks.
0.4.1 BST update: independent grammar published with authorization on codex/bibtex-style-grammar, pinned revision 7bfcc72308be076c6d79d32a157f273ade691e1d. Four standard styles and the user style (81 function definitions) passed parser/highlight queries; comments and TeX-looking strings remain isolated. Extension and formatter regression checks passed. Native Zed must rebuild the development extension before this new grammar is loaded.

0.4.2: Standard WASM build passed. With an empty PATH and absolute latexmk/tex-fmt paths, actual multi-file XeLaTeX + BibTeX, child diagnostics, save/external-change automatic builds and formatting passed. Tool discovery checks cover search directories, sibling tools, paths with spaces and Windows PATH casing. Label/citation references and rename passed module and stdio LSP checks, including comments/verbatim exclusion, duplicate/collision rejection, crossref and unsaved buffers. Native Zed acceptance and non-Windows execution remain unverified. rustfmt is absent from the local minimal toolchain; this does not prevent the successful extension build.

0.4.4: Compared Workshop package defaults and src/compile/plan.ts. Replaced the PDF-specific force retry with command-based cleanup and one retry per failed tool step; added the standard LSP clean command/action. Both no-TeX protocol checks and actual XeLaTeX/BibTeX checks passed, including cleanAndRetry disabled, stale xdvipdfmx cache, Windows exclusive PDF lock/unlock, incremental success and manual cleanup preserving PDF. Project task restored to its Git version and encoded/task-local wrappers removed. Native Zed reload remains separate from the build.

Definition investigation: read-only requests against actual thesis chapter returned the eq:emf label and ref_ch3_1 bibliography definition. Fixed empty workspaceFolders initialization and tested rootUri/rootPath/cwd fallbacks. The live Zed index was still 0.4.3 and the latest logged LaTeX server action was stopping it; the exact UI failure cause remains unconfirmed until native reinstall/restart.

0.4.5: Live runtime script hash still matched the pre-fix configuration request. The service requested section latex-workshop while the Rust adapter returns settings at the root; Zed returns null for that missing section, and the former null fallback reapplied imported VS Code onSave settings. Changed the request to the configuration root and ignored null responses. Standard WASM build, simulated Zed configuration precedence, actual changed-child incremental compilation without cleanup, PDF lock/unlock recovery, save/external builds and formatter checks passed. Native 0.4.5 installation and the user's post-update incremental acceptance remain pending.
## 0.4.6 interface boundary and verification (2026-10-05)

Checked installed Zed revision 76659a55a8c10ed355a070f8764a0b1733e3c115. [Editor task discovery](https://github.com/zed-industries/zed/blob/76659a55a8c10ed355a070f8764a0b1733e3c115/crates/editor/src/runnables.rs) requires a language context provider's lsp_task_source. [Extension language loading](https://github.com/zed-industries/zed/blob/76659a55a8c10ed355a070f8764a0b1733e3c115/crates/extension_host/src/extension_host.rs) uses ContextProviderWithTasks; [that provider](https://github.com/zed-industries/zed/blob/76659a55a8c10ed355a070f8764a0b1733e3c115/crates/project/src/task_inventory.rs) supplies associated TaskTemplates but does not opt into LSP task discovery. Implementing experimental/runnables in the companion alone would therefore not integrate its builds into the native task picker. Direct latexmk tasks remain independent.

The installed version's [default settings](https://github.com/zed-industries/zed/blob/76659a55a8c10ed355a070f8764a0b1733e3c115/assets/settings/default.json) and [official settings reference](https://zed.dev/docs/reference/all-settings#code-lens) support code_lens off/on/menu. The plugin supplies resolved standard LSP CodeLens commands without changing the user's setting.

Protocol checks passed: build/clean lenses, unsaved-source rejection, concrete conversion and missing-tool errors, persistent output, showDocument log opening, duplicate-request coalescing and conflicting-recipe rejection. Actual XeLaTeX/BibTeX integration passed changed-child incremental builds, failure recovery with an exclusive Windows PDF lock, child error clearing, on-save and external-file automatic compilation, tex-fmt and external task diagnostics. Standard cargo build --locked --target wasm32-wasip2 passed. Native 0.4.6 installation and clickable CodeLens/log-opening UI acceptance remain unverified; remote CI and non-Windows execution remain unverified.
## 0.4.7 verification (2026-10-05)

Published the 0.4.6 snapshot to origin/main at e5279328adfce1a005049e3c50359426ba5928ac before starting the requested improvements. The new feedback uses standard capability-gated workDoneProgress, CodeLens refresh and showDocument; unsupported clients keep the existing code-action and log routes.

The stdio protocol harness verifies progress begin/report/end, success/failure/cancel states, elapsed time, busy/stop lenses and cancellation. It also verifies path completion replacement ranges, graphics file filtering, source path definitions, local package completion, snippet capability support, workspace section search, missing-tool reports and inherited environment expansion. Actual installed fontspec completion was verified through TeX Live kpsewhich and ls-R. Standard WASM build and the existing TeX integration regression suite are run locally; native 0.4.7 UI acceptance remains separate. Automatic-build scheduling and the compatibility matrix were not expanded in this iteration.
## 0.4.8 verification (2026-10-05)

Standard WASM build and stdio protocol checks passed for reference context and citation metadata hovers, exact definition ranges, same-key label/citation disambiguation and comment exclusion. Existing reference/rename checks passed; a braced BibTeX field containing a literal quote and apparent author field no longer swallows the next entry or replaces the real author in the hover preview. Native hover rendering remains a separate acceptance check. Compiler and automatic-build scheduling were not changed.