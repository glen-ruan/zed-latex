; For each declaration, prioritize using the optional toc entry instead of the
; curly group contents, which may contain non-text content

; FUTURE: when possible consider processing things like \texorpdfstring{.}{.}
; to only take pdfstring


; CHAPTER DECLARATIONS

(chapter
  command: _ @context
  !toc
  text: _ @name) @item

(chapter
  command: _ @context
  toc: _ @name) @item

; PART DECLARATIONS

(part
  command: _ @context
  toc: _ @name) @item

(part
  command: _ @context
  !toc
  text: _ @name) @item

; SECTION DECLARATIONS

(section
  command: _ @context
  toc: _ @name) @item

(section
  command: _ @context
  !toc
  text: _ @name) @item

; SUBSECTION DECLARATIONS

(subsection
  command: _ @context
  toc: _ @name) @item

(subsection
  command: _ @context
  !toc
  text: _ @name) @item

; SUBSUBSECTION DECLARATIONS

(subsubsection
  command: _ @context
  toc: _ @name) @item

(subsubsection
  command: _ @context
  !toc
  text: _ @name) @item


; Smaller document headings and template definitions
(paragraph command: _ @context !toc text: _ @name) @item
(paragraph command: _ @context toc: _ @name) @item
(subparagraph command: _ @context !toc text: _ @name) @item
(subparagraph command: _ @context toc: _ @name) @item
(new_command_definition command: _ @context declaration: _ @name) @item
(old_command_definition command: _ @context declaration: _ @name) @item
(environment_definition command: _ @context name: _ @name) @item

; Named floats and mathematical environments provide enclosing outline items.
((generic_environment
  begin: (begin name: (_) @name)) @item
  (#match? @name "^\\{(figure|table|subfigure|subtable|equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|subequations)\\*?\\}$"))

((math_environment
  begin: (begin name: (_) @name)) @item
  (#match? @name "^\\{(equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|subequations)\\*?\\}$"))

; Captions and keys remain separately searchable, including nested floats.
(caption command: _ @context !short long: _ @name) @item
(caption command: _ @context short: _ @name) @item
(label_definition command: _ @context name: _ @name) @item
