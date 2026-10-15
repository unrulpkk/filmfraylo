#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "@toonflow/file";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({ options: {
    runtime: { type: "string" },
    skills: { type: "string" },
    name: { type: "string", default: "toonflow" },
    register: { type: "boolean", default: false },
    codex: { type: "string", default: "codex" },
    help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("node build/mcp/install.js --runtime <Toonflow 运行信息文件> [--register] [--skills <技能父目录>] [--name <MCP 名称>] [--codex <Codex 可执行文件>]\n安装 Toonflow Skill 并输出不含凭证的 Codex TOML 配置。--register 使用 Codex CLI 注册 MCP。已有不同配置或 Skill 拒绝覆盖。运行信息文件可在 Toonflow 开启 MCP 后生成。");
    return;
  }
  if (!values.runtime) throw new Error("请从 Toonflow 设置中的 stdio 配置获取 --runtime 路径");
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(values.name)) throw new Error("MCP 名称只能包含英文字母、数字、下划线和短横线，并以字母开头");
  const entry = fileURLToPath(import.meta.url);
  if (entry.endsWith(".ts")) throw new Error("请先执行 bun run build:mcp，再运行 build/mcp/install.js");
  const packageDirectory = dirname(entry);
  const bridge = resolve(packageDirectory, "stdio.js");
  await access(bridge);
  const source = await readFile(resolve(packageDirectory, "skills/toonflow/SKILL.md"), "utf8");
  const skills = resolve(values.skills ?? resolve(process.env.CODEX_HOME || resolve(homedir(), ".codex"), "skills"));
  const target = resolve(skills, "toonflow/SKILL.md");
  const args = [bridge, "--runtime", resolve(values.runtime), "--external"];
  let registered = false;
  if (values.register) {
    const result = spawnSync(values.codex, ["mcp", "list", "--json"], { encoding: "utf8", shell: false });
    if (result.error || result.status !== 0) throw new Error("无法读取 Codex MCP 配置，请检查 Codex CLI 或使用 --codex 指定可执行文件");
    const servers = JSON.parse(result.stdout) as { name: string; enabled: boolean; transport: { command?: string; args?: string[] } }[];
    const existing = servers.find(server => server.name === values.name);
    if (existing) {
      if (!existing.enabled || existing.transport.command !== process.execPath || JSON.stringify(existing.transport.args) !== JSON.stringify(args)) {
        throw new Error(`MCP ${values.name} 已存在且配置不同，请使用 --name 另选名称或手动调整原配置`);
      }
      registered = true;
    }
  }
  await mkdir(dirname(target), { recursive: true });
  try { await writeFile(target, source, { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await readFile(target, "utf8")).replace(/\r\n/g, "\n") !== source.replace(/\r\n/g, "\n")) throw new Error(`Skill 已存在且内容不同，未覆盖：${target}。请备份后移走旧版本，或使用 --skills 指定其他目录`);
  }
  console.log(`Skill 已安装：${target}`);
  if (values.register && !registered) {
    const result = spawnSync(values.codex, ["mcp", "add", values.name, "--", process.execPath, ...args], { encoding: "utf8", shell: false });
    if (result.error || result.status !== 0) throw new Error("Skill 已安装，但 Codex MCP 注册失败；请使用下面文档中的手动配置方式");
    registered = true;
  }
  // JSON 字符串也是 TOML 基本字符串，保留 Windows 路径中的反斜线转义。
  console.log(`\n${registered ? "MCP 已注册。可在已有同名配置下补充 tool_timeout_sec；不要重复添加表。" : "将以下配置加入 Codex config.toml："}\n[mcp_servers.${values.name}]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify(args)}\ntool_timeout_sec = 1800`);
  console.log("\n重新连接 MCP 并开启新对话，使用 $toonflow。先调用 getAppState 确认工作区；本安装不会启动 Toonflow、修改媒体模型或调用内置 Agent。");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
