import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assetsRoot,
  assetKindMap,
  exportsRoot,
  resolveExportDirectory,
  resolveAssetDirectory,
  resolveAssetPath,
  resolveSnapshotDirectory,
  workspaceConfigPath
} from "./paths.js";
import { readJson, writeJson } from "../utils/json.js";
import { renderForTarget } from "./adapters.js";
import { createJsonDiff, createTextDiff } from "../utils/diff.js";

const defaultWorkspace = {
  name: "Harness",
  version: "0.1.0",
  timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  defaultTarget: "generic",
  supportedTargets: ["generic", "openai-codex", "claude-code"],
  exportDirectory: "exports"
};

const sampleAssets = [
  {
    kind: "agent",
    id: "agent.harness-manager",
    metadata: {
      id: "agent.harness-manager",
      name: "Harness Manager",
      kind: "agent",
      version: "0.1.0",
      description: "Coordinates asset governance across agent ecosystems.",
      tags: ["manager", "governance"],
      owner: "team-harness",
      compatibility: {
        targets: ["generic", "openai-codex", "claude-code"]
      },
      content: {
        entry: "content.md"
      },
      history: [
        {
          version: "0.1.0",
          date: "2026-06-06",
          notes: "Initial asset definition.",
          snapshot: ".snapshots/0.1.0"
        }
      ]
    },
    content: `# Harness Manager

You manage agent assets across multiple runtime targets.

Responsibilities:
- keep agents, skills, and instructions organized
- maintain version metadata for each asset
- export normalized assets into target-specific formats
`
  },
  {
    kind: "skill",
    id: "skill.prompt-authoring",
    metadata: {
      id: "skill.prompt-authoring",
      name: "Prompt Authoring",
      kind: "skill",
      version: "1.0.0",
      description: "Reusable guidance for writing stable prompts.",
      tags: ["prompt", "quality"],
      owner: "team-harness",
      compatibility: {
        targets: ["generic", "openai-codex", "claude-code"]
      },
      content: {
        entry: "content.md"
      },
      history: [
        {
          version: "1.0.0",
          date: "2026-06-06",
          notes: "Initial skill content.",
          snapshot: ".snapshots/1.0.0"
        }
      ]
    },
    content: `# Prompt Authoring

Write prompts that are:

- explicit about goals
- clear about tool boundaries
- stable under iteration
- easy to adapt for different agent runtimes
`
  },
  {
    kind: "instruction",
    id: "instruction.repository-guardrails",
    metadata: {
      id: "instruction.repository-guardrails",
      name: "Repository Guardrails",
      kind: "instruction",
      version: "1.0.0",
      description: "Operational rules for safe repository changes.",
      tags: ["repo", "safety"],
      owner: "team-harness",
      compatibility: {
        targets: ["generic", "openai-codex", "claude-code"]
      },
      content: {
        entry: "content.md"
      },
      history: [
        {
          version: "1.0.0",
          date: "2026-06-06",
          notes: "Initial instruction content.",
          snapshot: ".snapshots/1.0.0"
        }
      ]
    },
    content: `# Repository Guardrails

- inspect the workspace before editing
- avoid destructive operations unless requested
- keep changes reviewable and well explained
`
  }
];

const assetIdSegmentPattern = "[a-z0-9]+(?:-[a-z0-9]+)*";

function currentDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function defaultVersionForKind(kind) {
  return kind === "agent" ? "0.1.0" : "1.0.0";
}

