import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cliPath = path.resolve("src/cli.js");

function createWorkspaceDir() {
  return mkdtempSync(path.join(os.tmpdir(), "harness-smoke-"));
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8"
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

test("CLI smoke flow covers init, validate, list, show, export, new, bump-version, and diff", () => {
  const workspaceDir = createWorkspaceDir();

  try {
    let result = runCli(workspaceDir, ["init"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Initialized Harness workspace/);

    result = runCli(workspaceDir, ["validate"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Workspace is valid/);

    result = runCli(workspaceDir, ["list"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Assets: 3/);
    assert.match(result.stdout, /agents \(1\)/);
    assert.match(result.stdout, /- agent\.harness-manager @ 0\.1\.0/);
    assert.match(result.stdout, /skills \(1\)/);
    assert.match(result.stdout, /- skill\.prompt-authoring @ 1\.0\.0/);

    result = runCli(workspaceDir, ["show", "skill", "skill.prompt-authoring"]);
    assert.equal(result.status, 0, result.stderr);
    const shownAsset = JSON.parse(result.stdout);
    assert.equal(shownAsset.id, "skill.prompt-authoring");
    assert.match(shownAsset.renderedContent, /Write prompts that are:/);

    result = runCli(workspaceDir, ["history", "skill", "skill.prompt-authoring"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /History: skill\.prompt-authoring/);
    assert.match(result.stdout, /Current: 1\.0\.0/);
    assert.match(result.stdout, /- 1\.0\.0 \| 2026-06-06 \| Initial skill content\./);

    result = runCli(workspaceDir, [
      "new",
      "skill",
      "skill.release-checklist",
      "--description",
      "Release checklist for Harness assets",
      "--owner",
      "team-harness",
      "--tags",
      "release,quality"
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Created \[skill\] skill\.release-checklist @ 1\.0\.0/);

    result = runCli(workspaceDir, ["bump-version", "skill", "skill.release-checklist", "1.1.0", "--note", "Expanded rollout checks"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Bumped skill\.release-checklist from 1\.0\.0 to 1\.1\.0/);

    result = runCli(workspaceDir, ["show", "skill", "skill.release-checklist", "1.0.0"]);
    assert.equal(result.status, 0, result.stderr);
    const snapshotAsset = JSON.parse(result.stdout);
    assert.equal(snapshotAsset.version, "1.0.0");
    assert.match(snapshotAsset.renderedContent, /Add skill content here\./);

    result = runCli(workspaceDir, ["diff", "skill", "skill.release-checklist", "1.0.0", "1.1.0"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Diff: skill\.release-checklist/);
    assert.match(result.stdout, /Range: 1\.0\.0 -> 1\.1\.0/);
    assert.match(result.stdout, /Metadata \(\d+ additions, \d+ removals\)/);
    assert.match(result.stdout, /Content \(\d+ additions, \d+ removals\)/);
    assert.match(result.stdout, /Expanded rollout checks/);

    result = runCli(workspaceDir, ["export"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Target: generic/);

    result = runCli(workspaceDir, ["export", "generic"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Export complete\./);
    assert.match(result.stdout, /Target: generic/);
    assert.match(result.stdout, /Assets: 4/);
    assert.match(result.stdout, /Output: .*exports\/generic\.json/);

    const exportPath = path.join(workspaceDir, "exports", "generic.json");
    assert.equal(existsSync(exportPath), true);
    const exported = readJson(exportPath);
    assert.equal(exported.target, "generic");
    assert.equal(exported.assets.length, 4);
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test("init refuses to overwrite an existing workspace without --force", () => {
  const workspaceDir = createWorkspaceDir();

  try {
    let result = runCli(workspaceDir, ["init"]);
    assert.equal(result.status, 0, result.stderr);

    result = runCli(workspaceDir, ["init"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Harness workspace already exists/);
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test("export uses workspace exportDirectory and validate accepts the configured path", () => {
  const workspaceDir = createWorkspaceDir();

  try {
    let result = runCli(workspaceDir, ["init"]);
    assert.equal(result.status, 0, result.stderr);

    const workspaceConfigPath = path.join(workspaceDir, ".harness", "workspace.json");
    const workspace = readJson(workspaceConfigPath);
    workspace.exportDirectory = "custom-exports/nested";
    writeFileSync(workspaceConfigPath, `${JSON.stringify(workspace, null, 2)}\n`, "utf8");

    result = runCli(workspaceDir, ["validate"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Workspace is valid/);

    result = runCli(workspaceDir, ["export", "generic"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Output: .*custom-exports\/nested\/generic\.json/);

    const exportPath = path.join(workspaceDir, "custom-exports", "nested", "generic.json");
    assert.equal(existsSync(exportPath), true);
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test("history fails clearly for missing arguments", () => {
  const workspaceDir = createWorkspaceDir();

  try {
    const result = runCli(workspaceDir, ["history", "skill"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: harness history <kind> <id>/);
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});
