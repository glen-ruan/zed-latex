# Verification

Run `node tests/workshop-probe.cjs` with latexmk/xelatex/BibTeX on PATH. The companion test checks root comments/cycles/ambiguity, Workshop placeholders, recipes, completion, definitions, structure, BibTeX formatting, real XeLaTeX compilation in a path with spaces, child-file compiler diagnostics, clearing errors and automatic build on save. Missing formatter reporting and `.bst` exclusion are also checked. `SKIP_TEX_BUILD=1` skips the real compiler portion.

`node --liftoff-only tests/grammar-smoke.cjs` checks parser/query behavior using the isolated `.dev` web-tree-sitter runtime and generated LaTeX WASM. The local Node default optimizing WASM tier exhausts memory; a pass with liftoff-only does not prove Zed host stability.

No test edits the user's thesis or Zed settings. Installing the development extension and verifying native Zed behavior remain separate manual checks.

Set TEX_FMT to a formatter executable to verify actual LaTeX formatting and idempotence. Standard extension build: cargo build --locked --target wasm32-wasip2. Native Zed installation remains a separate acceptance step.
BST: node --liftoff-only tests/bst-smoke.cjs validates independent highlights/outline/folds/indents and four standard style files. Its test WASM is built separately for web-tree-sitter; Zed builds the native grammar from the manifest-pinned remote revision with its managed WASI SDK.

PDF recovery: node tests/recovery-probe.cjs checks retry decisions and a real Windows exclusive PDF lock. node tests/recovery-tex-probe.cjs requires TeX Live and reproduces a cached xdvipdfmx failure, then verifies automatic recovery and subsequent incremental builds.