function titleFromId(assetId) {
  return assetId
    .split(".")
    .slice(1)
    .join(" ")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseTags(tags) {
  if (!tags) {
    return [];
  }

  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function isSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeRelativePath(filePath) {
  if (!isNonEmptyString(filePath)) {
    return false;
  }

  const normalized = path.posix.normalize(filePath.replaceAll("\\", "/"));
  return !normalized.startsWith("/") && normalized !== ".." && !normalized.startsWith("../");
}

function isSupportedKind(kind) {
  return Object.hasOwn(assetKindMap, kind);
}

function isValidAssetId(kind, assetId) {
  if (!isSupportedKind(kind) || typeof assetId !== "string") {
    return false;
  }

  const pattern = new RegExp(`^${kind}\\.${assetIdSegmentPattern}(?:\\.${assetIdSegmentPattern})*$`);
  return pattern.test(assetId);
}

function assertSupportedKind(kind) {
  if (!isSupportedKind(kind)) {
    const supportedKinds = Object.keys(assetKindMap).join(", ");
    throw new Error(`Unsupported asset kind: ${kind}. Supported kinds: ${supportedKinds}`);
  }
}

function assertValidAssetId(kind, assetId) {
  if (!isValidAssetId(kind, assetId)) {
    throw new Error(
      `Invalid asset id: ${assetId}. Expected format: ${kind}.name using lowercase letters, numbers, hyphens, and optional dot-separated segments.`
    );
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function saveAssetFiles(kind, assetId, metadata, content) {
  const assetDir = resolveAssetPath(kind, assetId);
  await mkdir(assetDir, { recursive: true });
  await writeJson(path.join(assetDir, "asset.json"), metadata);
  await writeFile(path.join(assetDir, metadata.content.entry), content, "utf8");
}

async function writeSnapshot(kind, assetId, version, metadata, content) {
  const snapshotDir = path.join(resolveSnapshotDirectory(kind, assetId), version);
  const snapshotMetadata = {
    ...metadata,
    renderedContent: undefined
  };

  delete snapshotMetadata.renderedContent;

  await writeJson(path.join(snapshotDir, "asset.json"), snapshotMetadata);
  await writeFile(path.join(snapshotDir, metadata.content.entry), content, "utf8");
}

function getWorkspaceExportDirectory(workspace) {
  return resolveExportDirectory(workspace.exportDirectory || "exports");
}

export async function initWorkspace(options = {}) {
  if (!options.force && (await pathExists(workspaceConfigPath))) {
    throw new Error("Harness workspace already exists. Re-run with --force to overwrite the current workspace.");
  }

  await mkdir(path.dirname(workspaceConfigPath), { recursive: true });
  await writeJson(workspaceConfigPath, defaultWorkspace);

  for (const folder of Object.values(assetKindMap)) {
    await mkdir(path.join(assetsRoot, folder), { recursive: true });
  }

  await mkdir(exportsRoot, { recursive: true });

  for (const asset of sampleAssets) {
    await saveAssetFiles(asset.kind, asset.id, asset.metadata, asset.content);
    await writeSnapshot(asset.kind, asset.id, asset.metadata.version, asset.metadata, asset.content);
  }

  return {
    workspace: workspaceConfigPath,
    assetCount: sampleAssets.length
  };
}

export async function loadWorkspace() {
  return readJson(workspaceConfigPath);
}

async function loadAsset(kind, assetId) {
  const assetDir = resolveAssetPath(kind, assetId);
  const metadata = await readJson(path.join(assetDir, "asset.json"));
  const contentPath = path.join(assetDir, metadata.content.entry);
  const renderedContent = await readFile(contentPath, "utf8");

  return {
    ...metadata,
    renderedContent
  };
}

export async function listAssets() {
  const assets = [];

  for (const kind of Object.keys(assetKindMap)) {
    const dir = resolveAssetDirectory(kind);
    let entries = [];

    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      assets.push(await loadAsset(kind, entry.name));
    }
  }

  return assets.sort((left, right) => left.id.localeCompare(right.id));
}

export async function showAsset(kind, assetId) {
  assertSupportedKind(kind);
  assertValidAssetId(kind, assetId);
  return loadAsset(kind, assetId);
}

export async function createAsset(kind, assetId, options = {}) {
  assertSupportedKind(kind);
  assertValidAssetId(kind, assetId);
  const workspace = await loadWorkspace();
  const assetDir = resolveAssetPath(kind, assetId);

  if (await pathExists(assetDir)) {
    throw new Error(`Asset already exists: ${assetId}`);
  }

  const version = options.version || defaultVersionForKind(kind);
  if (!isSemver(version)) {
    throw new Error(`Invalid version: ${version}`);
  }

  const targets = options.targets ? options.targets.split(",").map((item) => item.trim()).filter(Boolean) : workspace.supportedTargets;
  for (const target of targets) {
    if (!workspace.supportedTargets.includes(target)) {
      throw new Error(`Unsupported compatibility target for ${assetId}: ${target}`);
    }
  }

  const tags = parseTags(options.tags);
  const metadata = {
    id: assetId,
    name: options.name || titleFromId(assetId),
    kind,
    version,
    description: options.description || "",
    tags,
    owner: options.owner || "unknown",
    compatibility: {
      targets
    },
    content: {
      entry: "content.md"
    },
    history: [
      {
        version,
        date: currentDate(),
        notes: options.note || "Initial version.",
        snapshot: `/.snapshots/${version}`.slice(1)
      }
    ]
  };
  const content = options.content || `# ${metadata.name}\n\nAdd ${kind} content here.\n`;

  await saveAssetFiles(kind, assetId, metadata, content);
  await writeSnapshot(kind, assetId, version, metadata, content);

  return {
    kind,
    id: assetId,
    version
  };
}

export async function bumpAssetVersion(kind, assetId, nextVersion, options = {}) {
  assertSupportedKind(kind);
  assertValidAssetId(kind, assetId);
  if (!isSemver(nextVersion)) {
    throw new Error(`Invalid version: ${nextVersion}`);
  }

  const asset = await loadAsset(kind, assetId);
  if (asset.version === nextVersion) {
    throw new Error(`Asset ${assetId} is already at version ${nextVersion}`);
  }

  if (asset.history.some((entry) => entry.version === nextVersion)) {
    throw new Error(`Version ${nextVersion} already exists in asset history`);
  }

  const updatedMetadata = {
    ...asset,
    version: nextVersion,
    history: [
      ...asset.history,
      {
        version: nextVersion,
        date: currentDate(),
        notes: options.note || `Bumped from ${asset.version} to ${nextVersion}.`,
        snapshot: `/.snapshots/${nextVersion}`.slice(1)
      }
    ]
  };

  delete updatedMetadata.renderedContent;

  await saveAssetFiles(kind, assetId, updatedMetadata, asset.renderedContent);
  await writeSnapshot(kind, assetId, nextVersion, updatedMetadata, asset.renderedContent);

  return {
    id: assetId,
    previousVersion: asset.version,
    nextVersion
  };
}

async function loadSnapshot(kind, assetId, version) {
  const snapshotDir = path.join(resolveSnapshotDirectory(kind, assetId), version);
  const metadata = await readJson(path.join(snapshotDir, "asset.json"));
  const contentPath = path.join(snapshotDir, metadata.content.entry);
  const renderedContent = await readFile(contentPath, "utf8");

  return {
    ...metadata,
    renderedContent
  };
}

export async function showAssetVersion(kind, assetId, version) {
  assertSupportedKind(kind);
  assertValidAssetId(kind, assetId);
  return loadSnapshot(kind, assetId, version);
}

export async function getAssetHistory(kind, assetId) {
  assertSupportedKind(kind);
  assertValidAssetId(kind, assetId);
  const asset = await loadAsset(kind, assetId);

  return {
    id: asset.id,
    kind: asset.kind,
    currentVersion: asset.version,
    history: [...asset.history].sort((left, right) => left.version.localeCompare(right.version))
  };
}

export async function diffAsset(kind, assetId, fromVersion, toVersion) {
  assertSupportedKind(kind);
  assertValidAssetId(kind, assetId);
  const asset = await loadAsset(kind, assetId);
  const targetVersion = toVersion || asset.version;
  const left = await loadSnapshot(kind, assetId, fromVersion);
  const right = targetVersion === asset.version ? asset : await loadSnapshot(kind, assetId, targetVersion);

  return {
    id: assetId,
    kind,
    fromVersion,
    toVersion: targetVersion,
    metadataDiff: createJsonDiff(
      {
        ...left,
        renderedContent: undefined
      },
      {
        ...right,
        renderedContent: undefined
      }
    ),
    contentDiff: createTextDiff(left.renderedContent, right.renderedContent)
  };
}

export async function validateWorkspace() {
  const issues = [];
  const workspace = await loadWorkspace();
  const assets = await listAssets();

  if (!isNonEmptyString(workspace.name)) {
    issues.push("Workspace name is required.");
  }

  if (!isSemver(workspace.version)) {
    issues.push(`Workspace version must be semver: ${workspace.version}`);
  }

  if (!Array.isArray(workspace.supportedTargets) || workspace.supportedTargets.length === 0) {
    issues.push("Workspace must declare supportedTargets.");
  }

  if (!isNonEmptyString(workspace.defaultTarget)) {
    issues.push("Workspace defaultTarget is required.");
  } else if (!workspace.supportedTargets?.includes(workspace.defaultTarget)) {
    issues.push(`Workspace defaultTarget must be included in supportedTargets: ${workspace.defaultTarget}`);
  }

  if (!isNonEmptyString(workspace.exportDirectory)) {
    issues.push("Workspace exportDirectory is required.");
  } else if (!isSafeRelativePath(workspace.exportDirectory)) {
    issues.push(`Workspace exportDirectory must be a safe relative path: ${workspace.exportDirectory}`);
  }

  if (Array.isArray(workspace.supportedTargets)) {
    const supportedTargets = new Set();
    for (const target of workspace.supportedTargets) {
      if (!isNonEmptyString(target)) {
        issues.push("Workspace supportedTargets entries must be non-empty strings.");
        continue;
      }

      if (supportedTargets.has(target)) {
        issues.push(`Workspace supportedTargets contains duplicates: ${target}`);
      }

      supportedTargets.add(target);
    }
  }

  for (const asset of assets) {
    if (!asset.id) {
      issues.push("Asset missing id.");
      continue;
    }

    if (!asset.id.startsWith(`${asset.kind}.`)) {
      issues.push(`Asset id must be prefixed with its kind: ${asset.id}`);
    }

    if (!isSupportedKind(asset.kind)) {
      issues.push(`Unsupported asset kind: ${asset.kind}`);
      continue;
    }

    if (!isValidAssetId(asset.kind, asset.id)) {
      issues.push(`Invalid asset id format: ${asset.id}`);
    }

    if (!asset.name) {
      issues.push(`Asset missing name: ${asset.id}`);
    }

    if (!isNonEmptyString(asset.description)) {
      issues.push(`Asset description is required: ${asset.id}`);
    }

    if (!isNonEmptyString(asset.owner)) {
      issues.push(`Asset owner is required: ${asset.id}`);
    }

    if (!isSemver(asset.version)) {
      issues.push(`Asset version must be semver: ${asset.id} -> ${asset.version}`);
    }

    if (!asset.content?.entry) {
      issues.push(`Asset content.entry is required: ${asset.id}`);
    } else if (!isSafeRelativePath(asset.content.entry)) {
      issues.push(`Asset content.entry must be a safe relative path: ${asset.id} -> ${asset.content.entry}`);
    }

    if (!Array.isArray(asset.history) || asset.history.length === 0) {
      issues.push(`Asset history is required: ${asset.id}`);
    } else if (!asset.history.some((entry) => entry.version === asset.version)) {
      issues.push(`Current version missing from history: ${asset.id} -> ${asset.version}`);
    }

    if (!Array.isArray(asset.tags)) {
      issues.push(`Asset tags must be an array: ${asset.id}`);
    }

    if (!Array.isArray(asset.compatibility?.targets) || asset.compatibility.targets.length === 0) {
      issues.push(`Asset compatibility.targets is required: ${asset.id}`);
    }

    for (const target of asset.compatibility?.targets || []) {
      if (!isNonEmptyString(target)) {
        issues.push(`Asset compatibility target must be a non-empty string: ${asset.id}`);
        continue;
      }

      if (!workspace.supportedTargets.includes(target)) {
        issues.push(`Unsupported compatibility target on ${asset.id}: ${target}`);
      }
    }

    const assetDir = resolveAssetPath(asset.kind, asset.id);
    const contentPath = path.join(assetDir, asset.content.entry);
    if (!(await pathExists(contentPath))) {
      issues.push(`Missing content file: ${asset.id} -> ${asset.content.entry}`);
    }

    for (const entry of asset.history || []) {
      const snapshotDir = path.join(assetDir, entry.snapshot || "");
      if (!isSemver(entry.version)) {
        issues.push(`History entry version must be semver: ${asset.id} -> ${entry.version}`);
      }

      if (!isNonEmptyString(entry.date)) {
        issues.push(`History entry date is required: ${asset.id} -> ${entry.version}`);
      }

      if (!isNonEmptyString(entry.notes)) {
        issues.push(`History entry notes are required: ${asset.id} -> ${entry.version}`);
      }

      if (!entry.snapshot) {
        issues.push(`History entry missing snapshot path: ${asset.id} -> ${entry.version}`);
        continue;
      }

      if (!isSafeRelativePath(entry.snapshot)) {
        issues.push(`History entry snapshot must be a safe relative path: ${asset.id} -> ${entry.snapshot}`);
        continue;
      }

      if (!(await pathExists(path.join(snapshotDir, "asset.json")))) {
        issues.push(`Missing snapshot metadata: ${asset.id} -> ${entry.version}`);
      }

      if (!(await pathExists(path.join(snapshotDir, asset.content.entry)))) {
        issues.push(`Missing snapshot content: ${asset.id} -> ${entry.version}`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issueCount: issues.length,
    assetCount: assets.length,
    issues
  };
}

export async function exportWorkspace(target) {
  const workspace = await loadWorkspace();
  const assets = await listAssets();
  const resolvedTarget = target || workspace.defaultTarget;

  if (!resolvedTarget) {
    throw new Error("No export target provided and workspace.defaultTarget is not set");
  }

  if (!workspace.supportedTargets.includes(resolvedTarget)) {
    throw new Error(`Target ${resolvedTarget} is not enabled in workspace.supportedTargets`);
  }

  const output = renderForTarget(resolvedTarget, workspace, assets);
  const exportDirectory = getWorkspaceExportDirectory(workspace);
  const outputPath = path.join(exportDirectory, `${resolvedTarget}.json`);

  await writeJson(outputPath, output);

  return {
    outputPath,
    target: resolvedTarget,
    assetCount: assets.length
  };
}
