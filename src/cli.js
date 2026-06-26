#!/usr/bin/env node

import { createRequire } from "node:module";
import { listAdapterTargets } from "./core/adapters.js";
import {
  addAssetDependency,
  archiveAsset,
  bumpAssetVersion,
  cloneAsset,
  createAsset,
  diffAsset,
  exportWorkspace,
  getAssetDependents,
  getAssetDependencies,
  getAssetHistory,
  getAssetImpact,
  getOrphanAssets,
  initWorkspace,
  listAssets,
  loadWorkspace,
  packWorkspace,
  removeAssetDependency,
  showResolvedAsset,
  showAsset,
  showAssetVersion,
  updateAssetMetadata,
  verifyBundle,
  validateWorkspace
} from "./core/workspace.js";
import { summarizeDiff } from "./utils/diff.js";

const require = createRequire(import.meta.url);
const { version: cliVersion } = require("../package.json");
const supportedKinds = ["agent", "skill", "instruction"];
const supportedListGroupBys = ["kind", "owner", "target"];
const supportedListStatuses = ["active", "archived"];

function parseFlags(args) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = "true";
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { flags, positionals };
}

function printHelp() {
  console.log(`Harness CLI

Usage:
  harness --version
  harness init [--force]
  harness list [--kind <kind>] [--tag <tag>] [--owner <owner>] [--status active|archived] [--target <target>] [--group-by <field>] [--json]
  harness targets
  harness validate [--json]
  harness new <kind> <id> [--name <name>] [--description <text>] [--owner <owner>] [--tags a,b] [--targets a,b] [--version x.y.z] [--note <text>]
  harness clone <kind> <source-id> <target-id> [--name <name>] [--version x.y.z] [--note <text>]
  harness archive <kind> <id> [--reason <text>]
  harness set <kind> <id> [--name <name>] [--description <text>] [--owner <owner>] [--tags a,b] [--targets a,b]
  harness add-dependency <kind> <id> <dependency-kind> <dependency-id> [--optional]
  harness remove-dependency <kind> <id> <dependency-kind> <dependency-id>
  harness bump-version <kind> <id> <version> [--note <text>]
  harness diff <kind> <id> <from-version> [to-version] [--json]
  harness deps <kind> <id> [--json]
  harness dependents <kind> <id> [--json]
  harness orphans [--kind <kind>] [--json]
  harness impact <kind> <id> [--json]
  harness history <kind> <id> [--json]
  harness show <kind> <id> [version] [--metadata|--content|--resolved]
  harness export [target] [--entry <kind:id>] [--include-dependencies] [--json]
  harness pack [target] --entry <kind:id> [--include-dependencies] [--output <dir>] [--json]
  harness verify-bundle <bundle-path> [--json]

Examples:
  harness init
  harness init --force
  harness list
  harness list --kind skill --json
  harness list --group-by owner
  harness list --status archived
  harness targets
  harness validate --json
  harness new skill skill.agent-review --owner team-harness --tags review,agent
  harness clone skill skill.prompt-authoring skill.prompt-authoring-copy --name "Prompt Authoring Copy"
  harness archive skill skill.prompt-authoring-copy --reason "Folded into prompt-authoring"
  harness set skill skill.agent-review --owner team-platform --tags review,quality
  harness add-dependency skill skill.agent-review instruction instruction.repository-guardrails --optional
  harness remove-dependency skill skill.agent-review instruction instruction.repository-guardrails
  harness bump-version skill skill.prompt-authoring 1.1.0 --note "Refined guidance"
  harness diff skill skill.prompt-authoring 1.0.0 1.1.0 --json
  harness deps agent agent.harness-manager --json
  harness dependents skill skill.prompt-authoring --json
  harness orphans --kind skill --json
  harness impact skill skill.prompt-authoring --json
  harness history skill skill.prompt-authoring --json
  harness show skill skill.prompt-authoring 1.0.0
  harness show skill skill.prompt-authoring --content
  harness show agent agent.harness-manager --resolved
  harness show skill skill.prompt-authoring
  harness export generic --entry agent:agent.harness-manager --include-dependencies --json
  harness pack generic --entry agent:agent.harness-manager --include-dependencies --json
  harness verify-bundle releases/agent.harness-manager-generic --json
  harness export openai-codex --json
  harness export
`);
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function printSection(title, lines = []) {
  console.log(title);
  for (const line of lines) {
    console.log(line);
  }
}

function printVersion() {
  console.log(`harness ${cliVersion}`);
}

function parseEntryFlag(entry) {
  if (!entry) {
    return null;
  }

  const [kind, assetId, ...rest] = entry.split(":");
  if (!kind || !assetId || rest.length > 0 || !supportedKinds.includes(kind)) {
    throw new Error(`Invalid --entry value: ${entry}. Expected format: <kind>:<id>`);
  }

  return {
    kind,
    id: assetId
  };
}

function assertListFilters(flags) {
  if (flags.kind && !supportedKinds.includes(flags.kind)) {
    throw new Error(`Unsupported asset kind: ${flags.kind}. Supported kinds: ${supportedKinds.join(", ")}`);
  }

  if (flags["group-by"] && !supportedListGroupBys.includes(flags["group-by"])) {
    throw new Error(`Unsupported list group: ${flags["group-by"]}. Supported groups: ${supportedListGroupBys.join(", ")}`);
  }

  if (flags.status && !supportedListStatuses.includes(flags.status)) {
    throw new Error(`Unsupported asset status: ${flags.status}. Supported statuses: ${supportedListStatuses.join(", ")}`);
  }
}

function createListFilters(flags) {
  assertListFilters(flags);

  return {
    kind: flags.kind,
    tag: flags.tag,
    owner: flags.owner,
    status: flags.status,
    target: flags.target
  };
}

function summarizeAssetForList(asset) {
  const summary = { ...asset };
  delete summary.renderedContent;
  return summary;
}

function groupAssetsForList(assets, groupBy = "kind") {
  const groups = new Map();

  for (const asset of assets) {
    const groupKeys =
      groupBy === "target"
        ? [...(asset.compatibility?.targets || [])]
        : [groupBy === "owner" ? asset.owner : asset.kind];

    for (const groupKey of groupKeys) {
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }

      groups.get(groupKey).push(asset);
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, items]) => ({
      key,
      assetCount: items.length,
      assets: items.sort((left, right) => left.id.localeCompare(right.id))
    }));
}

