// BibTeX style's stack language; categories follow Workshop's BST syntax.
// Strings are delimited by quotes, not TeX escape sequences.
module.exports = grammar({
  name: 'bibtex_style',
  extras: $ => [/\s/, $.comment],
  word: $ => $.identifier,
  rules: {
    program: $ => repeat($._value),
    _value: $ => choice($.function_definition, $.block, $.string, $.number, $.quoted_identifier, $.keyword, $.identifier),
    function_definition: $ => seq('FUNCTION', '{', field('name', $.identifier), '}', field('body', $.block)),
    block: $ => seq('{', repeat($._value), '}'),
    string: $ => token(seq('"', /[^"\r\n]*/, '"')),
    number: $ => token(seq('#', /-?[0-9]+/)),
    quoted_identifier: $ => seq("'", $.identifier),
    keyword: $ => choice('ENTRY', 'INTEGERS', 'STRINGS', 'MACRO', 'READ', 'EXECUTE', 'ITERATE', 'REVERSE', 'SORT'),
    identifier: $ => /[^\s{}"%'#]+/,
    comment: $ => token(seq('%', /[^\r\n]*/)),
  },
});
