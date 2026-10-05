# Bundled Workshop package metadata

Source: https://github.com/James-Yu/LaTeX-Workshop
Revision: c5bdf430a1577e2df28139ed4b1bd5c9ad859865
Original path: data/packages/*.json
License: MIT, Copyright (c) 2016 James Yu; see LICENSE.LaTeX-Workshop.

workshop-packages.json combines 32 original package records under packages. Individual records retain upstream macros, argument snippets, environments, options and dependency fields. Top-level revision/source identify provenance; unavailable_dependencies lists requested dependencies with no imported record. The catalog is a scoped subset, not the complete Workshop database.

The Rust extension embeds this file and its license in extension.wasm and writes them to the extension work directory. No network fetch is performed during ordinary use.