function groupTitle(groupBy, key, assetCount) {
  if (groupBy === "kind") {
    return `${key}s (${assetCount})`;
  }

  return `${groupBy}: ${key} (${assetCount})`;
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    printVersion();
    return;
  }

  switch (command) {
    case "init": {
      const { flags } = parseFlags(args);
      const result = await initWorkspace({
        force: flags.force === "true"
      });
      console.log(`Initialized Harness workspace at ${result.workspace}`);
      console.log(`Seeded ${result.assetCount} sample assets.`);
      return;
    }

    case "list": {
      const { flags } = parseFlags(args);
      const workspace = await loadWorkspace();
      const filters = createListFilters(flags);
      const assets = await listAssets(filters);
      const groupBy = flags["group-by"] || "kind";
      const groups = groupAssetsForList(assets, groupBy);

      if (flags.json === "true") {
        printJson({
          workspace: {
            name: workspace.name,
            version: workspace.version
          },
          filters,
          groupBy,
          assetCount: assets.length,
          groups: groups.map((group) => ({
            key: group.key,
            assetCount: group.assetCount,
            assets: group.assets.map(summarizeAssetForList)
          })),
          assets: assets.map(summarizeAssetForList)
        });
        return;
      }

      console.log(`${workspace.name} (${workspace.version})`);
      console.log(`Assets: ${assets.length}`);

      for (const group of groups) {
        console.log("");
        console.log(groupTitle(groupBy, group.key, group.assetCount));
        for (const asset of group.assets) {
          console.log(`- ${asset.id} @ ${asset.version}`);
        }
      }
      return;
    }

    case "targets": {
      const workspace = await loadWorkspace();
      const targets = await listAdapterTargets(workspace);

      console.log(`Targets (${targets.length})`);
      for (const target of targets) {
        console.log(`- ${target.target} [${target.source}]`);
      }
      return;
    }

    case "validate": {
      const { flags } = parseFlags(args);
      const result = await validateWorkspace();
      if (flags.json === "true") {
        printJson(result);
        if (!result.valid) {
          process.exitCode = 1;
        }
        return;
      }

      if (result.valid) {
        console.log(`Workspace is valid.`);
        console.log(`Checked ${result.assetCount} assets.`);
        return;
      }

      console.log(`Workspace validation failed.`);
      console.log(`Found ${pluralize(result.issueCount, "issue")}.`);
      console.log("");
      result.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
      process.exitCode = 1;
      return;
    }

    case "new": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId] = positionals;
      if (!kind || !assetId) {
        throw new Error("Usage: harness new <kind> <id> [--name <name>] [--description <text>] [--owner <owner>] [--tags a,b] [--targets a,b] [--version x.y.z] [--note <text>]");
      }

      const result = await createAsset(kind, assetId, flags);
      console.log(`Created [${result.kind}] ${result.id} @ ${result.version}`);
      return;
    }

    case "clone": {
      const { flags, positionals } = parseFlags(args);
      const [kind, sourceId, targetId] = positionals;
      if (!kind || !sourceId || !targetId) {
        throw new Error("Usage: harness clone <kind> <source-id> <target-id> [--name <name>] [--version x.y.z] [--note <text>]");
      }

      const result = await cloneAsset(kind, sourceId, targetId, flags);
      console.log(`Cloned [${result.kind}] ${result.sourceId} -> ${result.id} @ ${result.version}`);
      return;
    }

    case "archive": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId] = positionals;
      if (!kind || !assetId) {
        throw new Error("Usage: harness archive <kind> <id> [--reason <text>]");
      }

      const result = await archiveAsset(kind, assetId, flags);
      console.log(`Archived [${result.kind}] ${result.id}`);
      console.log(`Status: ${result.status}`);
      console.log(`Reason: ${result.reason}`);
      return;
    }

    case "set": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId] = positionals;
      if (!kind || !assetId) {
        throw new Error("Usage: harness set <kind> <id> [--name <name>] [--description <text>] [--owner <owner>] [--tags a,b] [--targets a,b]");
      }

      const result = await updateAssetMetadata(kind, assetId, flags);
      console.log(`Updated [${result.kind}] ${result.id} @ ${result.version}`);
      console.log(`Fields: ${result.updatedFields.join(", ")}`);
      return;
    }

    case "add-dependency": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId, dependencyKind, dependencyId] = positionals;
      if (!kind || !assetId || !dependencyKind || !dependencyId) {
        throw new Error("Usage: harness add-dependency <kind> <id> <dependency-kind> <dependency-id> [--optional]");
      }

      const result = await addAssetDependency(kind, assetId, dependencyKind, dependencyId, flags);
      console.log(`Added dependency to [${result.kind}] ${result.id}`);
      console.log(`Dependency: ${result.dependency.kind}:${result.dependency.id} (${result.dependency.required ? "required" : "optional"})`);
      console.log(`Dependencies: ${result.dependencyCount}`);
      return;
    }

    case "remove-dependency": {
      const { positionals } = parseFlags(args);
      const [kind, assetId, dependencyKind, dependencyId] = positionals;
      if (!kind || !assetId || !dependencyKind || !dependencyId) {
        throw new Error("Usage: harness remove-dependency <kind> <id> <dependency-kind> <dependency-id>");
      }

      const result = await removeAssetDependency(kind, assetId, dependencyKind, dependencyId);
      console.log(`Removed dependency from [${result.kind}] ${result.id}`);
      console.log(`Dependency: ${result.dependency.kind}:${result.dependency.id}`);
      console.log(`Dependencies: ${result.dependencyCount}`);
      return;
    }

    case "bump-version": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId, version] = positionals;
      if (!kind || !assetId || !version) {
        throw new Error("Usage: harness bump-version <kind> <id> <version> [--note <text>]");
      }

      const result = await bumpAssetVersion(kind, assetId, version, flags);
      console.log(`Bumped ${result.id} from ${result.previousVersion} to ${result.nextVersion}`);
      return;
    }

    case "diff": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId, fromVersion, toVersion] = positionals;
      if (!kind || !assetId || !fromVersion) {
        throw new Error("Usage: harness diff <kind> <id> <from-version> [to-version]");
      }

      const result = await diffAsset(kind, assetId, fromVersion, toVersion);
      if (flags.json === "true") {
        printJson(result);
        return;
      }

      const metadataSummary = summarizeDiff(result.metadataDiff);
      const contentSummary = summarizeDiff(result.contentDiff);

      console.log(`Diff: ${result.id}`);
      console.log(`Kind: ${result.kind}`);
      console.log(`Range: ${result.fromVersion} -> ${result.toVersion}`);
      console.log(`Summary: ${result.metadataFieldsChanged.length} metadata fields changed; content ${result.hasContentChanges ? "changed" : "unchanged"}`);
      if (result.metadataFieldsChanged.length > 0) {
        console.log(`Fields: ${result.metadataFieldsChanged.join(", ")}`);
      }
      console.log("");
      printSection(`Metadata (${metadataSummary.additions} additions, ${metadataSummary.removals} removals)`, [result.metadataDiff]);
      console.log("");
      printSection(`Content (${contentSummary.additions} additions, ${contentSummary.removals} removals)`, [result.contentDiff]);
      return;
    }

    case "deps": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId] = positionals;
      if (!kind || !assetId) {
        throw new Error("Usage: harness deps <kind> <id> [--json]");
      }

      const result = await getAssetDependencies(kind, assetId);
      if (flags.json === "true") {
        printJson(result);
        return;
      }

      console.log(`Dependencies: ${result.id}`);
      console.log(`Kind: ${result.kind}`);
      console.log(`Direct: ${result.directDependencies.length}`);
      console.log(`Resolved assets: ${result.resolvedAssets.length}`);
      console.log(`Missing: ${result.missing.length}`);
      console.log(`Cycles: ${result.cycles.length}`);
      if (result.directDependencies.length > 0) {
        console.log("");
        result.directDependencies.forEach((dependency) => {
          console.log(`- ${dependency.kind}:${dependency.id} (${dependency.required ? "required" : "optional"}, ${dependency.status})`);
        });
      }
      return;
    }

    case "dependents": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId] = positionals;
      if (!kind || !assetId) {
        throw new Error("Usage: harness dependents <kind> <id> [--json]");
      }

      const result = await getAssetDependents(kind, assetId);
      if (flags.json === "true") {
        printJson(result);
        return;
      }

      console.log(`Dependents: ${result.id}`);
      console.log(`Kind: ${result.kind}`);
      console.log(`Direct: ${result.directDependents.length}`);
      console.log(`Upstream assets: ${result.upstreamAssets.length}`);
      console.log(`Paths: ${result.paths.length}`);
      if (result.paths.length > 0) {
        console.log("");
        result.paths.forEach((pathEntry) => {
          console.log(`- ${pathEntry.assets.join(" -> ")}`);
        });
      }
      return;
    }

    case "orphans": {
      const { flags } = parseFlags(args);
      if (flags.kind && !supportedKinds.includes(flags.kind)) {
        throw new Error(`Unsupported asset kind: ${flags.kind}. Supported kinds: ${supportedKinds.join(", ")}`);
      }

      const result = await getOrphanAssets({
        kind: flags.kind
      });
      if (flags.json === "true") {
        printJson(result);
        return;
      }

      console.log(`Orphans: ${result.orphanCount}`);
      console.log(`Entry kinds: ${result.entryKinds.join(", ")}`);
      if (result.orphans.length > 0) {
        console.log("");
        result.orphans.forEach((asset) => {
          console.log(`- ${asset.kind}:${asset.id} @ ${asset.version}`);
        });
      }
      return;
    }

    case "impact": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId] = positionals;
      if (!kind || !assetId) {
        throw new Error("Usage: harness impact <kind> <id> [--json]");
      }

      const result = await getAssetImpact(kind, assetId);
      if (flags.json === "true") {
        printJson(result);
        return;
      }

      console.log(`Impact: ${result.id}`);
      console.log(`Kind: ${result.kind}`);
      console.log(`Affected assets: ${result.affectedAssets.length}`);
      console.log(`Affected entry agents: ${result.affectedEntryAssets.length}`);
      console.log(`Suggested packs: ${result.suggestedPacks.length}`);
      if (result.suggestedPacks.length > 0) {
        console.log("");
        result.suggestedPacks.forEach((pack) => {
          console.log(`- ${pack.entry}`);
        });
      }
      return;
    }

    case "history": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId] = positionals;
      if (!kind || !assetId) {
        throw new Error("Usage: harness history <kind> <id>");
      }

      const result = await getAssetHistory(kind, assetId);
      if (flags.json === "true") {
        printJson(result);
        return;
      }

      console.log(`History: ${result.id}`);
      console.log(`Kind: ${result.kind}`);
      console.log(`Current: ${result.currentVersion}`);
      console.log(`Versions: ${result.history.length}`);
      console.log("");
      result.history.forEach((entry) => {
        const marker = entry.version === result.currentVersion ? "*" : "-";
        console.log(`${marker} ${entry.version} | ${entry.date} | ${entry.notes}`);
        if (entry.snapshot) {
          console.log(`  snapshot: ${entry.snapshot}`);
        }
      });
      return;
    }

    case "show": {
      const { flags, positionals } = parseFlags(args);
      const [kind, assetId, version] = positionals;
      if (!kind || !assetId) {
        throw new Error("Usage: harness show <kind> <id> [version] [--metadata|--content|--resolved]");
      }

      const enabledModes = [flags.metadata === "true", flags.content === "true", flags.resolved === "true"].filter(Boolean).length;
      if (enabledModes > 1) {
        throw new Error("Choose only one of --metadata, --content, or --resolved.");
      }

      if (flags.resolved === "true") {
        printJson(await showResolvedAsset(kind, assetId, version));
        return;
      }

      const asset = version ? await showAssetVersion(kind, assetId, version) : await showAsset(kind, assetId);
      if (flags.metadata === "true") {
        const metadata = { ...asset };
        delete metadata.renderedContent;
        printJson(metadata);
        return;
      }

      if (flags.content === "true") {
        console.log(asset.renderedContent);
        return;
      }

      printJson(asset);
      return;
    }

    case "export": {
      const { flags, positionals } = parseFlags(args);
      const [target] = positionals;
      const result = await exportWorkspace(target, {
        entry: parseEntryFlag(flags.entry),
        includeDependencies: flags["include-dependencies"] === "true"
      });
      if (flags.json === "true") {
        printJson(result);
        return;
      }

      console.log(`Export complete.`);
      console.log(`Target: ${result.target}`);
      console.log(`Assets: ${result.assetCount}`);
      if (result.entry) {
        console.log(`Entry: ${result.entry}`);
        console.log(`Included dependencies: ${result.includeDependencies ? "yes" : "no"}`);
      }
      console.log(`Output: ${result.outputPath}`);
      return;
    }

    case "pack": {
      const { flags, positionals } = parseFlags(args);
      const [target] = positionals;
      const result = await packWorkspace(target, {
        entry: parseEntryFlag(flags.entry),
        includeDependencies: flags["include-dependencies"] === "true",
        output: flags.output
      });
      if (flags.json === "true") {
        printJson(result);
        return;
      }

      console.log(`Pack complete.`);
      console.log(`Target: ${result.target}`);
      console.log(`Entry: ${result.entry}`);
      console.log(`Assets: ${result.assetCount}`);
      console.log(`Included dependencies: ${result.includeDependencies ? "yes" : "no"}`);
      console.log(`Bundle: ${result.bundlePath}`);
      console.log(`Manifest: ${result.manifestPath}`);
      console.log(`Checksums: ${result.checksumsPath}`);
      return;
    }

    case "verify-bundle": {
      const { flags, positionals } = parseFlags(args);
      const [bundlePath] = positionals;
      if (!bundlePath) {
        throw new Error("Usage: harness verify-bundle <bundle-path> [--json]");
      }

      const result = await verifyBundle(bundlePath);
      if (flags.json === "true") {
        printJson(result);
        if (!result.valid) {
          process.exitCode = 1;
        }
        return;
      }

      if (result.valid) {
        console.log("Bundle is valid.");
        console.log(`Bundle: ${result.bundlePath}`);
        return;
      }

      console.log("Bundle verification failed.");
      console.log(`Found ${pluralize(result.issueCount, "issue")}.`);
      console.log("");
      result.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
      process.exitCode = 1;
      return;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
