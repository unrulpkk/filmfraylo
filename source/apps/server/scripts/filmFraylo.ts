import { access, existsSync, mkdir, open, readFile, readdir, realpath, writeFile } from "@toonflow/file";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, import.meta.path.endsWith(".ts") ? "../../.." : ".");
const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  port: { type: "string", default: "3000" }, data: { type: "string" },
  skills: { type: "string" }, register: { type: "boolean" },
  codex: { type: "string", default: "codex" }, help: { type: "boolean" }, open: { type: "boolean" },
} });
const command = positionals[0] ?? "start";
const portableWindows = !import.meta.path.endsWith(".ts") && process.platform === "win32";
const portableMac = !import.meta.path.endsWith(".ts") && process.platform === "darwin";
const localDataRoot = process.env.LOCALAPPDATA || resolve(homedir(), "AppData/Local");
const legacyData = portableWindows ? resolve(localDataRoot, "safillu/data") : resolve(root, "data/myToonflow");
// 升级继续使用旧数据目录；全新安装使用新品牌目录，不移动或重写项目。
const defaultData = existsSync(resolve(legacyData, "settings.json")) ? legacyData
  : portableWindows ? resolve(localDataRoot, "FilmFraylo/data")
    : portableMac ? resolve(homedir(), "Library/Application Support/FilmFraylo/data") : resolve(root, "data/filmFraylo");
const data = resolve(values.data ?? defaultData);
const skills = resolve(values.skills ?? resolve(process.env.CODEX_HOME || resolve(homedir(), ".codex"), "skills"));
const skillNames = ["filmfraylo"];
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("port 必须为 1–65535 的整数");
const origin = `http://127.0.0.1:${port}`;

