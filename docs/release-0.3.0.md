# Harness 0.3.0 Release Prep

这份文档用于准备正式 `0.3.0` 发布。当前阶段只记录 release checklist，不直接 bump 版本、不创建 tag。

## 1. Release Scope

`0.3.0` 聚焦三条主线：

- 资产维护入口：`set`、`add-dependency`、`remove-dependency`、`clone`、`archive`
- 依赖图治理：`deps`、`dependents`、`orphans`、`impact`
- 发布物强化：bundle checksum、`verify-bundle`、release channel、`.tar.gz` archive package

发布前需要确认 README、walkthrough、changelog 和测试证据都已经覆盖以上能力。

## 2. Version Touchpoints

正式 bump `0.3.0` 时需要同步检查这些文件：

- `package.json`：CLI `--version` 的来源
- `.harness/workspace.json`：工作区基线版本
- `CHANGELOG.md`：把 `0.3.0 - Unreleased` 改为带日期的正式条目
- `README.md`：确认“当前仓库基线版本”已经从 `0.2.0` 切到 `0.3.0`
- `docs/roadmap-0.3.0.md`：确认 roadmap 状态与最终范围一致
- `docs/roadmap-0.3.0-tasks.md`：确认 Phase 任务状态可回溯
- `docs/walkthrough-asset-to-bundle.md`：确认示例命令仍能代表最终发布能力

建议版本日期使用发布当天的本地日期，例如 `2026-06-27`。

## 3. Required Verification

发布前至少运行：

```bash
node ./src/cli.js --version
node ./src/cli.js validate
npm run check
node ./src/cli.js deps agent agent.harness-manager --json
node ./src/cli.js impact skill skill.prompt-authoring --json
node ./src/cli.js pack generic --entry agent:agent.harness-manager --include-dependencies --channel stable --archive --json
node ./src/cli.js verify-bundle releases/agent.harness-manager-generic --json
git status --short
```

期望结果：

- `validate` 显示 workspace valid
- `npm run check` 全部通过
- `pack --channel stable --archive` 生成 bundle 目录和 `.tar.gz`
- `verify-bundle` 返回 success
- `git status --short` 只包含预期的 release bump 文件，或为空

## 4. Manual Checks

发布前人工确认：

- README 快速开始命令可以在当前仓库直接运行
- `docs/walkthrough-asset-to-bundle.md` 的临时目录流程没有依赖私有状态
- `CHANGELOG.md` 覆盖 Phase 1 到 Phase 4 的用户可见变化
- `releases/agent.harness-manager-generic/manifest.json` 中的 `channel`、`target`、`entry`、`digest` 信息正确
- `checksums.json` 覆盖 `manifest.json`、`assets.json` 和 `rendered/generic.json`
- `.tar.gz` 解压后可以再次通过 `verify-bundle`

## 5. Evidence Template

发布 PR 或 release note 可以附上：

```text
Version: 0.3.0
Date:
Commit:

Verification:
- node ./src/cli.js --version:
- node ./src/cli.js validate:
- npm run check:
- pack stable archive:
- verify-bundle:

Release artifact:
- Bundle:
- Archive:
- Manifest digest:
```

## 6. Suggested Release Flow

确认所有验证通过后，再执行版本 bump、提交、tag 和 push：

```bash
git add package.json .harness/workspace.json CHANGELOG.md README.md docs/release-0.3.0.md docs/walkthrough-asset-to-bundle.md
git commit -m "release: prepare 0.3.0"
git tag -a v0.3.0 -m "Release 0.3.0"
git push origin main --follow-tags
```

如果本次发布需要 GitHub Release，可以在 tag 推送后再基于 `CHANGELOG.md` 的 `0.3.0` 条目创建 release note。

## 7. Rollback Notes

如果发布后发现 bundle 校验或 CLI 回归：

- 不要重写已推送 tag
- 创建修复提交并发布 `0.3.1`
- 在 `CHANGELOG.md` 记录问题范围、修复命令和验证证据
