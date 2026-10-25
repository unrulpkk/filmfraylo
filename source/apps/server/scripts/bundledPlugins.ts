import { cp, mkdir, readdir } from "@toonflow/file";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "../../..");
const groups = {
  tools: { label: "工具", suffix: ".tool.js", filter: /^[a-z][a-zA-Z0-9]*\.tool\.js$/ },
  nodes: { label: "节点", suffix: ".umd.js", filter: /^[a-z][a-zA-Z0-9]*\.umd\.js$/ },
} as const;
type GroupName = keyof typeof groups;

const requested = process.argv[2];
if (requested !== undefined && !Object.hasOwn(groups, requested)) throw new Error(`未知的预置插件组：${requested}，可用组：${Object.keys(groups).join("、")}`);
const names = (requested === undefined ? Object.keys(groups) : [requested]) as GroupName[];

for (const name of names) {
  const { label, suffix, filter } = groups[name];
  const sourceDirectory = resolve(projectDirectory, "plugins", name);
  const targetDirectories = [resolve(projectDirectory, "build", name)];
  if (process.env.NODE_ENV === "dev") targetDirectories.push(resolve(projectDirectory, "data", name));
  const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = entries.filter(entry => entry.isFile());
  if (!files.length) continue;
  for (const file of files) {
    if (!filter.test(file.name)) throw new Error(`预置${label}文件名必须为小驼峰 <名称>${suffix}：${file.name}`);
  }
  for (const targetDirectory of targetDirectories) {
    await mkdir(targetDirectory, { recursive: true });
    for (const file of files) await cp(resolve(sourceDirectory, file.name), resolve(targetDirectory, file.name), { force: true });
  }
  console.log(`已同步预置${label}（${files.length} 个）到 ${targetDirectories.join("、")}`);
}
