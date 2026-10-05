# BibTeX Style parser

An original Tree-sitter parser for BibTeX's .bst stack language. Highlight categories are checked against LaTeX Workshop's syntax/BibTeX-style.tmLanguage.json (https://github.com/James-Yu/LaTeX-Workshop/blob/master/syntax/BibTeX-style.tmLanguage.json). This parser does not reuse the TeX or BibTeX-data grammar and does not inject TeX into strings.

Generate src/parser.c with tree-sitter generate --abi 15 grammar.js. Zed compiles it with its managed WASI SDK. Generated headers originate from Tree-sitter (https://github.com/tree-sitter/tree-sitter, MIT).

Validated using plain.bst, unsrt.bst, alpha.bst and abbrv.bst, and a fixture with nested blocks, negative integer literals, quoted variables and TeX-looking strings.
LICENSE.tree-sitter applies to the generated Tree-sitter headers in src/tree_sitter, not to the original BST grammar.
