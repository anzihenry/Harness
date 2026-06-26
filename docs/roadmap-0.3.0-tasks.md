# Harness 0.3.0 Task Breakdown

## 1. 工作方式

`0.3.0` 建议按 Phase 推进，每个 Phase 都保持“实现 + 文档 + smoke test”的闭环。

任务编号规则：

- `P1-*`：资产维护入口
- `P2-*`：依赖图治理
- `P3-*`：发布物强化
- `P4-*`：仓库自举、文档和发布准备

通用完成标准：

- CLI help 已包含新增命令或参数
- README 或相关 docs 已同步
- `npm test` 通过
- `node ./src/cli.js validate` 通过
- 涉及新增命令时，`tests/cli-smoke.test.js` 覆盖主流程和关键错误分支

## 2. Phase 1: 资产维护入口

目标：让用户不手改 `asset.json`，也能完成常见资产维护动作。

### P1-01: 增加 metadata 更新命令

建议命令：

```bash
node ./src/cli.js set <kind> <id> [--name <name>] [--description <text>] [--owner <owner>] [--tags a,b] [--targets a,b]
```

涉及文件：

- `src/cli.js`
- `src/core/workspace.js`
- `tests/cli-smoke.test.js`
- `README.md`

验收标准：

- 能更新 `name`、`description`、`owner`、`tags`、`compatibility.targets`
- 更新后保留当前 `version` 和 `history`
- `--targets` 会拒绝工作区未启用的 target
- 空更新返回清晰错误
- `validate` 能通过更新后的资产

### P1-02: 增加依赖添加命令

建议命令：

```bash
node ./src/cli.js add-dependency <kind> <id> <dependency-kind> <dependency-id> [--optional]
```

涉及文件：

- `src/cli.js`
- `src/core/workspace.js`
- `tests/cli-smoke.test.js`
- `README.md`

验收标准：

- 能向任意资产添加 `dependencies` 条目
- 默认 `required: true`
- `--optional` 写入 `required: false`
- 拒绝不存在的依赖资产
- 拒绝重复依赖
- 拒绝会造成循环引用的依赖
- 添加后 `show --resolved` 能看到依赖图

### P1-03: 增加依赖移除命令

建议命令：

```bash
node ./src/cli.js remove-dependency <kind> <id> <dependency-kind> <dependency-id>
```

涉及文件：

- `src/cli.js`
- `src/core/workspace.js`
- `tests/cli-smoke.test.js`
- `README.md`

验收标准：

- 能从 `dependencies` 中移除指定依赖
- 依赖不存在时返回清晰错误
- 移除后 `show --resolved` 和 `validate` 状态正确

### P1-04: 让仓库示例资产真正使用依赖关系

建议变更：

- 给 `agent.harness-manager` 添加对 `skill.prompt-authoring` 的依赖
- 给 `agent.harness-manager` 添加对 `instruction.repository-guardrails` 的依赖
- 评估是否把 `skill.agent-review` 也作为可选依赖接入

涉及文件：

- `assets/agents/agent.harness-manager/asset.json`
- `assets/agents/agent.harness-manager/.snapshots/0.1.0/asset.json`
- `README.md`
- `tests/cli-smoke.test.js`

验收标准：

- 当前仓库和 `initWorkspace()` 的 sample 行为一致
- `node ./src/cli.js show agent agent.harness-manager --resolved` 显示依赖树
- `node ./src/cli.js export generic --entry agent:agent.harness-manager --include-dependencies --json` 包含依赖资产

### P1-05: 增加 clone 命令

建议命令：

```bash
node ./src/cli.js clone <kind> <source-id> <target-id> [--name <name>] [--version x.y.z] [--note <text>]
```

涉及文件：

- `src/cli.js`
- `src/core/workspace.js`
- `tests/cli-smoke.test.js`
- `README.md`

验收标准：

- 能复制 metadata、content 和 dependencies
- 新资产拥有新的 `id`、`name`、`version` 和初始 history
- 新资产创建自己的 `.snapshots/<version>`
- 拒绝覆盖已有资产

### P1-06: 增加 archive 或 deprecate 命令

建议命令：

```bash
node ./src/cli.js archive <kind> <id> [--reason <text>]
node ./src/cli.js deprecate <kind> <id> [--reason <text>] [--replacement <kind:id>]
```

建议先实现一个命令，优先 `archive`。

验收标准：

- 资产 metadata 增加稳定状态字段，例如 `status: "active" | "archived"`
- `list` 默认仍可看到 archived 资产，或提供 `--status` 过滤
- `validate` 检查 status 合法
- 被其他资产依赖的资产归档时给出明确提醒或阻断策略

## 3. Phase 2: 依赖图治理

目标：让用户快速回答“谁依赖谁”和“改动会影响谁”。

