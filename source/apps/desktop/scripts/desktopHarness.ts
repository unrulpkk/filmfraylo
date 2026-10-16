import { existsSync, mkdir, open, readFile, realpath } from "@toonflow/file";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

// Bundled alongside MCP; this starts the existing native application, never a browser.
const { values } = parseArgs({ options: { data: { type: "string" }, status: { type: "boolean" } } });
const resources = resolve(import.meta.dirname, "..");
const mac = process.platform === "darwin";
const install = resolve(resources, mac ? "../../.." : "../..");
const legacyData = resolve(install, "data");
const data = resolve(values.data ?? (existsSync(resolve(install, "filmFraylo.exe")) || existsSync(resolve(legacyData, "settings.json"))
  ? legacyData : resolve(homedir(), ".filmfraylo/desktopData")));
const mcpDirectory = resolve(resources, "app/mcp");

async function status() {
  let descriptor;
  try { descriptor = JSON.parse(await readFile(resolve(data, "desktopRuntime.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (!Number.isInteger(descriptor.pid) || descriptor.pid <= 0) throw new Error("Invalid desktop process record.");
  try { process.kill(descriptor.pid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return null; throw error; }
  if (await realpath(descriptor.resources) !== await realpath(resources)) throw new Error("Another desktop installation owns this data directory. Reuse that installation.");
  if (!Number.isInteger(descriptor.port) || descriptor.port < 1 || descriptor.port > 65535) throw new Error("Invalid desktop port.");
  const web = `http://127.0.0.1:${descriptor.port}`;
  const response = await fetch(`${web}/api/mcp/status`, { headers: { Origin: web, "x-toonflow-workspace": "1" }, signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`Desktop status HTTP ${response.status}; do not start another instance.`);
  const body = await response.json() as any;
  const state = body.data;
  const runtime = state?.stdio?.args?.[state.stdio.args.indexOf("--runtime") + 1];
  if (body.code !== 200 || !state.enabled || !runtime) throw new Error("Enable MCP in the desktop application's settings, then retry.");
  if (await realpath(dirname(runtime)) !== await realpath(data) || await realpath(state.stdio.args[0]) !== await realpath(resolve(mcpDirectory, "stdio.js"))) {
    throw new Error("Desktop MCP belongs to another installation or workspace.");
  }
  return { mode: "desktop", web, data, runtime, mcpDirectory, connectedPages: state.connections.length };
}

async function main() {
  const current = await status();
  if (current) return current;
  if (values.status) throw new Error("Desktop is not running.");
  await mkdir(data, { recursive: true });
  const log = await open(resolve(data, "desktop.log"), "a");
  const launcher = resolve(resources, mac ? "../MacOS/launcher" : "../bin/launcher.exe");
  const child = spawn(launcher, [], { cwd: dirname(launcher), detached: true, windowsHide: true,
    stdio: ["ignore", log.fd, log.fd], env: { ...process.env, TOONFLOW_DATA_DIR: data } });
  await log.close();
  let failure: Error | undefined;
  child.on("error", error => { failure = error; });
  child.unref();
  for (let attempt = 0; attempt < 120; attempt++) {
    if (failure) throw failure;
    await new Promise(done => setTimeout(done, 500));
    const result = await status();
    if (result) return result;
    if (child.exitCode !== null && child.exitCode !== 0) throw new Error(`Desktop launch failed; see ${resolve(data, "desktop.log")}`);
  }
  throw new Error(`Desktop not ready; see ${resolve(data, "desktop.log")}. Do not repeatedly launch it.`);
}
main().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
