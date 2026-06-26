# Harness Asset-to-Bundle Walkthrough

这份 walkthrough 演示如何从一个全新的临时 Harness 工作区开始，完成资产创建、metadata 更新、依赖维护、依赖图巡检、导出、打包和 bundle 校验。

示例会写入 `/tmp/harness-walkthrough`，不会改动当前仓库里的真实资产。

## 1. 初始化临时工作区

```bash
rm -rf /tmp/harness-walkthrough
mkdir -p /tmp/harness-walkthrough
cd /tmp/harness-walkthrough
node /Users/xiejinheng/Coding/Harness/src/cli.js init
```

初始化后会生成 `.harness/workspace.json`、`assets/`、`exports/` 和示例资产。

## 2. 创建一个新 skill

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js new skill skill.release-checklist \
  --name "Release Checklist" \
  --description "Checklist for preparing release bundles" \
  --owner team-harness \
  --tags release,quality \
  --targets generic,openai-codex
```

这个命令会创建：

- `assets/skills/skill.release-checklist/asset.json`
- `assets/skills/skill.release-checklist/content.md`
- `assets/skills/skill.release-checklist/.snapshots/0.1.0/`

## 3. 更新 metadata

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js set skill skill.release-checklist \
  --description "Release readiness checklist for Harness bundles" \
  --owner team-platform \
  --tags release,quality,bundle
```

`set` 只更新资产 metadata，不会改变当前版本号，也不会重写历史版本。

## 4. 添加依赖

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js add-dependency skill skill.release-checklist \
  instruction instruction.repository-guardrails \
  --optional
```

依赖写入后，`validate` 会检查依赖资产是否存在、是否重复、是否形成循环，以及 target compatibility 是否兼容。

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js validate
```

## 5. 巡检依赖图

查看当前资产依赖了什么：

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js deps skill skill.release-checklist --json
```

查看哪些资产依赖某个 instruction：

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js dependents instruction instruction.repository-guardrails --json
```

查看孤立资产。`agent` 默认视为入口资产，不会被当成 orphan：

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js orphans --kind skill --json
```

查看修改某个资产可能影响哪些上游资产和 entry agent：

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js impact instruction instruction.repository-guardrails --json
```

## 6. 创建一个入口 agent

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js new agent agent.release-manager \
  --name "Release Manager" \
  --description "Agent for preparing release bundles" \
  --owner team-platform \
  --tags release,bundle \
  --targets generic,openai-codex

node /Users/xiejinheng/Coding/Harness/src/cli.js add-dependency agent agent.release-manager \
  skill skill.release-checklist
```

查看入口 agent 的解析结果：

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js show agent agent.release-manager --resolved
```

## 7. 导出入口资产

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js export generic \
  --entry agent:agent.release-manager \
  --include-dependencies \
  --json
```

导出文件默认写入 `.harness/workspace.json` 中的 `exportDirectory`，通常是 `exports/generic.json`。

## 8. 打包 draft bundle

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js pack generic \
  --entry agent:agent.release-manager \
  --include-dependencies \
  --json
```

bundle 默认写入 `releases/agent.release-manager-generic/`，核心文件包括：

- `manifest.json`
- `assets.json`
- `checksums.json`
- `rendered/generic.json`

## 9. 校验 bundle

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js verify-bundle releases/agent.release-manager-generic --json
```

`verify-bundle` 会检查必需文件、SHA-256 digest、manifest digest 记录，以及 manifest 与 assets payload 中的资产集合是否一致。

## 10. 打包 stable channel

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js pack generic \
  --entry agent:agent.release-manager \
  --include-dependencies \
  --channel stable
```

`stable` channel 会先执行 workspace validation。只有当前工作区有效时，命令才会产出 stable bundle。

## 11. 生成可分发压缩包

```bash
node /Users/xiejinheng/Coding/Harness/src/cli.js pack generic \
  --entry agent:agent.release-manager \
  --include-dependencies \
  --channel stable \
  --archive \
  --json
```

命令会同时保留 bundle 目录，并生成 `releases/agent.release-manager-generic.tar.gz`。

可以解压后再次校验：

```bash
mkdir -p /tmp/harness-bundle-check
tar -xzf releases/agent.release-manager-generic.tar.gz -C /tmp/harness-bundle-check
node /Users/xiejinheng/Coding/Harness/src/cli.js verify-bundle /tmp/harness-bundle-check/agent.release-manager-generic
```

## 12. 清理演示目录

```bash
rm -rf /tmp/harness-walkthrough /tmp/harness-bundle-check
```

如果想保留 evidence，可以先复制 `releases/agent.release-manager-generic/manifest.json` 和 `checksums.json`，它们是后续发布回溯最有价值的两个文件。
