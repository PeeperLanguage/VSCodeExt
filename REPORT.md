# Peeper VS Code Extension — Work Report (v2)

**Date:** 2026-08-31
**Scope:** `/home/itsfuad/Dev/Peeper/VSCodeExt` (new) + `Peeper-main/internal/lsp`, `internal/semantics/resolver` (one guard edit, disclosed in §2.6)
**v2:** incorporates architectural review — revised fault-isolation claims, restructured plan (Phases A–E), added revision safety, panic fingerprinting, prefix/fuzz testing, recovered-AST contract as central objective.

---

## 0. Assessment Summary

| Area | Assessment |
| --- | --- |
| VS Code extension architecture | Good / essentially complete |
| Packaging + activation | Solved properly |
| Flatpak/path handling | Reasonable, pragmatic |
| TextMate highlighting | Correct approach |
| LSP client setup | Correct after `--stdio` discovery |
| Resolver nil fix | Likely correct but currently unproven |
| LSP resilience proposal | Directionally correct, refined in v2 |
| Error-tolerant compiler architecture | Main remaining engineering problem |
| Separate subprocess rejection | Kept, but justification softened (see §3.4) |

The extension is no longer the interesting problem. The compiler frontend is now **used interactively**, and interactive compilation has different robustness requirements from batch compilation.

---

## 1. What Was Built

A VS Code extension for the Peeper language at `/home/itsfuad/Dev/Peeper/VSCodeExt`:

| Component | File | Notes |
| --- | --- | --- |
| Manifest | `package.json` | `peeper` language (`.peep`), grammar contribution, settings `peeper.server.path` / `peeper.server.trace`, activation `onLanguage:peeper` |
| Syntax highlighting | `syntaxes/peeper.tmLanguage.json` | TextMate grammar, 19 scope categories, derived from the Zed extension's tree-sitter `grammar.js` + `highlights.scm` |
| LSP client | `src/extension.ts` | Spawns `peeper lsp` (stdio) via `vscode-languageclient`, bundled with esbuild |
| Editor config | `language-configuration.json` | Comments/brackets/auto-close, mirrors Zed `config.toml` |
| Dev tooling | `.vscode/launch.json`, `tm-test.mjs` | F5 debug host; grammar tokenization harness (kept — caught a real regression; move to `test/` or `scripts/` + wire `npm run test:grammar`) |
| Artifact | `peeper-vscode-0.0.1.vsix` | Installable, ~118 KB |

**Key design decision:** VS Code cannot reuse the Zed extension's tree-sitter WASM grammar. Highlighting was reimplemented as a TextMate grammar from the same token categories — one language definition, two editor-native renderings. LSP needs no reimplementation: both editors talk to the same `peeper lsp` binary.

**Binary resolution order:** `peeper.server.path` setting → `peeper` on PATH → fallback probes (`%LOCALAPPDATA%\Peeper\bin` on Windows / `~/.peeper/bin` on Unix, then `~/.local/bin`, `/usr/local/bin`, `/usr/bin`). If not found: highlighting still works, popup offers "Install Peeper" → opens compiler releases page. Do not grow the probe list further — the stable contract is: explicit setting → extension-host PATH → official install location. For Flatpak, `peeper.server.path` is the documented deterministic escape hatch.

**Future improvement (not v0.0.1):** LSP semantic tokens layered on top of TextMate, giving type/symbol-aware highlighting regex cannot provide.

---

## 2. Issues Found & Fixed (chronological)

### 2.1 Grammar ordering bug (caught by verification loop)
- **Symptom:** `struct Point` / `fn main` never got `entity.name.type` / `entity.name.function` scopes on real `x_test/` fixtures.
- **Cause:** TextMate tries patterns in order; the `keywords` rule consumed `struct`/`fn` before the declaration rules could match their two-token pattern.
- **Fix:** moved `type_declaration` / `function_declaration` ahead of `keywords`. (Also restored `builtin_types`, accidentally dropped during the reorder.)
- **Validation:** re-tokenized `copy_move_semantics`, `enum_schema_declarations` fixtures — scopes now hit.

