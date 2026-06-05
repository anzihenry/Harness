import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function stableStringify(data) {
  return JSON.stringify(data, null, 2);
}
