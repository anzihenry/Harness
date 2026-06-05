#!/usr/bin/env node

import {
  bumpAssetVersion,
  createAsset,
  diffAsset,
  exportWorkspace,
  initWorkspace,
  listAssets,
  loadWorkspace,
  showAsset,
  validateWorkspace
} from "./core/workspace.js";

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
  harness validate
  harness new <kind> <id> [--name <name>] [--description <text>] [--owner <owner>] [--tags a,b] [--targets a,b] [--version x.y.z] [--note <text>]
  harness bump-version <kind> <id> <version> [--note <text>]
  harness diff <kind> <id> <from-version> [to-version]
  harness show <kind> <id>
  harness export <target>

Examples:
  harness init
  harness init --force
  harness list
  harness validate
  harness new skill skill.agent-review --owner team-harness --tags review,agent
  harness bump-version skill skill.prompt-authoring 1.1.0 --note "Refined guidance"
  harness diff skill skill.prompt-authoring 1.0.0 1.1.0
  harness show skill skill.prompt-authoring
  harness export openai-codex
`);
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
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

      console.log(`Workspace: ${workspace.name} (${workspace.version})`);
      for (const asset of assets) {
        console.log(`- [${asset.kind}] ${asset.id} @ ${asset.version}`);
      }
      return;
    }

    case "validate": {
      const result = await validateWorkspace();
      if (result.valid) {
        console.log(`Workspace is valid. Checked ${result.assetCount} assets.`);
        return;
      }

      console.log(`Workspace validation failed with ${result.issueCount} issue(s):`);
      for (const issue of result.issues) {
        console.log(`- ${issue}`);
      }
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
      console.log(`Diff for ${result.id}: ${result.fromVersion} -> ${result.toVersion}`);
      console.log("");
      console.log("Metadata:");
      console.log(result.metadataDiff);
      console.log("");
      console.log("Content:");
      console.log(result.contentDiff);
      return;
    }

    case "show": {
      const [kind, assetId] = args;
      if (!kind || !assetId) {
        throw new Error("Usage: harness show <kind> <id>");
      }

      printJson(await showAsset(kind, assetId));
      return;
    }

    case "export": {
      const [target] = args;
      if (!target) {
        throw new Error("Usage: harness export <target>");
      }

      const result = await exportWorkspace(target);
      console.log(`Exported ${result.assetCount} assets to ${result.outputPath}`);
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
