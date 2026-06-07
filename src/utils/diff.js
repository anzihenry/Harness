import { stableStringify } from "./json.js";

function buildLcsMatrix(beforeLines, afterLines) {
  const matrix = Array.from({ length: beforeLines.length + 1 }, () => Array(afterLines.length + 1).fill(0));

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
        matrix[beforeIndex][afterIndex] = matrix[beforeIndex + 1][afterIndex + 1] + 1;
      } else {
        matrix[beforeIndex][afterIndex] = Math.max(matrix[beforeIndex + 1][afterIndex], matrix[beforeIndex][afterIndex + 1]);
      }
    }
  }

  return matrix;
}

function buildOperations(beforeLines, afterLines) {
  const matrix = buildLcsMatrix(beforeLines, afterLines);
  const operations = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      operations.push({
        type: "context",
        line: beforeLines[beforeIndex]
      });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (matrix[beforeIndex + 1][afterIndex] >= matrix[beforeIndex][afterIndex + 1]) {
      operations.push({
        type: "remove",
        line: beforeLines[beforeIndex]
      });
      beforeIndex += 1;
    } else {
      operations.push({
        type: "add",
        line: afterLines[afterIndex]
      });
      afterIndex += 1;
    }
  }

  while (beforeIndex < beforeLines.length) {
    operations.push({
      type: "remove",
      line: beforeLines[beforeIndex]
    });
    beforeIndex += 1;
  }

  while (afterIndex < afterLines.length) {
    operations.push({
      type: "add",
      line: afterLines[afterIndex]
    });
    afterIndex += 1;
  }

  return operations;
}

function formatOperation(operation) {
  if (operation.type === "context") {
    return `  ${operation.line}`;
  }

  if (operation.type === "remove") {
    return `- ${operation.line}`;
  }

  return `+ ${operation.line}`;
}

export function summarizeDiff(diffText) {
  if (diffText === "No changes.") {
    return {
      additions: 0,
      removals: 0
    };
  }

  return diffText.split("\n").reduce(
    (summary, line) => {
      if (line.startsWith("+ ")) {
        summary.additions += 1;
      } else if (line.startsWith("- ")) {
        summary.removals += 1;
      }

      return summary;
    },
    {
      additions: 0,
      removals: 0
    }
  );
}

export function createTextDiff(beforeText, afterText) {
  const beforeLines = beforeText.split("\n");
  const afterLines = afterText.split("\n");
  const operations = buildOperations(beforeLines, afterLines);
  const hasChanges = operations.some((operation) => operation.type !== "context");

  if (!hasChanges) {
    return "No changes.";
  }

  return operations.map(formatOperation).join("\n");
}

export function createJsonDiff(beforeData, afterData) {
  return createTextDiff(stableStringify(beforeData), stableStringify(afterData));
}
