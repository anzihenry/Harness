#!/usr/bin/env node

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
  harness init [--force]
  harness list
  harness targets
  harness validate
  harness new <kind> <id> [--name <name>] [--description <text>] [--owner <owner>] [--tags a,b] [--targets a,b] [--version x.y.z] [--note <text>]
  harness bump-version <kind> <id> <version> [--note <text>]
  harness diff <kind> <id> <from-version> [to-version]
  harness history <kind> <id>
  harness show <kind> <id> [version]
  harness export [target]

Examples:
  harness init
  harness init --force
  harness list
  harness targets
  harness validate
  harness new skill skill.agent-review --owner team-harness --tags review,agent
  harness bump-version skill skill.prompt-authoring 1.1.0 --note "Refined guidance"
  harness diff skill skill.prompt-authoring 1.0.0 1.1.0
  harness history skill skill.prompt-authoring
  harness show skill skill.prompt-authoring 1.0.0
  harness show skill skill.prompt-authoring
  harness export openai-codex
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

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
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
      const workspace = await loadWorkspace();
      const assets = await listAssets();
      const groupedAssets = {
        agent: assets.filter((asset) => asset.kind === "agent"),
        skill: assets.filter((asset) => asset.kind === "skill"),
        instruction: assets.filter((asset) => asset.kind === "instruction")
      };

      console.log(`${workspace.name} (${workspace.version})`);
      console.log(`Assets: ${assets.length}`);

      for (const [kind, items] of Object.entries(groupedAssets)) {
        if (items.length === 0) {
          continue;
        }

        console.log("");
        console.log(`${kind}s (${items.length})`);
        for (const asset of items) {
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
      const result = await validateWorkspace();
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
      const { positionals } = parseFlags(args);
      const [kind, assetId, fromVersion, toVersion] = positionals;
      if (!kind || !assetId || !fromVersion) {
        throw new Error("Usage: harness diff <kind> <id> <from-version> [to-version]");
      }

      const result = await diffAsset(kind, assetId, fromVersion, toVersion);
      const metadataSummary = summarizeDiff(result.metadataDiff);
      const contentSummary = summarizeDiff(result.contentDiff);

      console.log(`Diff: ${result.id}`);
      console.log(`Kind: ${result.kind}`);
      console.log(`Range: ${result.fromVersion} -> ${result.toVersion}`);
      console.log("");
      printSection(`Metadata (${metadataSummary.additions} additions, ${metadataSummary.removals} removals)`, [result.metadataDiff]);
      console.log("");
      printSection(`Content (${contentSummary.additions} additions, ${contentSummary.removals} removals)`, [result.contentDiff]);
      return;
    }

    case "history": {
      const [kind, assetId] = args;
      if (!kind || !assetId) {
        throw new Error("Usage: harness history <kind> <id>");
      }

      const result = await getAssetHistory(kind, assetId);
      console.log(`History: ${result.id}`);
      console.log(`Kind: ${result.kind}`);
      console.log(`Current: ${result.currentVersion}`);
      console.log("");
      result.history.forEach((entry) => {
        console.log(`- ${entry.version} | ${entry.date} | ${entry.notes}`);
      });
      return;
    }

    case "show": {
      const [kind, assetId, version] = args;
      if (!kind || !assetId) {
        throw new Error("Usage: harness show <kind> <id> [version]");
      }

      const asset = version ? await showAssetVersion(kind, assetId, version) : await showAsset(kind, assetId);
      printJson(asset);
      return;
    }

    case "export": {
      const [target] = args;
      const result = await exportWorkspace(target);
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