### P2-01: 增加 deps 命令

建议命令：

```bash
node ./src/cli.js deps <kind> <id> [--json]
```

验收标准：

- 展示直接依赖和递归依赖
- JSON 输出包含 `directDependencies`、`resolvedAssets`、`missing`、`cycles`
- 与 `show --resolved` 共享底层解析逻辑

### P2-02: 增加 dependents 命令

建议命令：

```bash
node ./src/cli.js dependents <kind> <id> [--json]
```

验收标准：

- 展示直接引用该资产的资产
- 展示递归影响到的上游资产
- JSON 输出包含引用路径，便于 CI 或脚本消费

### P2-03: 增加 orphans 命令

建议命令：

```bash
node ./src/cli.js orphans [--kind <kind>] [--json]
```

验收标准：

- 找出没有被其他资产引用的非入口资产
- 支持按 kind 过滤
- 明确说明 agent 是否默认视为入口资产

### P2-04: 增加 impact 命令

建议命令：

```bash
node ./src/cli.js impact <kind> <id> [--json]
```

验收标准：

- 输出受影响资产
- 输出受影响 entry agent
- 输出建议重新 `pack` 的入口
- 后续可扩展到 `--changed <path>`

## 4. Phase 3: 发布物强化

目标：让 `pack` 结果从“目录产物”升级为“可验证 release artifact”。

### P3-01: bundle digest

建议变更：

- `pack` 生成 `checksums.json`
- `manifest.json` 记录 digest 算法和关键文件 digest

验收标准：

- digest 覆盖 `manifest.json`、`assets.json` 和 `rendered/<target>.json`
- 重复 pack 同样内容时 digest 稳定，时间戳字段不破坏可比对性

### P3-02: verify-bundle 命令

建议命令：

```bash
node ./src/cli.js verify-bundle <bundle-path> [--json]
```

验收标准：

- 校验 bundle 必需文件存在
- 校验 digest 匹配
- 校验 manifest 中的 asset 版本和 assets payload 一致
- 失败时返回非零退出码

### P3-03: release channel

建议命令：

```bash
node ./src/cli.js pack <target> --entry <kind:id> [--channel draft|stable]
```

验收标准：

- `manifest.json` 记录 channel
- 默认 channel 为 `draft`
- `stable` bundle 需要先通过 `validate`

### P3-04: archive package

建议命令：

```bash
node ./src/cli.js pack <target> --entry <kind:id> --archive
```

验收标准：

- 生成可分发压缩包
- 压缩包内容与 bundle 目录一致
- `verify-bundle` 能验证解压后的内容

## 5. Phase 4: 文档和发布准备

目标：让 `0.3.0` 可以被稳定验证、交付和回溯。

### P4-01: README 0.3.0 命令面同步

验收标准：

- README 快速开始包含新增高频命令
- 命令说明覆盖新增 CLI
- 示例命令能在当前仓库直接跑通

### P4-02: 增加完整 walkthrough

建议文档：

- `docs/walkthrough-asset-to-bundle.md`

验收标准：

- 覆盖创建资产
- 覆盖设置 metadata
- 覆盖添加依赖
- 覆盖依赖图检查
- 覆盖导出和打包验证

### P4-03: 增加 0.3.0 release prep

建议文档：

- `docs/release-0.3.0.md`

验收标准：

- 列出版本触点：`package.json`、`.harness/workspace.json`、`CHANGELOG.md`、README
- 列出验证命令
- 列出发布前人工检查项
- 列出 tag 和 push 建议流程

### P4-04: CHANGELOG 预留 0.3.0 草稿

验收标准：

- `CHANGELOG.md` 有 `0.3.0 - Unreleased`
- 按 Added / Changed / Fixed 归类
- 每个 Phase 完成时同步更新

## 6. 建议执行批次

### Batch A: 最小可用维护闭环

- `P1-01`
- `P1-02`
- `P1-03`
- `P1-04`

完成后，Harness 就具备可用的资产维护入口。

### Batch B: 图治理能力

- `P2-01`
- `P2-02`
- `P2-03`
- `P2-04`

完成后，Harness 就能支持团队级影响面分析。

### Batch C: 发布可信度

- `P3-01`
- `P3-02`
- `P3-03`
- `P3-04`

完成后，`pack` 产物具备基础发布物语义。

### Batch D: 发布准备

- `P4-01`
- `P4-02`
- `P4-03`
- `P4-04`

完成后，可以准备正式 `0.3.0` release。

## 7. 推荐下一步

下一步建议直接进入 `Batch A`，先实现：

1. `set`
2. `add-dependency`
3. `remove-dependency`
4. 仓库示例资产依赖收敛

这个批次能最快把 `0.3.0` 的核心价值从规划变成可运行能力。
