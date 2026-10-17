import { cp, mkdir, readdir } from "@toonflow/file";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "../../..");
const sourceDirectory = resolve(projectDirectory, "plugins/tools");
const targetDirectories = [resolve(projectDirectory, "build/tools")];
if (process.env.NODE_ENV === "dev") targetDirectories.push(resolve(projectDirectory, "data/tools"));

const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") return [];
  throw error;
});
const files = entries.filter(entry => entry.isFile());
if (files.length) {
  for (const file of files) {
    if (!/^[a-z][a-zA-Z0-9]*\.tool\.js$/.test(file.name)) throw new Error(`预置工具文件名必须为小驼峰 <名称>.tool.js：${file.name}`);
  }
  for (const targetDirectory of targetDirectories) {
    await mkdir(targetDirectory, { recursive: true });
    for (const file of files) await cp(resolve(sourceDirectory, file.name), resolve(targetDirectory, file.name), { force: true });
  }
  console.log(`已同步预置工具（${files.length} 个）到 ${targetDirectories.join("、")}`);
}
