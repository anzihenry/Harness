# Harness 0.2.0 Planning

## 1. 版本目标

`0.1.x` 已经完成了 Harness 的最小闭环：

- 统一 `agent` / `skill` / `instruction` 资产模型
- 资产级语义版本与 snapshot 历史
- `validate` / `new` / `bump-version` / `history` / `show` / `diff` / `export` 命令
- `generic`、`openai-codex`、`claude-code` 三类导出 target

`0.2.0` 的目标不是继续堆更多基础命令，而是把 Harness 从“单机资产管理工具”推进到“适合团队复用的资产打包与交付工具”。

本版本聚焦四个方向：

1. 让资产可以被筛选、组合、批量操作，而不是只能逐个处理
2. 让导出结果可以形成可追踪的 release artifact，而不是只有一次性的 target JSON
3. 让资产之间可以表达依赖关系，支撑更真实的 Agent 组装场景
4. 让 CLI 输出更适合自动化消费，为后续接 CI、registry、发布流程做准备

非目标：

- 不在 `0.2.0` 引入远端 registry
- 不在 `0.2.0` 做多用户并发编辑
- 不在 `0.2.0` 引入复杂权限系统
- 不在 `0.2.0` 重写现有 adapter 体系

一句话定义：

`0.2.0` 要把 Harness 做成“可组合、可打包、可自动化”的本地资产工作台。

## 2. 用户场景

### 场景 1：按条件查找资产

团队里有几十个 `skill` 和 `instruction`，用户需要快速回答这些问题：

- 哪些资产归 `team-harness` 所有
- 哪些资产适配 `openai-codex`
- 哪些资产带有 `review` 或 `release` 标签
- 当前有哪些 `instruction` 还没有被任何 agent 组合使用

当前痛点：

- `list` 只能全量罗列
- 结果更偏人读，不适合脚本处理

`0.2.0` 目标：

- 支持过滤、分组和 JSON 输出

### 场景 2：组装一个可导出的 Agent 资产包

用户希望导出某个 agent 时，不只是导出 agent 自己，还要自动带出它依赖的：

- system instruction
- 关联 skill
- 基础 guardrail instruction

当前痛点：

- 资产之间没有显式依赖关系
- 导出只能基于全工作区，缺少“组合视角”

`0.2.0` 目标：

- 支持通过依赖关系组装一个完整 asset bundle

### 场景 3：为一次发布生成稳定产物

用户准备交付一组 Agent 资产给另一个团队或一个运行时，需要：

- 记录本次导出的目标 target
- 记录包含了哪些资产、哪些版本
- 记录导出时间和工作区版本
- 在后续回溯时知道“当时交付的到底是什么”

当前痛点：

- `export` 结果更像渲染产物，而不是发布产物
- 没有 manifest 级别的稳定描述

`0.2.0` 目标：

- 引入 `pack` 或等价的发布打包命令，产出 manifest + payload

### 场景 4：把 Harness 接入自动化流程

用户希望在 CI 或脚本里做这些事：

- 校验某批资产是否合规
- 输出机器可读的错误信息
- 判断某次变更影响了哪些资产
- 在发布前生成标准化的 bundle

当前痛点：

- CLI 输出主要面向人工阅读
- 缺少稳定的 JSON 输出契约

`0.2.0` 目标：

- 为核心命令补充 `--json`
- 为筛选、校验、导出提供稳定结构

## 3. 功能清单

### A. 查询与筛选

新增能力：

- `list` 支持 `--kind`
- `list` 支持 `--tag`
- `list` 支持 `--owner`
- `list` 支持 `--target`
- `list` 支持 `--json`
- `history` 支持 `--json`
- `show` 支持 `--json` 保持结构稳定

预期收益：

- CLI 从“看得见”升级到“查得快”
- 为脚本和 CI 提供稳定输入

### B. 组合与依赖

新增能力：

