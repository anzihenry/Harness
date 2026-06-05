import { stableStringify } from "./json.js";

function buildLineMap(lines) {
  return new Map(lines.map((line, index) => [`${index}:${line}`, index]));
}

export function createTextDiff(beforeText, afterText) {
  const beforeLines = beforeText.split("\n");
  const afterLines = afterText.split("\n");
  const beforeMap = buildLineMap(beforeLines);
  const afterMap = buildLineMap(afterLines);
  const lines = [];

  for (let index = 0; index < beforeLines.length; index += 1) {
    const line = beforeLines[index];
    if (!afterMap.has(`${index}:${line}`)) {
      lines.push(`- ${line}`);
    }
  }

  for (let index = 0; index < afterLines.length; index += 1) {
    const line = afterLines[index];
    if (!beforeMap.has(`${index}:${line}`)) {
      lines.push(`+ ${line}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "No changes.";
}

export function createJsonDiff(beforeData, afterData) {
  return createTextDiff(stableStringify(beforeData), stableStringify(afterData));
}
