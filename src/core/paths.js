import path from "node:path";

export const workspaceRoot = process.cwd();
export const harnessDir = path.join(workspaceRoot, ".harness");
export const workspaceConfigPath = path.join(harnessDir, "workspace.json");
export const assetsRoot = path.join(workspaceRoot, "assets");
export const exportsRoot = path.join(workspaceRoot, "exports");
export const snapshotsFolderName = ".snapshots";

export const assetKindMap = {
  agent: "agents",
  skill: "skills",
  instruction: "instructions"
};

export function resolveAssetDirectory(kind) {
  const folder = assetKindMap[kind];
  if (!folder) {
    throw new Error(`Unsupported asset kind: ${kind}`);
  }

  return path.join(assetsRoot, folder);
}

export function resolveAssetPath(kind, assetId) {
  return path.join(resolveAssetDirectory(kind), assetId);
}

export function resolveSnapshotDirectory(kind, assetId) {
  return path.join(resolveAssetPath(kind, assetId), snapshotsFolderName);
}