- 资产 metadata 支持声明依赖关系
- `show` 可选展示解析后的依赖树
- `export` 支持按入口资产导出，而不是只能导出全工作区
- 检测循环依赖、缺失依赖、跨 target 不兼容依赖

预期收益：

- 一个 agent 可以显式引用自己需要的 skill / instruction
- 减少手工维护组合关系的成本

### C. 打包与发布产物

新增能力：

- 新增 `pack` 命令
- 产出 bundle manifest
- 产出与 target 渲染结果解耦的发布目录
- manifest 中记录资产版本集合、目标 target、生成时间、工作区版本

预期收益：

- 让导出从“临时结果”变成“可回溯交付物”
- 为后续 registry 或远端发布保留演进空间

### D. 自动化友好输出

新增能力：

- `validate --json`
- `diff --json`
- `export --json`
- `pack --json`
- 明确错误码和稳定字段名

预期收益：

- shell、Node.js、CI 都能直接消费
- 后续接 GitHub Actions 或内部发布流水线更顺

### E. 范围内但延后实现的候选项

这些方向值得保留，但不建议作为 `0.2.0` 必做：

- `rename`
- `clone`
- `archive`
- release channel，例如 `draft` / `stable`
- 远端 registry 同步
- 签名或校验和体系

## 4. 命令设计

以下是 `0.2.0` 建议新增或增强的 CLI 设计。

### `harness list`

目标：

- 支持按条件检索资产

建议语法：

```bash
harness list [--kind <kind>] [--tag <tag>] [--owner <owner>] [--target <target>] [--json]
```

示例：

```bash
harness list --kind skill
harness list --tag review
harness list --owner team-harness --target openai-codex
harness list --kind instruction --json
```

### `harness show`

目标：

- 在查看单个资产时支持依赖视图和机器可读输出

建议语法：

```bash
harness show <kind> <id> [version] [--metadata|--content|--resolved] [--json]
```

说明：

- `--resolved` 表示返回资产本体加依赖解析结果
- `--json` 下输出固定结构，便于脚本使用

### `harness validate`

目标：

- 在现有工作区校验基础上，加入依赖完整性校验

建议语法：

```bash
harness validate [--json]
```

新增校验点：

- 依赖目标是否存在
- 依赖类型是否合法
- 是否存在循环依赖
- 依赖资产是否与声明 target 兼容

### `harness export`

目标：

- 保留“按 target 渲染”的定位，但支持导出局部资产集合

建议语法：

```bash
harness export [target] [--entry <kind:id>] [--include-dependencies] [--json]
```

说明：

- 未传 `--entry` 时，保持当前全工作区导出语义
- 传入 `--entry` 时，只导出指定入口资产及可选依赖

示例：

```bash
harness export openai-codex --entry agent:agent.harness-manager --include-dependencies
```

### `harness pack`

目标：

- 生成面向交付的 bundle，而不是只有某个 target 的渲染结果

建议语法：

```bash
harness pack [target] --entry <kind:id> [--include-dependencies] [--output <dir>] [--json]
```

建议输出内容：

- `manifest.json`
- `assets.json`
- `rendered/<target>.json`

示例：

```bash
harness pack openai-codex \
  --entry agent:agent.harness-manager \
  --include-dependencies \
  --output releases/harness-manager-codex
```

### `harness diff`

目标：

- 保留当前人读摘要，同时支持机器读结构

建议语法：

```bash
harness diff <kind> <id> <from-version> [to-version] [--json]
```

建议 JSON 字段：

- `id`
- `kind`
- `fromVersion`
- `toVersion`
- `metadataFieldsChanged`
- `hasContentChanges`
- `metadataDiff`
- `contentDiff`

## 5. 数据模型变更

`0.2.0` 建议在保持现有模型兼容的前提下，做增量扩展。

### Workspace model

当前字段：

- `name`
- `version`
- `timezone`
- `defaultTarget`
- `supportedTargets`
- `exportDirectory`
- `adapterModules`

