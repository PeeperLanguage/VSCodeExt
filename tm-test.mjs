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
const builtin = 'support.type.primitive.peeper';
const plain = 'source.peeper';
const delimiter = 'punctuation.delimiter.peeper';
const bracket = 'punctuation.bracket.peeper';
const operator = 'keyword.operator.peeper';
const cases = [
  ['a << b >> c ^ d | e & ~f', [['<<', operator], ['>>', operator], ['^', operator], ['|', operator], ['&', operator], ['~', operator]]],
  ['p.* = @x', [['.', delimiter], ['*', operator], ['@', operator]]],
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
  // Types where they are named: after `:` and `->`, in an alias, and on an array literal.
  ['fn f(p: Point) -> Line {}', [['p', plain], ['Point', type], ['Line', type], ['->', operator]]],
  ['let p: Point = q;', [['p', plain], ['Point', type], ['q', plain]]],
  ['let mut p: point = q;', [['p', plain], ['point', type]]],
  ['const Limit: Meters = 3;', [['Limit', plain], ['Meters', type]]],
  ['struct Line { start: Point, end: Point }', [['Line', type], ['start', plain], ['Point', type], ['end', plain]]],
  ['fn f(a: &Point, b: &mut Point) -> *Point {}', [['a', plain], ['Point', type], ['mut', 'keyword.control.peeper'], ['*', operator]]],
  ['fn f(a: [3]Point, b: [&]Point, c: [&mut]Point) {}', [['Point', type], ['3', 'constant.numeric.dec.peeper'], ['mut', 'keyword.control.peeper']]],
  ['fn f(p: geometry::Point) -> Pkg::Line {}', [['geometry', plain], ['Point', type], ['Pkg', type], ['Line', type], ['::', operator]]],
  ['fn f(x: i64) -> i32 {}', [['i64', builtin], ['i32', builtin]]],
  ['fn f(x: [3]i32, y: &bool) {}', [['i32', builtin], ['bool', builtin], ['3', 'constant.numeric.dec.peeper']]],
  ['fn f(values: range[i32]) -> range[u8] {}', [['range', type], ['i32', builtin], ['u8', builtin]]],
  ['fn apply(callback: fn(_: Point, x: i32)) {}', [['fn', 'keyword.control.peeper'], ['Point', type], ['i32', builtin], ['callback', plain]]],
  // A type's functions: the owner is a type; `self` takes no type.
  ['fn Point::Sum(&self) -> i32 {}', [['Point', type], ['::', operator], ['Sum', 'entity.name.function.peeper'], ['self', 'variable.language.self.peeper'], ['i32', builtin]]],
  ['fn Point::Shift(&mut self, by: i32) {}', [['mut', 'keyword.control.peeper'], ['self', 'variable.language.self.peeper'], ['by', plain], ['i32', builtin]]],
  ['fn Point::Grow(mut self) -> Point { return self; }', [['Grow', 'entity.name.function.peeper'], ['self', 'variable.language.self.peeper']]],
  ['return self.x + p.y;', [['self', 'variable.language.self.peeper'], ['x', plain]]],
  ['type Origin = Point;', [['type', 'keyword.control.peeper'], ['Origin', type], ['=', operator], ['Point', type]]],
  ['type Size = [3]i32;', [['Size', type], ['i32', builtin]]],
  ['struct point { x: i32 }', [['point', type]]],
  ['let a = [2]Point{ p, q };', [['Point', type], ['a', plain], ['p', plain]]],
  ['let a = [_]i32{ 1 };', [['i32', builtin]]],
  ['let a = [1]geometry::Point{ p };', [['geometry', plain], ['Point', type], ['p', plain]]],
  // What only looks like a type.
  ['for v in 0..end:step {}', [['end', plain], ['step', plain]]],
  ['for v in 0..=end:step {}', [['end', plain], ['step', plain]]],
  ['for i, v in from..to:step {}', [['to', plain], ['step', plain]]],
  ['return (start..end:step);', [['step', plain]]],
  ['for v in 0..a + b:step {}', [['b', plain], ['step', plain]]],
  ['for v in 0..a+b:step {}', [['step', plain]]],
  ['for v in 0..p.size:step {}', [['size', plain], ['step', plain]]],
  ['for v in 0..n as i32:step {}', [['i32', builtin], ['step', plain]]],
  ['for v in 0..10:3 {}', [['3', 'constant.numeric.dec.peeper']]],
  ['let total = geometry::Side;', [['geometry', plain], ['Side', plain]]],
  ['if values[0] { }', [['values', plain]]],
  ['for i in 0..a[0] * count { }', [['count', plain]]],
  ['for i in 0..a[0]*count { }', [['count', plain]]],
  ['if a[0] & mask { }', [['mask', plain]]],
  ['x = a - b > c;', [['b', plain], ['c', plain]]],
  ['// let p: Point', [['Point', 'comment.line.double-slash.peeper']]],
  ['println("x: Point -> Line");', [['x: Point -> Line', 'string.quoted.double.peeper']]],
  ['let x = values[0] orelse { };', [['orelse', 'keyword.control.peeper']]],
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
