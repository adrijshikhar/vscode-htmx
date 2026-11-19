# HTMX (VS Code Extension)

Official Visual Studio Code extension for [HTMX](https://htmx.org/) (including HTMX 2.0), powered by the [`htmx-analyzer`](https://github.com/adrijshikhar/htmx-analyzer) language server.

[![CI](https://github.com/adrijshikhar/vscode-htmx/actions/workflows/ci.yml/badge.svg)](https://github.com/adrijshikhar/vscode-htmx/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

---

## Features

- **Target Navigation & Cross-File Jump (`F12` / `gd`)**: Jump directly from target selectors (`hx-target="#id"`, `hx-indicator="#id"`, `hx-swap-oob="true:#id"`, `hx-sync="#id:event"`) to the declaring element `<tag id="id">`. Supports LSP `LocationLink` for high-precision cursor targeting.
- **Find References (`Shift+F12`)**: Discover all HTMX attributes in the document and workspace referencing any given element `<tag id="id">`.
- **Cross-Template Workspace Indexing**: Fast in-memory symbol index resolves target IDs across partials and layout templates on startup, eliminating false-positive `HTMX004` diagnostics.
- **Intelligent Autocompletion**: 34 active core attributes (`hx-*`, `data-hx-*`), swap styles, trigger events, modifiers, CSS selector targets, and extensions (`sse`, `ws`, `preload`, `response-targets`).
- **Context-Aware Hover Documentation**: Full Markdown documentation, syntax guides, and examples directly from the HTMX specification.
- **Static Analysis & Diagnostics**: Real-time linting for deprecated HTMX 1.x patterns (`HTMX001`), invalid swap styles and durations (`HTMX002`), malformed trigger syntax and polling intervals (`HTMX003`), and broken target selector IDs (`HTMX004`).
- **Quick-Fix Code Actions**: One-click refactorings (e.g. migrating `hx-ws` or `hx-sse` to HTMX 2.0 `hx-ext="ws"` / `hx-ext="sse"`).
- **Automatic Binary Management**: Zero-configuration setup! Automatically downloads, verifies, and executes the latest prebuilt `htmx-analyzer` binary from GitHub Releases, or seamlessly uses your system `PATH`.

---

## Supported Template Languages

The extension automatically activates for:
- **HTML** (`.html`, `.htm`)
- **Django / Jinja** (`.jinja`, `.jinja2`, `.j2`, `htmldjango`)
- **PHP** (`.php`)
- **Blade** (`.blade.php`)
- **Astro** (`.astro`)
- **Svelte** (`.svelte`)
- **Vue** (`.vue`)
- **Templ** (`.templ`)
- **Ruby ERB** (`.erb`)

---

## Installation & Setup

### Automatic (Recommended)
1. Install this extension from the VS Code Marketplace or Open VSX.
2. Open any HTML or template file containing HTMX attributes.
3. The extension automatically detects your OS and architecture, downloads the latest `htmx-analyzer` binary, verifies its SHA-256 checksum, and launches the server.

### Manual / System PATH
If you prefer building or installing `htmx-analyzer` via Cargo:
```bash
cargo install htmx-analyzer
```
The extension will automatically discover `htmx-analyzer` on your `PATH`.

Alternatively, specify an explicit path in your VS Code `settings.json`:
```json
{
  "htmx.server.path": "/usr/local/bin/htmx-analyzer"
}
```

---

## Extension Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `htmx.enable` | `boolean` | `true` | Enable or disable HTMX language intelligence. |
| `htmx.server.path` | `string` | `""` | Custom path to the `htmx-analyzer` executable. |
| `htmx.diagnostics.enable` | `boolean` | `true` | Enable or disable real-time HTMX diagnostics. |
| `htmx.diagnostics.severity` | `object` | `{}` | Customize rule severities (e.g. `{"HTMX001": "warning", "HTMX004": "hint"}`). |
| `htmx.trace.server` | `string` | `"off"` | Trace communication between VS Code and the LSP server (`"off"`, `"messages"`, `"verbose"`). |

---

## Commands

- **HTMX: Restart Language Server** (`htmx.restartServer`): Restarts the language server process and reloads workspace indexing.
- **HTMX: Download / Update Language Server Binary** (`htmx.downloadServer`): Force-downloads and verifies the latest `htmx-analyzer` binary from GitHub Releases.

---

## License

Apache-2.0 © [Adrij Shikhar](https://github.com/adrijshikhar)