建议新增字段：

```json
{
  "bundleDirectory": "releases",
  "schemaVersion": "1"
}
```

说明：

- `bundleDirectory`：`pack` 默认输出目录
- `schemaVersion`：为后续模型演进做兼容分层

### Asset model

当前字段：

- `id`
- `name`
- `kind`
- `version`
- `description`
- `tags`
- `owner`
- `compatibility.targets`
- `content.entry`
- `history`

建议新增字段：

```json
{
  "dependencies": [
    {
      "kind": "instruction",
      "id": "instruction.repository-guardrails",
      "required": true
    },
    {
      "kind": "skill",
      "id": "skill.prompt-authoring",
      "required": true
    }
  ]
}
```

字段约束建议：

- `dependencies` 可选，默认空数组
- 每个依赖必须显式声明 `kind` 与 `id`
- `required` 默认 `true`
- 依赖目标必须真实存在
- 不允许重复依赖
- 不允许循环依赖

### Bundle manifest model

`0.2.0` 新增发布产物描述结构：

```json
{
  "bundleVersion": "1",
  "workspace": {
    "name": "Harness",
    "version": "0.2.0"
  },
  "target": "openai-codex",
  "entryAsset": {
    "kind": "agent",
    "id": "agent.harness-manager",
    "version": "0.2.0"
  },
  "includedAssets": [
    {
      "kind": "agent",
      "id": "agent.harness-manager",
      "version": "0.2.0"
    },
    {
      "kind": "instruction",
      "id": "instruction.repository-guardrails",
      "version": "1.0.0"
    }
  ],
  "generatedAt": "2026-06-18T10:00:00+08:00"
}
```

设计原则：

- manifest 只描述“交付了什么”
- target 渲染结果单独存放
- manifest 字段稳定，适合作为 CI 和发布记录输入

## 6. 里程碑拆分

建议把 `0.2.0` 拆成四个实现阶段，保证每一阶段都能独立验证。

### Milestone 1：查询与 JSON 输出

目标：

- 完成 `list` 的筛选能力
- 为 `list`、`validate`、`history`、`diff`、`export` 增加 `--json`

交付物：

- CLI 参数扩展
- 输出结构设计文档
- smoke tests 覆盖筛选与 JSON 模式

完成标准：

- 用户能稳定筛选资产
- 自动化脚本可以解析核心命令输出

### Milestone 2：依赖模型与校验

目标：

- 在 asset metadata 中引入 `dependencies`
- 完成依赖加载、依赖图遍历、循环依赖检测
- 在 `validate` 中加入依赖相关校验

交付物：

- 数据模型升级
- 依赖解析逻辑
- 对应测试样例

完成标准：

- 用户可以声明资产依赖
- `validate` 能准确发现依赖缺失和循环引用

### Milestone 3：局部导出与组合导出

目标：

- `export` 支持 `--entry` 和 `--include-dependencies`
- adapter 层可以接收已筛选资产集合

交付物：

- 入口资产解析
- 依赖闭包收集
- target 导出行为更新

完成标准：

- 用户能只导出一个 agent 及其依赖，而不是整个工作区

### Milestone 4：打包产物

目标：

- 实现 `pack`
- 生成 `manifest.json` + 渲染结果
- 定义 bundle 输出目录规范

交付物：

- `pack` CLI
- bundle manifest 结构
- 文档与端到端 smoke tests

完成标准：

- 用户能生成可回溯、可交付的 bundle
- 同一 bundle 能被人读，也能被后续自动化消费

## 推荐的 0.2.0 范围结论

如果要控制版本节奏，建议把 `0.2.0` 的正式范围锁定为：

1. 查询筛选与 `--json`
2. 资产依赖模型
3. 局部导出能力
4. `pack` 与 bundle manifest

这样既延续了 `0.1.x` 的现有架构，也能让 Harness 从“资产工作区”真正迈向“资产交付工具”。
