import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

// Consume the launcher's public JSON output, never the runtime credentials file.
async function main() {
  const { values } = parseArgs({ options: {
    harness: { type: "string", default: "codex" },
    app: { type: "string" },
    skills: { type: "string" },
    register: { type: "boolean", default: false },
    codex: { type: "string", default: "codex" },
    "print-only": { type: "boolean", default: false },
  } });
  if (!["codex", "claude", "cursor", "opencode", "gemini", "workbuddy", "generic"].includes(values.harness)) {
    throw new Error("Unknown harness. Use codex, claude, cursor, opencode, gemini, workbuddy or generic.");
  }
  if (!values.app || !values.skills) throw new Error("--app and --skills are required.");
  if (values.register && (!["codex", "workbuddy"].includes(values.harness) || values["print-only"])) {
    throw new Error("--register is available for Codex/WorkBuddy and cannot be combined with --print-only.");
  }
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const state = JSON.parse(input.replace(/^\uFEFF/, ""));
  if (typeof state.runtime !== "string" || !isAbsolute(state.runtime)) {
    throw new Error("Expected an absolute runtime path from FilmFraylo start output.");
  }
  const command = process.execPath;
  const mcpDirectory = state.mcpDirectory ?? resolve(values.app, "build/mcp");
  if (!isAbsolute(mcpDirectory)) throw new Error("Expected absolute MCP directory.");
  const args = [resolve(mcpDirectory, "stdio.js"), "--runtime", state.runtime, "--external"];
  let config = { mcpServers: { filmfraylo: { command, args } } };
  let configFormat = "json";
  if (values.harness === "codex") {
    configFormat = "toml";
    config = `[mcp_servers.filmfraylo]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\ntool_timeout_sec = 1800\n`;
  } else if (values.harness === "opencode") {
    config = { mcp: { filmfraylo: { type: "local", command: [command, ...args], enabled: true } } };
  } else if (values.harness === "claude") {
    config.mcpServers.filmfraylo.type = "stdio";
  } else if (values.harness === "gemini") {
    config.mcpServers.filmfraylo.timeout = 1800000;
  }
  if (!values["print-only"]) {
    // Reuse the official installer for the dependency and optional Codex registration.
    // Do not reinstall FilmFraylo: a newer standalone Skill must work with an older release.
    const result = spawnSync(command, [resolve(mcpDirectory, "install.js"),
      "--runtime", state.runtime, "--skills", resolve(values.skills), "--name", "filmfraylo",
      ...(values.harness === "codex" ? ["--register", "--codex", values.codex] : []),
    ], { encoding: "utf8", windowsHide: true, shell: false });
    if (result.error || result.status !== 0) {
      throw new Error(result.error?.message || result.stderr.trim() || "Official MCP dependency installation failed.");
    }
  }
  let configPath;
  let registered = values.harness === "codex" && !values["print-only"];
  if (["claude", "cursor", "gemini", "opencode"].includes(values.harness) && !values["print-only"]) {
    const result = spawnSync(command, [resolve(mcpDirectory, "registerHarness.js"), "--harness", values.harness], {
      input: JSON.stringify(config), encoding: "utf8", windowsHide: true, shell: false,
    });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || "Harness registration failed; configuration was preserved.");
    configPath = result.stdout.trim();
    registered = true;
  }
  if (values.harness === "workbuddy" && !values["print-only"]) {
    if (!["win32", "darwin"].includes(process.platform)) throw new Error("WorkBuddy setup currently supports Windows and macOS.");
    const windows = process.platform === "win32";
    const shell = windows ? resolve(process.env.SystemRoot || "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe") : "/bin/sh";
    const script = fileURLToPath(new URL(windows ? "./registerWorkbuddy.ps1" : "./registerWorkbuddy.sh", import.meta.url));
    const result = spawnSync(shell, windows ? ["-NoProfile", "-NonInteractive", "-File", script] : [script], {
      input: JSON.stringify(config), encoding: "utf8", windowsHide: true, shell: false,
    });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || "WorkBuddy MCP registration failed.");
    configPath = result.stdout.trim();
    registered = true;
  }
  console.log(JSON.stringify({ harness: values.harness, mode: state.mode ?? "web", web: state.web, runtime: state.runtime,
    registered, configPath, configFormat, config,
    next: registered ? "MCP configuration saved. In the host, reconnect or open a new conversation if tools are missing; honor its trust prompt. FilmFraylo opens directly to the project home without a model API key. Call getAppState, create or open the local project, then create canvases and files through MCP. Configure a media API key only before media generation."
      : "Merge only filmfraylo into the selected harness MCP configuration; preserve other entries. Reconnect MCP, call getAppState, then create or open the local project. No model API key is needed for canvases, nodes or files. See references/harnesses.md.",
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
