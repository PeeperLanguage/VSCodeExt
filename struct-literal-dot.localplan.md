TASK: VS Code struct literal dot syntax

STATUS: done

STEP: Grammar, examples, regression tests, compile, and rule audit complete.

NEXT: Optional manual VS Code integration check with migrated compiler/LSP.

NOTES:
 1. [x] Inspect status, instructions, package, grammar, tests, existing plan.
 2. [x] Add Type.{} highlighting and focused regression assertions.
 3. [x] Run compile and TextMate tests; audit changes.

DONE:
- Read peeper.localplan.md; unrelated historical work preserved.
- VSCodeExt has no .git, nor does parent. Branch creation unavailable; no initialization, commits, or pushes.
- No AGENTS.md or RULES.md found in VSCodeExt.
- Existing harness used vscode-textmate and vscode-oniguruma-wasm, neither installed nor declared; now declared as devDependencies with lockfile entries.
- Added literal-head rule with balanced same-line generic arguments and qualified names; existing punctuation handles .{} and field assignments unchanged.
- Expanded existing harness with 23 scope cases and multiline body/root-state assertions. File-input CLI preserved.
- README documents migration, examples, tests, and lexical limits.
- Final validation: npm run compile PASS; npm run test:grammar PASS (23 cases plus multiline assertions); node tm-test.mjs README.md PASS (file-input smoke test, not compiler validation).
- Initial test run failed only on new root-state assertion comparing against empty INITIAL stack; fixed to compare initialized grammar root.
- SHA-256 before/after compile identical for out/extension.js, out/extension.js.map, and peeper-vscode-0.0.1.vsix.
- Rules audit: no wrappers/helpers, stale aliases, ignored parameters, or duplicated behavior introduced. Removed redundant scoped-identifier include inside literal capture to preserve uppercase qualifier operator scopes. Existing CLI behavior and unrelated grammar patterns preserved.
- No commits/pushes; no other project roots edited.

CURRENT STATE:
- Grammar highlights migrated literal heads with existing type/builtin/operator/punctuation scopes; old named spelling does not gain literal-head highlighting.
- Reuse existing scopes and harness, preserve file-tokenization CLI mode.
- No compiler, Zed, tree-sitter, autocomplete, or snippets changes permitted.

STEP 1:
- Goal/why: recognize migrated named/generic/qualified literal heads without accepting old named spelling as literal heads.
- How: targeted TextMate pattern, existing harness assertions, README examples, test-only dependencies.
- Maintain: contextual .{}, field = value, existing scopes, comments/strings, unrelated files.
- Validate: npm run compile; npm run test:grammar; existing CLI harness on grammar fixture.
- Stop: all focused checks pass and report audit, no intermediate review required by user.

KNOWN RISKS:
- TextMate is lexical highlighting, not semantic validation; compiler/LSP rejects invalid syntax.
- Manual VS Code/LSP integration not exercised by token tests.
- Existing VSIX is unchanged and therefore does not contain this update; packaging intentionally not run.
- Multiline generic heads not recognized by new rule; multiline bodies and nested same-line generics covered.
- npm warned vscode-oniguruma-wasm@1.1.0 is deprecated; retained existing test engine. npm install audit reported zero vulnerabilities.
- No Git metadata available: cannot verify unrelated work via diff or create requested feature/struct-literal-dot branch.

RESUME CHECKLIST:
- Read this plan, syntaxes/peeper.tmLanguage.json, tm-test.mjs, package.json.
- Latest validation: npm run compile && npm run test:grammar && node tm-test.mjs README.md all passed.
- Optional next check: VS Code Extension Development Host with a compiler/LSP supporting migrated syntax. No autocomplete/snippet changes.
