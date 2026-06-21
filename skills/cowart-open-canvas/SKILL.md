---
name: cowart-open-canvas
description: Open the Cowart local web service, a tldraw-powered infinite canvas. Use when the user asks to open, launch, view, or work in the Cowart canvas or wants an infinite canvas inside Codex.
---

# Cowart Open Canvas

## Workflow

1. Start the local Cowart web service with the user's current Codex project directory, and keep the process running:

```bash
./scripts/start-canvas.sh /path/to/user/codex-project
```

Run this from the Cowart repository root. Use the active workspace or project directory from the current Codex session for `/path/to/user/codex-project`. Do not pass the Cowart repository directory.

2. Open the resulting local URL in the Codex in-app browser when the Browser tool chain is available.

The default URL is `http://127.0.0.1:43217/`. If the service output prints a different `Local:` URL, open that actual URL instead. When the canvas is empty, Cowart automatically creates one initial AI image holder; no special URL parameter is needed.

Use the Browser plugin's `control-in-app-browser` skill as the source of truth for opening the in-app browser. The correct model-side flow is:

1. Use tool discovery for the Node REPL JavaScript execution tool if it is not already visible. The required callable tool is the `js` execution tool, commonly exposed as `mcp__node_repl__js`; `js_reset` and `js_add_node_module_dir` are not sufficient for browser control.
2. In a fresh Node REPL session, bootstrap the Browser runtime with the Browser plugin's packaged client. Resolve `browser-client.mjs` from the current environment's `CODEX_HOME` (default `~/.codex`) so the skill does not depend on a specific username or plugin version:

```js
const os = await import("node:os");
const path = await import("node:path");
const fs = await import("node:fs/promises");

const homeDir = nodeRepl.homeDir ?? os.homedir();
const codexHome = globalThis.process?.env?.CODEX_HOME ?? path.join(homeDir, ".codex");
const browserRoot = path.join(codexHome, "plugins", "cache", "openai-bundled", "browser");
const versions = (await fs.readdir(browserRoot)).sort();
const browserClientPath = path.join(browserRoot, versions.at(-1), "scripts", "browser-client.mjs");

const { setupBrowserRuntime } = await import(browserClientPath);
await setupBrowserRuntime({ globals: globalThis });
globalThis.browser = await agent.browsers.get("iab");
nodeRepl.write(await browser.documentation());
```

3. Select or create a tab, make the browser visible because this skill is meant to open the canvas for the user, and navigate with `tab.goto(url)`:

```js
await (await browser.capabilities.get("visibility")).set(true);
let selectedTab = null;
try {
  selectedTab = await browser.tabs.selected();
} catch (error) {
  if (!String(error?.message ?? error).includes("No active tab")) throw error;
}
globalThis.tab = selectedTab ?? await browser.tabs.new();
if ((await tab.url()) !== url) {
  await tab.goto(url);
}
```

Do not call `tab.goto(url)` if the selected tab is already on the Cowart URL; that reloads the page and can disturb work in progress. If browser control is unavailable, or browser bootstrap fails before navigation with a tool-layer/session-metadata error such as `codex/sandbox-state-meta: missing field sandboxPolicy`, treat the Cowart service start as successful and give the user the local URL instead of retrying browser control.

## Constraints

Do not inspect canvas files, call canvas APIs, run builds, check storage layout, take screenshots, or perform other validation steps unless opening the canvas fails or the user explicitly asks for those checks.
