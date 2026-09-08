TASK: VSCode extension for Peeper (highlighting + LSP)

STATUS: done

STEP: All steps done, packaged.

NEXT: Publish .vsix to marketplace (optional).

NOTES:
 1. [x] Research: VSCode LSP guide, syntax-highlight guide, compiler LSP inspection
 2. [x] Scaffold extension (package.json, tsconfig, language-configuration)
 3. [x] TextMate grammar derived from tree-sitter grammar + highlights.scm
 4. [x] LSP client spawning `peeper lsp` via vscode-languageclient
 5. [x] npm install + tsc compile clean
 6. [x] Verified `peeper lsp` initialize handshake returns hover/definition/rename/completion capabilities
 7. [x] Grammar tokenization verified via vscode-textmate on real x_test fixtures + synthetic snippet (all 19 scopes)
 8. [x] Fixed grammar ordering bug: declaration rules must precede keywords rule
 9. [x] Binary detection verified (found/not-found paths)
 10. [x] LSP handshake re-verified
 11. [x] Packaged peeper-vscode-0.0.1.vsix

DONE:
- Location: /home/itsfuad/Dev/Peeper/VSCodeExt (separate dir, not in Peeper-main repo)
- Binary resolution: peeper.server.path setting -> `peeper` on PATH
- Compiler LSP found at /home/itsfuad/Dev/Peeper/compiler/build/bin/peeper (NOT on PATH - user must set peeper.server.path or add to PATH)
- Server supports: hover, definition, rename, completion, full-sync diagnostics. No references/implementation.
- Validation: npm run compile clean; initialize handshake via stdin pipe returned correct capabilities JSON.

CURRENT STATE:
- VSCodeExt is standalone; Zed extension (language-support/) untouched.
- Highlighting is TextMate (VS Code cannot reuse tree-sitter WASM grammar directly); derived from grammars/peeper/grammar.js + languages/peeper/highlights.scm token categories.
- Client: src/extension.ts, vscode-languageclient ^9, stdio transport.

STEP 3 (remaining): manual E2E test
- goal: confirm highlighting + hover/def/diagnostics in Extension Dev Host
- how: F5 in VSCodeExt folder, open a .peep file, set peeper.server.path
- validate: hover shows type info, squiggles on errors, F12 jumps
- stop: user confirms features work

KNOWN RISKS:
- TextMate grammar is regex-based approximation; tree-sitter handles nesting better. Edge cases (nested generics, match arms) may tokenize imperfectly.
- Server uses full text sync (textDocumentSync: 1) - fine for small files.
- `peeper` not on PATH by default -> LSP won't start until setting configured.
- grammar `function_call` rule may over-highlight lowercase identifiers before `(`. Review during manual test.

RESUME CHECKLIST:
- Read src/extension.ts, syntaxes/peeper.tmLanguage.json
- Latest validation: npm run compile (clean), LSP handshake (pass)
- Next: manual test, then `npx @vscode/vsce package`
