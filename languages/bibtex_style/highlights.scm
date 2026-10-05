(comment) @comment
(string) @string
(number) @number
(keyword) @keyword
"FUNCTION" @keyword
(identifier) @variable
(function_definition name: (identifier) @function)
((identifier) @keyword.control
 (#match? @keyword.control "^(if|while)\\$$"))
((identifier) @function.builtin
 (#match? @function.builtin "^(add\\.period|call\\.type|change\\.case|chr\\.to\\.int|cite|duplicate|empty|format\\.name|int\\.to\\.chr|int\\.to\\.str|missing|newline|num\\.names|pop|preamble|purify|quote|skip|stack|substring|swap|text\\.length|text\\.prefix|top|type|warning|width|write)\\$$"))
((identifier) @constant.builtin
 (#match? @constant.builtin "^(entry|global)\\.max\\$$"))
((identifier) @variable.builtin
 (#eq? @variable.builtin "sort.key$"))
((identifier) @operator
 (#match? @operator "^(:=|[<>=+*\\-]|and|or|not)$"))
"'" @punctuation.special
["{" "}"] @punctuation.bracket
