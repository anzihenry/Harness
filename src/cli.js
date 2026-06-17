#!/usr/bin/env node

import { createRequire } from "node:module";
import { listAdapterTargets } from "./core/adapters.js";
import {
  bumpAssetVersion,
  createAsset,
  diffAsset,
  exportWorkspace,
  getAssetHistory,
  initWorkspace,
  listAssets,
  loadWorkspace,
  showAsset,
  showAssetVersion,
  validateWorkspace
} from "./core/workspace.js";
import { summarizeDiff } from "./utils/diff.js";

const require = createRequire(import.meta.url);
const { version: cliVersion } = require("../package.json");
const supportedKinds = ["agent", "skill", "instruction"];
const supportedListGroupBys = ["kind", "owner", "target"];

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
  harness list [--kind <kind>] [--tag <tag>] [--owner <owner>] [--target <target>] [--group-by <field>] [--json]
  harness targets
  harness validate [--json]
  harness new <kind> <id> [--name <name>] [--description <text>] [--owner <owner>] [--tags a,b] [--targets a,b] [--version x.y.z] [--note <text>]
  harness bump-version <kind> <id> <version> [--note <text>]
  harness diff <kind> <id> <from-version> [to-version] [--json]
  harness history <kind> <id> [--json]
  harness show <kind> <id> [version] [--metadata|--content]
  harness export [target] [--json]

Examples:
  harness init
  harness init --force
  harness list
  harness list --kind skill --json
  harness list --group-by owner
  harness targets
  harness validate --json
  harness new skill skill.agent-review --owner team-harness --tags review,agent
  harness bump-version skill skill.prompt-authoring 1.1.0 --note "Refined guidance"
  harness diff skill skill.prompt-authoring 1.0.0 1.1.0 --json
  harness history skill skill.prompt-authoring --json
  harness show skill skill.prompt-authoring 1.0.0
  harness show skill skill.prompt-authoring --content
  harness show skill skill.prompt-authoring
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

function assertListFilters(flags) {
  if (flags.kind && !supportedKinds.includes(flags.kind)) {
    throw new Error(`Unsupported asset kind: ${flags.kind}. Supported kinds: ${supportedKinds.join(", ")}`);
  }

  if (flags["group-by"] && !supportedListGroupBys.includes(flags["group-by"])) {
    throw new Error(`Unsupported list group: ${flags["group-by"]}. Supported groups: ${supportedListGroupBys.join(", ")}`);
  }
}

function createListFilters(flags) {
  assertListFilters(flags);

  return {
    kind: flags.kind,
    tag: flags.tag,
    owner: flags.owner,
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
        throw new Error("Usage: harness show <kind> <id> [version] [--metadata|--content]");
      }

      const asset = version ? await showAssetVersion(kind, assetId, version) : await showAsset(kind, assetId);
      if (flags.metadata === "true" && flags.content === "true") {
        throw new Error("Choose either --metadata or --content, not both.");
      }

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
      const result = await exportWorkspace(target);
      if (flags.json === "true") {
        printJson(result);
        return;
      }

      console.log(`Export complete.`);
      console.log(`Target: ${result.target}`);
      console.log(`Assets: ${result.assetCount}`);
      console.log(`Output: ${result.outputPath}`);
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
