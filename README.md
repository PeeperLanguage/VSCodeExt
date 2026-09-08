# Peeper Language Support for VS Code

Syntax highlighting + LSP integration (hover, go to definition, completion, rename, diagnostics) for the [Peeper](https://github.com/PeeperLanguage) language.

## Features

- TextMate syntax highlighting for `.peep` files
- Language server integration using the compiler's built-in LSP (`peeper lsp`, stdio JSON-RPC)
  - Hover info
  - Go to definition
  - Autocomplete
  - Rename
  - Publish diagnostics (errors/warnings as you type)

## Struct literals

Named literals use `Type.{ ... }`; contextual literals remain `.{ ... }`.
Field initializers still use `field = value`:

```peeper
Point.{ x = 1, y = 2 }
Box<i32>.{ value = 1 }
pkg::Point.{ x = 1, y = 2 }
Outer.{ child = Point.{ x = 1, y = 2 }, inferred = .{} }
pkg::Box<Box<i32>>.{ value = Box<i32>.{ value = 1 } }
```

Old named spelling `.Point{ ... }` is no longer valid. TextMate highlights
literal type heads (including nested generic arguments on one line); syntax
errors and semantic validation come from the installed compiler/LSP, which must
support the migrated syntax. Multiline literal bodies work; multiline generic
heads are not covered by this lexical rule. Autocomplete and snippets are unchanged.

## Requirements

The `peeper` binary must be available. Resolution order:

1. `peeper.server.path` setting (explicit path to binary)
2. `peeper` on `PATH`

Build the compiler from the repo:

```sh
cd Peeper-main
go build -o build/bin/peeper ./cmd
# then either add build/bin to PATH or set "peeper.server.path" to its absolute path
```

## Settings

| Setting | Description |
| --- | --- |
| `peeper.server.path` | Absolute path to `peeper` binary. Empty = use `peeper` from PATH. |
| `peeper.server.trace` | Trace client/server communication (`off` / `messages` / `verbose`). |

## Commands

- `Peeper: Restart Language Server`

## Development

```sh
npm install
npm run compile
npm run test:grammar
# Optional: tokenize an additional Peeper source file with the same harness:
# node tm-test.mjs path/to/example.peep
# open this folder in VS Code, press F5 to launch Extension Development Host
```

Package a `.vsix`:

```sh
npx @vscode/vsce package
```

## How it differs from the Zed extension

The Zed extension (`language-support/`) uses tree-sitter grammars compiled to WASM and declares the language server via `extension.toml`; Zed spawns `peeper lsp` itself. VS Code cannot reuse the tree-sitter grammar directly, so highlighting here is a TextMate grammar (`syntaxes/peeper.tmLanguage.json`) derived from the same tree-sitter grammar and `highlights.scm` token categories. LSP integration uses the standard `vscode-languageclient` node SDK, which spawns the same `peeper lsp` stdio server.
