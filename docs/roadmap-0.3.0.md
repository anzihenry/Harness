# Harness 0.3.0 Planning

## 1. 当前基线

截至 `2026-06-17`，仓库当前基线版本为 `0.2.0`，并且已经具备一个可运行的本地资产工作台：

- 工作区初始化：`init`
- 资产查询：`list`、`targets`
- 资产校验：`validate`
- 资产创建与版本演进：`new`、`bump-version`
- 历史与差异查看：`history`、`show`、`diff`
- 导出与交付：`export`、`pack`
- 目标适配：内置 `generic`、`openai-codex`、`claude-code`
- 本地扩展：支持通过 `adapterModules` 加载自定义 adapter

当前仓库里的真实示例资产共有 `4` 个：

- `agent.harness-manager`
- `skill.agent-review`
- `skill.prompt-authoring`
- `instruction.repository-guardrails`

当前测试基线为 `12` 个 CLI smoke tests，已覆盖初始化、校验、查询、导出、打包、本地 adapter 和依赖校验等主流程。

## 2. 0.2.0 已经解决了什么

`0.1.x` 解决的是“有没有资产工作区”的问题。

`0.2.0` 进一步解决的是“资产能不能被组合、校验和交付”的问题：

- 资产模型支持 `dependencies`
- `validate` 能检查缺失依赖、重复依赖、循环依赖和 target 不兼容
- `show --resolved` 能展开依赖树和依赖图
- `list`、`validate`、`history`、`diff`、`export`、`pack` 都提供了稳定 JSON 输出
- `export` 支持 `--entry` 和 `--include-dependencies`
- `pack` 能生成 `manifest.json`、`assets.json` 和 target 渲染结果

这意味着 Harness 已经从“本地记录资产”跨到了“本地交付资产”。

## 3. 当前短板

虽然 `0.2.0` 的底座已经成型，但离“团队日常可维护、可发布、可扩展”的产品形态还差一段。

### A. 依赖能力已经落地，但作者体验仍然偏底层

依赖解析、依赖校验、依赖导出都已经实现了，但目前没有配套的作者命令：

- 不能通过 CLI 给资产增删依赖
- 不能通过 CLI 更新 metadata 字段
- 想维护依赖图，仍然要手改 `asset.json`

结果是：

- “模型能力”有了
- “日常维护入口”还没有补齐

### B. 生命周期只有创建和 bump，没有真正的维护闭环

当前资产生命周期命令主要是：

- `new`
- `bump-version`
- `show`
- `diff`

但缺少团队高频维护动作：

- `rename`
- `clone`
- `archive`
- `deprecate`
- `edit` / `set` / `add-dependency` / `remove-dependency`

这会导致 Harness 在真实仓库里一旦资产数量上来，维护成本很快转回手工编辑。

### C. 打包已经可用，但发布语义还不够强

`pack` 目前已经能生成 bundle 目录，但还缺少更强的发布保障：

- 没有 checksum / digest
- 没有 bundle 完整性校验命令
- 没有 release channel，例如 `draft` / `stable`
- 没有 lock / freeze 语义来约束“已交付资产”再被修改
- 没有统一的“发布前检查”入口

换句话说，当前更像“导出目录”，还不是“稳定发布物”。

### D. 依赖图可解析，但缺少反向分析和影响面分析

当前可以从入口资产向下解析依赖，但还不能方便回答这些问题：

- 哪些 agent 依赖了某个 skill
- 改动一个 instruction 会影响哪些 bundle
- 哪些资产没有被任何人引用
- 哪些资产是孤儿资产

这会限制 Harness 在团队治理场景中的价值。

### E. 仓库自带示例还没有完全体现 0.2.0 的能力

当前 `initWorkspace()` 里的 sample agent 已声明依赖，但仓库里实际提交的 `agent.harness-manager` 还没有依赖字段。

这说明：

- 引擎能力和演示资产之间存在轻微脱节
- README、示例资产、导出结果还可以继续收敛成同一套“最佳实践”

## 4. 0.3.0 版本目标

`0.3.0` 不建议优先做远端 registry，也不建议马上把系统做成复杂的平台。

更合理的目标是：

把 Harness 从“能管理资产”推进到“能高效维护资产，并且能产出更可信的发布物”。

