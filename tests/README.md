# Verification

Run `node tests/workshop-probe.cjs` with latexmk/xelatex/BibTeX on PATH. The companion test checks root comments/cycles/ambiguity, Workshop placeholders, recipes, completion, definitions, structure, BibTeX formatting, real XeLaTeX compilation in a path with spaces, child-file compiler diagnostics, clearing errors and automatic build on save. Missing formatter reporting and `.bst` exclusion are also checked. `SKIP_TEX_BUILD=1` skips the real compiler portion.

`node --liftoff-only tests/grammar-smoke.cjs` checks parser/query behavior using the isolated `.dev` web-tree-sitter runtime and generated LaTeX WASM. The local Node default optimizing WASM tier exhausts memory; a pass with liftoff-only does not prove Zed host stability.

No test edits the user's thesis or Zed settings. Installing the development extension and verifying native Zed behavior remain separate manual checks.

Set TEX_FMT to a formatter executable to verify actual LaTeX formatting and idempotence. Standard extension build: cargo build --locked --target wasm32-wasip2. Native Zed installation remains a separate acceptance step.
BST: node --liftoff-only tests/bst-smoke.cjs validates independent highlights/outline/folds/indents and four standard style files. Its test WASM is built separately for web-tree-sitter; Zed builds the native grammar from the manifest-pinned remote revision with its managed WASI SDK.

PDF recovery: node tests/recovery-probe.cjs checks retry decisions and a real Windows exclusive PDF lock. node tests/recovery-tex-probe.cjs requires TeX Live and reproduces a cached xdvipdfmx failure, then verifies automatic recovery and subsequent incremental builds.

路径及模板导航：`node tests/paths-probe.cjs`、`node tests/navigation-probe.cjs`。后者默认使用隔离的临时项目；可设置 NUAA_PROJECT 为论文目录，执行不构建、不写源文件的调用处导航检查。

诊断归属：`node tests/build-diagnostics-probe.cjs`；`workshop-probe.cjs` 还模拟两个主文件的外部构建日志，检查共享错误合并及独立清除。
