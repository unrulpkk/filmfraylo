import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";

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
  if (!["codex", "claude", "cursor", "opencode", "gemini", "generic"].includes(values.harness)) {
    throw new Error("Unknown harness. Use codex, claude, cursor, opencode, gemini or generic.");
  }
  if (!values.app || !values.skills) throw new Error("--app and --skills are required.");
  if (values.register && (values.harness !== "codex" || values["print-only"])) {
    throw new Error("--register is only available for Codex and cannot be combined with --print-only.");
  }
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const state = JSON.parse(input.replace(/^\uFEFF/, ""));
  if (typeof state.runtime !== "string" || !isAbsolute(state.runtime)) {
    throw new Error("Expected an absolute runtime path from FilmFraylo start output.");
  }
  const command = process.execPath;
  const args = [resolve(values.app, "build/mcp/stdio.js"), "--runtime", state.runtime, "--external"];
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
    const result = spawnSync(command, [resolve(values.app, "build/mcp/install.js"),
      "--runtime", state.runtime, "--skills", resolve(values.skills), "--name", "filmfraylo",
      ...(values.register ? ["--register", "--codex", values.codex] : []),
    ], { encoding: "utf8", windowsHide: true, shell: false });
    if (result.error || result.status !== 0) {
      throw new Error(result.error?.message || result.stderr.trim() || "Official MCP dependency installation failed.");
    }
  }
  console.log(JSON.stringify({ harness: values.harness, web: state.web, runtime: state.runtime,
    registered: values.register, configFormat, config,
    next: "Merge only filmfraylo into the selected harness MCP configuration; preserve other entries. Reconnect MCP, open the local project, then call getAppState. See references/harnesses.md.",
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