一句话定义：

`0.3.0` 要把 Harness 做成“适合持续维护和正式交付”的本地资产发布工作台。

## 5. 版本主题

建议 `0.3.0` 聚焦四个主题。

### Theme 1. 资产维护命令补齐

目标：

- 让常见资产维护动作都能通过 CLI 完成，而不是要求用户手改 JSON

建议能力：

- `edit` 或 `set`：更新 `name`、`description`、`owner`、`tags`、`targets`
- `add-dependency`
- `remove-dependency`
- `rename`
- `clone`
- `archive` 或 `deprecate`

最低成功标准：

- 用户可以不打开 `asset.json`，完成大多数日常维护

### Theme 2. 依赖图治理与影响面分析

目标：

- 把“依赖能解析”升级为“依赖能治理”

建议能力：

- `deps <kind> <id>`：查看下游依赖
- `dependents <kind> <id>`：查看反向引用
- `orphans`：列出未被引用资产
- `impact --entry <kind:id>` 或 `impact --changed <path>`：分析改动影响面

最低成功标准：

- 能快速回答“改这个资产会影响谁”

### Theme 3. 发布物强化

目标：

- 让 `pack` 结果更接近正式 release artifact

建议能力：

- 为 bundle 生成 checksum / digest
- 新增 `verify-bundle` 命令
- manifest 记录更完整的 source 信息
- 支持 `channel` 或 `stability` 字段，如 `draft` / `stable`
- 支持生成压缩包，避免只保留目录形态

最低成功标准：

- 交付出去的 bundle 能被验证、能被追踪、能区分草稿和正式版本

### Theme 4. 仓库自举与示例一致性

目标：

- 让仓库本身成为 `0.3.0` 能力的最佳演示

建议能力：

- 更新内置样例资产，使其真正使用依赖关系
- 为样例资产补充更完整的历史和发布演示
- README 示例命令与仓库现状完全一致
- 增加一个“从编辑到发布”的完整 walkthrough

最低成功标准：

- 新用户 clone 仓库后，既能看到能力，也能照着样例走通流程

## 6. 明确不放进 0.3.0 的内容

为了避免路线发散，建议这些方向继续延后：

- 远端 registry / sync 服务
- 多用户协作锁和复杂权限模型
- Web UI
- 大规模插件市场
- 与 Git hosting 深度绑定的发布系统

这些方向都值得做，但不应该抢走 `0.3.0` 的主线。

## 7. 建议优先级

### P0

- 资产维护命令补齐
- 依赖图治理与反向查询
- 仓库样例与 README 收敛

### P1

- bundle checksum / verify
- `pack` 的 release channel / stability 字段
- bundle 压缩产物

### P2

- 更丰富的 impact analysis
- 面向 CI 的发布前组合命令，例如 `release-check`

## 8. 建议实施顺序

### Phase 1: 维护入口

先补齐资产编辑和依赖维护命令，因为这是所有后续能力的基础。

建议优先顺序：

1. `set`
2. `add-dependency`
3. `remove-dependency`
4. `rename`
5. `archive`

### Phase 2: 图治理

在维护命令稳定后，补充依赖图分析能力。

建议优先顺序：

1. `dependents`
2. `orphans`
3. `deps`
4. `impact`

### Phase 3: 发布强化

最后增强发布物强度，避免前面能力还在变化时过早冻结发布协议。

建议优先顺序：

1. bundle digest
2. `verify-bundle`
3. `channel`
4. archive package

## 9. 验收标准

如果 `0.3.0` 完成，应该至少能做到：

1. 不手改 JSON，也能完成大多数资产维护操作。
2. 能快速看出一个资产的上下游依赖关系。
3. 能回答一次变更会影响哪些资产和 bundle。
4. `pack` 产物具备基础完整性验证能力。
5. 仓库自带示例可以完整演示依赖、导出和发布流程。

## 10. 下一步建议

如果按最稳妥的节奏推进，建议下一阶段直接进入：

1. 先做 `Phase 1: 维护入口`
2. 同步把仓库示例资产升级到真正使用依赖关系
3. 在此基础上再展开 `dependents` / `orphans`

这样能先把 Harness 从“强模型、弱编辑”补成“强模型、可维护”，再继续向发布治理推进。
