import assert from 'node:assert/strict';
import tm from 'vscode-textmate';
import { readFile } from 'fs/promises';
import onig from 'vscode-oniguruma-wasm';

const wasm = await readFile('node_modules/vscode-oniguruma-wasm/release/onig.wasm');
await onig.loadWASM(wasm.buffer);

const registry = new tm.Registry({
  onigLib: Promise.resolve({ createOnigScanner: s => new onig.OnigScanner(s), createOnigString: s => new onig.OnigString(s) }),
  loadGrammar: async () => JSON.parse(await readFile('syntaxes/peeper.tmLanguage.json', 'utf8')),
});

const grammar = await registry.loadGrammar('source.peeper');
if (!grammar) throw new Error('grammar failed to load');
console.log('grammar loaded OK');

const type = 'entity.name.type.peeper';
const builtin = 'support.type.builtin.peeper';
const delimiter = 'punctuation.delimiter.peeper';
const bracket = 'punctuation.bracket.peeper';
const operator = 'keyword.operator.peeper';
const cases = [
  ['fn f(p: rawptr i32) -> rawptr cstr {}', [['rawptr', builtin], ['i32', builtin], ['cstr', builtin]]],
  ['Point.{ x = 1 }', [['Point', type], ['.', delimiter], ['{', bracket], ['=', operator]]],
  ['Box<i32>.{ value = 1 }', [['Box', type], ['i32', builtin], ['<', operator], ['>', operator]]],
  ['pkg::Point.{}', [['pkg', type], ['Point', type], ['::', operator]]],
  ['Pkg::Point.{}', [['Pkg', type], ['Point', type], ['::', operator]]],
  ['Outer<i32>::Inner<Point>.{}', [['Outer', type], ['i32', builtin], ['Inner', type], ['Point', type], ['::', operator]]],
  ['pkg :: Outer<Box<i32>> :: Inner<Point>.{}', [['pkg', type], ['Outer', type], ['Box', type], ['Inner', type], ['Point', type], ['::', operator]]],
  ['pkg::Box<other::Box<i32>>.{}', [['pkg', type], ['Box', type], ['other', type], ['i32', builtin]]],
  ['Outer.{ child = Inner.{ x = 1 }, inferred = .{} }', [['Outer', type], ['Inner', type], ['child', 'source.peeper'], ['inferred', 'source.peeper']]],
  ['.{}', [['.', delimiter], ['{', bracket], ['}', bracket]]],
  ['point.{}', [['point', type]]],
  ['Point . { x = 1 }', [['Point', type]]],
  ['.Point{ x = 1 }', [['Point', 'source.peeper']]],
  ['.Box<i32>{ value = 1 }', [['Box', 'source.peeper']]],
  ['.pkg::Point{}', [['Point', 'source.peeper']]],
  ['.Point.{}', [['Point', 'source.peeper']]],
  ['Box<Box<i32>>.{}', [['Box', type], ['i32', builtin]]],
  ['Outer.{ child = .{ x = 1 } }', [['Outer', type], ['child', 'source.peeper'], ['=', operator]]],
  ['Point { x = 1 }', [['Point', 'source.peeper']]],
  ['value.field', [['field', 'source.peeper']]],
  ['left < right > other', [['left', 'source.peeper'], ['right', 'source.peeper']]],
  ['// Point.{}', [['Point', 'comment.line.double-slash.peeper']]],
  ['"Point.{}"', [['Point', 'string.quoted.double.peeper']]],
  ['/* Box<i32>.{} */', [['Box', 'comment.block.peeper']]],
  ['struct Point { x: i32 }', [['Point', type], ['struct', 'keyword.control.peeper'], ['i32', builtin]]],
  ['fn main() { call() }', [['main', 'entity.name.function.peeper'], ['call', 'entity.name.function.call.peeper']]],
  ['let count = maybe orelse 0;', [['let', 'keyword.control.peeper'], ['orelse', 'keyword.control.peeper'], ['maybe', 'source.peeper']]],
  ['Slot::Value with none => {}', [['Slot', type], ['with', 'keyword.control.peeper'], ['none', 'constant.language.peeper'], ['=>', operator]]],
  ['Slot::Inner with .{ radius, scale as factor } => {}', [['with', 'keyword.control.peeper'], ['as', 'keyword.control.peeper'], ['radius', 'source.peeper'], ['factor', 'source.peeper']]],
  ['let .{ first as head, _ } = pair;', [['let', 'keyword.control.peeper'], ['as', 'keyword.control.peeper'], ['head', 'source.peeper']]],
  ['if &shape is Shape::Circle { }', [['is', 'keyword.control.peeper'], ['Shape', type], ['&', operator]]],
];
for (const [line, checks] of cases) {
  const { tokens } = grammar.tokenizeLine(line, tm.INITIAL);
  for (const [text, scope] of checks) {
    const start = line.indexOf(text);
    assert.notEqual(start, -1, `missing test text: ${text}`);
    const token = tokens.find(t => t.startIndex <= start && t.endIndex >= start + text.length);
    assert.equal(token?.scopes.at(-1), scope, `${line}: ${text}`);
  }
}
console.log(`${cases.length} grammar regression cases passed`);

const text = process.argv[2]
  ? await readFile(process.argv[2], 'utf8')
  : 'Outer.{\n child = Box<i32>.{\n value = 1\n },\n inferred = .{}\n}\nfn after() {}';
let ruleStack = tm.INITIAL;
const counts = {};
for (const line of text.split('\n')) {
  const r = grammar.tokenizeLine(line, ruleStack);
  ruleStack = r.ruleStack;
  for (const t of r.tokens) {
    const scope = t.scopes[t.scopes.length - 1];
    counts[scope] = (counts[scope] || 0) + 1;
  }
}
if (!process.argv[2]) {
  const rootStack = grammar.tokenizeLine('', tm.INITIAL).ruleStack;
  assert.equal(ruleStack.equals(rootStack), true, 'grammar state leaked after literal body');
  assert.equal(counts[type], 2, 'multiline body lost named literal types');
  assert.equal(counts['entity.name.function.peeper'], 1, 'declaration after literal body lost scope');
}
console.log('token scopes found:', Object.keys(counts).sort().join(', '));