### 2.2 Extension never activated
- **Symptom:** Runtime Status "Not yet activated"; highlighting worked (declarative grammars don't need activation — expected).
- **Fix:** `"activationEvents": ["onLanguage:peeper"]` + logging output channel + error popup on start failure.

### 2.3 Missing dependency in package (caught via Dev Tools console)
- **Symptom:** `Cannot find module 'vscode-languageclient/node'` — activation failed.
- **Cause:** `vsce` packaged only source files, not `node_modules`.
- **Fix:** esbuild bundling into a single `out/extension.js` (`--external:vscode`). Verified the bundle inside the vsix.

### 2.4 Binary not found despite being on PATH
- **Cause:** Flatpak VS Code — extension host gets sandbox PATH; integrated terminal runs a login shell that sources the user profile.
- **Fix:** cross-platform fallback probes for official install locations.

### 2.5 Server crash loop — `usage: peeper lsp` (root cause in client lib)
- **Cause:** for `Executable` servers, `vscode-languageclient` appends `--stdio` when `transport: TransportKind.stdio` is set explicitly. `peeper lsp` takes zero args (`MaxArgs: 0` in `cmd/dispatch.go`) → usage error → exit 1 → crash loop. Zed never adds this arg.
- **Fix:** omit `transport` — client still uses stdio pipes but passes only `['lsp']`. Comment added in `extension.ts`.
- **Follow-up (open):** add a regression test — a mocked executable that records argv, asserting `peeper lsp` is spawned and `--stdio` is never appended. Otherwise a future "more explicit" edit reintroduces the bug.

### 2.6 ✅ LSP working — then compiler panic on incomplete code
- **Cause (compiler bug):** `internal/semantics/resolver/resolver.go:82` — `fn.Name.Name` deref. The error-recovering parser emits `FnDecl` nodes with nil `Name` on partial input. Adjacent code guarded `r == nil || fn == nil`; the `fn.Name` case was missed.
- **Status:** ⚠️ **one edit applied, not validated** (disclosed): `else if fn.Name != nil && fn.Name.Name != ""` guard before `ModuleScope.Lookup`.
- **Caveat:** the guard is locally reasonable, but the real test is whether the **entire editor analysis pipeline** (parser → resolver → type check → editor features) survives the malformed node — skipping lookup could move a crash downstream if other tables assume registration. See Phase A.

---

## 3. Current Findings

### 3.1 The biggest finding is not the nil dereference
The real bug class: **the parser produces partially valid ASTs that downstream semantic phases are not prepared to consume.** `fn.Name != nil` fixes one crash; if the parser performs error recovery, nil/missing/error nodes are part of the effective AST contract. This becomes the central objective of Phase D.

Two models:
- **Model A — semantics accepts malformed AST:** defensive checks spread through resolver, type checker, borrow checker, lowerer, IDE features. Duplicated partial-AST logic everywhere.
- **Model B — parser establishes explicit recovered-AST invariants (preferred):** e.g. `FnDecl.Name` is always non-nil; on malformed input it is a synthetic missing-identifier node with empty text and an error marker. Downstream can traverse syntax safely. Not every field must be non-null — but which invariants hold *under syntax errors* must be a deliberate decision.

### 3.2 Architecture today
```
VS Code ──┐
          ├── Peeper LSP ─── compiler libraries (in-process)
Zed ──────┘
```
The Peeper LSP is already the shared editor-language integration layer. What it lacks is a **robust compiler-service boundary**:

```
LSP
 │ safe analysis boundary
 ▼
compiler frontend
```

### 3.3 `recover()` is panic containment, not process isolation
`recover()` protects against ordinary panics (nil deref, index out of range, bad assertion) in goroutines we wrap. It does **not** isolate against `os.Exit`, fatal runtime errors, stack overflow, OOM kill, deadlocks, runaway goroutines/CPU loops, corrupted shared state mutated before a panic, or future CGO crashes.

### 3.4 Subprocess: rejected *for now*, with corrected justification
A compiler subprocess is currently **unnecessary** because expected failure modes are ordinary frontend panics from malformed input, cheaply containable in-process. It remains a valid **future escalation mechanism** if the compiler becomes complex/untrusted enough that LSP uptime must be independent of compiler health. (v1's claim that in-process `recover()` provides "equivalent isolation" was wrong and is retracted.)

### 3.5 Two governing invariants
> **I1:** Invalid or incomplete Peeper source may produce parser/semantic errors, but it must never terminate the language server.
> **I2:** A failed analysis must never become the current semantic snapshot.

---

## 4. Proposed Plan (Phases A–E)

### Phase A — Close the known bug
- Validate the existing `fn.Name` guard.
- Test the **whole pipeline** on the malformed node, not just `resolveFunction` — confirm no downstream crash from the skipped registration.
- Add malformed-source regression fixture(s) under `x_test/`.
- `go test ./internal/...` + real fixtures via `build/bin/peeper`.
- Goal: repository back to known-good.

### Phase B — Establish the LSP/compiler failure boundary
- **One centralized panic wrapper**, not scattered `defer recover()`:
  ```go
  func protected[T any](label string, fn func() (T, error)) (result T, err error) {
      defer func() {
          if r := recover(); r != nil {
              logCompilerPanic(label, r, debug.Stack())
              err = fmt.Errorf("compiler panic: %v", r)
          }
      }()
      return fn()
  }
  ```
  plus a goroutine equivalent. Auditable rule: *anything crossing from LSP orchestration into compiler execution crosses a panic boundary.*
- Wrap every compiler-owned goroutine (`advanceModulesThrough` per-module goroutines) and synchronous compiler entry points used by LSP requests.
- **Snapshot commit-or-discard (I2):** on panic, discard the entire analysis snapshot — do not reuse partially mutated semantic state on the next didChange. Recovery preserves the *server*, not the *failed compilation state*. Verify how much state the LSP already rebuilds per update before assuming retry is safe.
- **Do not publish panics as user diagnostics.** Internal errors go to the LSP log (URI, doc version, phase, panic value, stack). Editor behavior: keep parser diagnostics if available, return no semantic result for the failed request (hover/definition → null), optionally one unobtrusive internal-error notification. Internal failures must not masquerade as language errors.

### Phase C — Protect against stale work
- Associate analysis results with document revision/generation; discard results for non-current versions (stale didChange racing a newer edit).
- Cancel obsolete analysis where possible; malformed code can hit expensive paths.
- Natural fit with Phase B.

### Phase D — Define the malformed-AST contract (Model B)
- Document: which node fields can be absent, which nodes can be synthetic, what error nodes look like, which invariants survive parser recovery.
- Prefer normalized recovered nodes (e.g. missing identifier nodes) at the parser boundary so all consumers share one guarantee — avoiding per-phase defensive checks (Model A's duplication).

### Phase E — Robustness testing
- **Progressive-typing (prefix) tests:** feed every prefix of valid source through parse+analysis:
  ```go
  for i := 0; i <= len(src); i++ { analyze(src[:i]) }
  ```
  (rune/token boundaries for Unicode identifiers). Approximates what an editor actually sends; finds far more than hand-picked fixtures.
- **Fuzzing:** invariant is simply *no editor-provided source may panic the compiler frontend* (diagnostics allowed, panic forbidden). Go fuzzing, seeded with valid files, truncations, unmatched braces, incomplete generics/enums/structs/imports/expressions.
- Panic regression tests for each fixed crash.
- Run the **whole semantic pipeline**, not isolated functions.

### Panic noise control (replaces "crash counter + backoff")
With `recover()` working, the process no longer restarts, so backoff is wrong (it would just add typing latency). Instead: **panic fingerprinting + rate limiting** — fingerprint by stack + file + compiler revision; log first occurrence fully, suppress duplicates for an interval. Otherwise typing `f` → `fn` → `fn ` → `fn a`… generates dozens of identical stack traces.

---

## 5. Validation Summary (what was actually run)

| Check | Result |
| --- | --- |
| `npm run compile` (tsc + esbuild) | ✅ clean |
| JSON validity (3 manifests) | ✅ |
| Grammar tokenization (vscode-textmate, 6 real `x_test/` fixtures + synthetic) | ✅ all 19 scopes |
| Binary detection (found / not-found / fallback paths) | ✅ |
| `peeper lsp` initialize handshake (both binaries) | ✅ correct capabilities |
| Live in editor (Flatpak VS Code) | ✅ highlighting, activation, hover/def/diagnostics |
| vsce package | ✅ 9 files, ~118 KB |
| Resolver nil-guard (2.6) | ⚠️ applied, **not validated** — pending Phase A |

---

## 6. Open Items

1. Phase A: validate resolver guard + whole-pipeline malformed-node test + fixture — **in progress, incomplete**.
2. Phase B: centralized panic boundary + snapshot discard + internal-error logging — not started.
3. Phase C: revision tracking + cancellation — not started.
4. Phase D: recovered-AST contract documentation + parser normalization — not started.
5. Phase E: prefix tests + fuzz target — not started.
6. `--stdio` argv regression test for the extension client (§2.5 follow-up).
7. Move `tm-test.mjs` to `test/` or `scripts/`, wire `npm run test:grammar`.
8. Versioning: stay on `0.0.1` until first package intended for others; bump to `0.0.2` if a fixed vsix is distributed.
