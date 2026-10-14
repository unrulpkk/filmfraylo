import { $ } from "bun";
import { mkdir, readFile, writeFile } from "@toonflow/file";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
await $`${process.execPath} run build:mcp`.cwd(root);
await mkdir(resolve(root, "dist"), { recursive: true });
const name = "filmFrayloSkills.zip";
const archive = resolve(root, "dist", name);
await $`tar -a -cf ${archive} -C ${resolve(root, "build/mcp/skills")} filmfraylo toonflow`;
const hash = createHash("sha256").update(await readFile(archive)).digest("hex");
await writeFile(`${archive}.sha256`, `${hash}  ${name}\n`);
console.log(`已生成 ${archive}；仓库地址由 GitHub 构建环境提供。`);
// WorkBuddy imports one Skill with SKILL.md at the ZIP root; native MCP guidance is installed on first launch.
const workbuddyName = "filmFrayloWorkbuddy.zip";
const workbuddyArchive = resolve(root, "dist", workbuddyName);
await $`tar -a -cf ${workbuddyArchive} -C ${resolve(root, "build/mcp/skills/filmfraylo")} SKILL.md agents references scripts`;
const workbuddyHash = createHash("sha256").update(await readFile(workbuddyArchive)).digest("hex");
await writeFile(`${workbuddyArchive}.sha256`, `${workbuddyHash}  ${workbuddyName}\n`);
console.log(`已生成 WorkBuddy 单技能导入包 ${workbuddyArchive}`);