async function api(path: string) {
  const response = await fetch(`${origin}/api/${path}`, {
    headers: { Origin: origin, "x-toonflow-workspace": "1" }, signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json() as { code: number; data: any };
  if (body.code !== 200) throw new Error("FilmFraylo 接口返回失败");
  return body.data;
}

async function status() {
  let state;
  try { state = await api("mcp/status"); }
  catch (error) {
    // ACT: 只有连接被拒绝才允许启动；响应超时或其他服务占用端口时不启动第二个实例。
    if ((error as NodeJS.ErrnoException).code === "ECONNREFUSED" || (error as { cause?: NodeJS.ErrnoException }).cause?.code === "ECONNREFUSED") return null;
    throw new Error(`端口 ${port} 已占用或服务尚未就绪，请检查或指定 --port。`, { cause: error });
  }
  const runtimePath = state.stdio?.args?.[state.stdio.args.indexOf("--runtime") + 1];
  if (!runtimePath || await realpath(dirname(runtimePath)) !== await realpath(data)) {
    throw new Error("该端口不是目标数据目录的已启用 FilmFraylo MCP；请检查 --data、--port 和 MCP 开关。");
  }
  const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
  process.kill(runtime.pid, 0);
  return { runtimePath: runtimePath as string, state };
}

async function start() {
  await access(resolve(root, "build/server/index.js"));
  await access(resolve(root, "build/web/index.html"));
  await mkdir(data, { recursive: true });
  let current = await status();
  if (!current) {
    for (const name of await readdir(data)) {
      if (!/^mcpRuntime\d+\.json$/.test(name)) continue;
      const previous = JSON.parse(await readFile(resolve(data, name), "utf8"));
      if (!Number.isInteger(previous.pid) || previous.pid <= 0) throw new Error(`运行记录无效：${name}`);
      let running = true;
      try { process.kill(previous.pid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") running = false; else throw error; }
      if (running) throw new Error("此数据目录已有运行中的实例，请使用其 Web 端口；不能同时启动第二个写入进程。");
    }
    // 只初始化全新目录；不覆盖已有用户配置或凭证。
    try {
      await writeFile(resolve(data, "settings.json"), JSON.stringify({ settings: {
        externalHarness: true, ui: { startupAnimation: false },
        mcp: { enabled: true, token: randomBytes(32).toString("hex"), port: 10588 },
      } }, null, 2), { flag: "wx", mode: 0o600 });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const config = JSON.parse(await readFile(resolve(data, "settings.json"), "utf8"));
    if (!config.settings?.mcp?.enabled || config.settings.mcp.token?.length < 32) {
      throw new Error("已有数据目录尚未启用 MCP，请使用原生设置开启，或选择新的 --data 目录。");
    }
    const log = await open(resolve(data, "server.log"), "a");
    const child = spawn(process.execPath, [resolve(root, "build/server/index.js")], {
      cwd: root, detached: true, windowsHide: true, stdio: ["ignore", log.fd, log.fd],
      env: { ...process.env, NODE_ENV: "production", TOONFLOW_DATA_DIR: data, TOONFLOW_PORT: String(port), TOONFLOW_HOST: "127.0.0.1" },
    });
    await log.close();
    let failure: Error | undefined;
    child.on("error", error => { failure = error; });
    child.unref();
    for (let attempt = 0; attempt < 80; attempt++) {
      if (failure) throw failure;
      if (child.exitCode !== null) throw new Error(`启动失败，查看 ${resolve(data, "server.log")}`);
      await new Promise(done => setTimeout(done, 250));
      try { current = await status(); } catch { continue; }
      if (current) break;
    }
    if (!current) throw new Error(`启动未就绪，查看 ${resolve(data, "server.log")}；勿重复启动。`);
  }
  const installed = await Promise.all(skillNames.map(async name => {
    try { await access(resolve(skills, name, "SKILL.md")); return name; } catch { return null; }
  }));
  console.log(JSON.stringify({ web: origin, data, runtime: current.runtimePath,
    skillsInstalled: installed.filter(Boolean), skillsMissing: skillNames.filter(name => !installed.includes(name)),
    connectedPages: current.state.connections.length,
    next: "在浏览器打开 web 地址并打开工作区。首次执行 install 安装 FilmFraylo Skill 及官方依赖，并输出官方 MCP 配置；重新连接后调用 getAppState。",
  }, null, 2));
  return current.runtimePath;
}

async function install(runtime: string) {
  const source = resolve(root, "build/mcp/skills");
  const files: { path: string; content: string }[] = [];
  for (const name of ["toonflow", ...skillNames]) {
    for (const entry of await readdir(resolve(source, name), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const sourcePath = resolve(entry.parentPath, entry.name);
      const relativePath = sourcePath.slice(resolve(source, name).length + 1);
      files.push({ path: resolve(skills, name, relativePath), content: await readFile(sourcePath, "utf8") });
    }
  }
  files.push({ path: resolve(skills, "filmfraylo/references/localRuntime.md"), content:
    `# 本地运行入口\n\n使用命令数组执行（路径含空格时不要拼接 shell 字符串）：\n\n\`\`\`json\n${JSON.stringify([process.execPath, import.meta.path, "start", "--data", data, "--port", String(port), "--skills", skills], null, 2)}\n\`\`\`\n\n读取启动输出的 web 地址，在浏览器打开项目，再通过官方 MCP getAppState 确认目录。端口变化时重新 install 并更新原有 MCP 配置；不打印 runtime 文件中的 token。\n` });
  // 先完整检查冲突，再写入；保留用户改过的 Skill。
  for (const file of files) {
    try { if ((await readFile(file.path, "utf8")).replace(/\r\n/g, "\n") !== file.content.replace(/\r\n/g, "\n")) throw new Error(`已有不同内容，未覆盖：${file.path}；请选用 --skills 或备份后迁移。`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    try { await writeFile(file.path, file.content, { flag: "wx" }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || (await readFile(file.path, "utf8")).replace(/\r\n/g, "\n") !== file.content.replace(/\r\n/g, "\n")) throw error;
    }
  }
  const result = spawnSync(process.execPath, [resolve(root, "build/mcp/install.js"), "--runtime", runtime,
    "--skills", skills, "--name", "filmfraylo", ...(values.register ? ["--register", "--codex", values.codex] : [])], { stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("官方 MCP 安装器执行失败；已写入的 Skills 保留。");
  console.log("FilmFraylo Skill 已安装（五个阶段共用一个入口）。重新连接 MCP 后，在 Codex 使用 $filmfraylo。");
}

if (values.help) console.log("bun <本脚本> start|install|stop [--open] [--port 3000] [--data <数据目录>] [--skills <Codex技能目录>] [--register] [--codex <CLI路径>]\nstart 检测并后台启动本地 Web；install 另安装 FilmFraylo Skill 及官方依赖，复用官方安装器；--register 才修改 Codex MCP 配置。");
else if (!["start", "install", "stop"].includes(command)) throw new Error("只支持 start、install 或 stop");
else if (command === "stop") {
  const current = await status();
  if (current) {
    const runtime = JSON.parse(await readFile(current.runtimePath, "utf8"));
    process.kill(runtime.pid);
  }
  console.log(current ? "FilmFraylo 已停止" : "FilmFraylo 未运行");
}
else {
  const runtime = await start();
  if (command === "install") await install(runtime);
  if (values.open) {
    if (!["win32", "darwin"].includes(process.platform)) throw new Error("--open 当前仅支持 Windows 和 macOS");
    const browser = spawn(process.platform === "darwin" ? "/usr/bin/open" : "explorer.exe", [origin], { detached: true, windowsHide: true, stdio: "ignore" });
    browser.on("error", () => console.error(`请在浏览器打开 ${origin}`));
    browser.unref();
  }
}
