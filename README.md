# Harness

Harness 是一个用于管理 Agent 相关资产的本地工具。它聚焦三类核心能力：

- 统一管理 `agents`、`skills`、`instructions` 等资产
- 为资产附带版本元数据，支持演进、追踪和导出
- 面向不同 Agent 运行时，按各自配置规范自适应导出

当前仓库提供的是第一版 MVP：一个零依赖 Node.js CLI，加上一套可扩展的资产模型与适配层。

## 解决的问题

随着 Agent 工程逐步复杂，团队通常会遇到这些问题：

- 资产分散在不同目录，难以统一治理
- 同一份能力描述需要适配多个 Agent 平台，格式不一致
- 提示词、技能说明、执行指令随着版本演进，缺少统一元数据
- 团队很难知道“哪份资产是当前生效版本”

Harness 的设计目标是把这些内容收敛成一个可管理、可导出、可扩展的资产工作区。

## 当前能力

### 1. 资产类型

当前支持三类基础资产：

- `agent`
- `skill`
- `instruction`

每个资产都带有统一元数据：

- `id`
- `name`
- `kind`
- `version`
- `description`
- `tags`
- `owner`
- `compatibility`
- `content`
- `history`

### 2. Agent 适配导出

当前内置三种导出适配器：

- `generic`
- `openai-codex`
- `claude-code`

工作区也可以通过 `.harness/workspace.json` 中的 `adapterModules` 挂载本地 adapter 模块，为仓库新增自定义 target。

适配器会把统一资产模型转换成目标 Agent 更容易消费的结构，例如：

- `openai-codex` 输出更贴近 instructions / tools / assets 的组织方式
- `claude-code` 输出更贴近 system prompt / skills / metadata 的组织方式
- `generic` 输出保持最小抽象，适合二次加工

### 3. 版本治理

第一版先实现“资产级版本元数据”：

- 每个资产有独立 `version`
- 每个资产维护 `history`
- 工作区记录支持的 Agent target 与导出配置

后续可以继续扩展：

- 资产锁定与发布标签
- 版本 diff
- 多环境推广
- registry / remote sync

## 目录结构

```text
.
├── .harness/
│   └── workspace.json
├── assets/
│   ├── agents/
│   ├── skills/
│   └── instructions/
├── exports/
├── src/
│   ├── cli.js
│   ├── core/
│   │   ├── adapters.js
│   │   ├── paths.js
│   │   └── workspace.js
│   └── utils/
│       └── json.js
└── docs/
    └── architecture.md
```

## 快速开始

要求：Node.js 18+

```bash
node ./src/cli.js init
node ./src/cli.js init --force
node ./src/cli.js list
node ./src/cli.js targets
node ./src/cli.js validate
node ./src/cli.js new skill skill.agent-review --owner team-harness --tags review,agent
node ./src/cli.js bump-version skill skill.agent-review 1.1.0 --note "Expanded rubric"
node ./src/cli.js diff skill skill.agent-review 1.0.0 1.1.0
node ./src/cli.js history skill skill.agent-review
node ./src/cli.js show skill skill.prompt-authoring 1.0.0
node ./src/cli.js show skill skill.prompt-authoring
node ./src/cli.js export openai-codex
node ./src/cli.js export
```

导出结果默认写入 `.harness/workspace.json` 中 `exportDirectory` 指定的目录；当前默认值是 `exports/<target>.json`。

## 命令说明

### `init`

初始化工作区目录与示例资产。若工作区已存在，命令会拒绝覆盖；只有显式传入 `--force` 时才会重写现有工作区文件。

```bash
node ./src/cli.js init
node ./src/cli.js init --force
```

### `list`

列出当前工作区中的全部资产。

```bash
node ./src/cli.js list
```

### `targets`

列出当前工作区可用的全部导出 targets，包括内置 adapter 和通过 `adapterModules` 加载的本地 adapter。

```bash
node ./src/cli.js targets
```

### `validate`

校验工作区配置、资产元数据、内容文件和版本快照是否完整。

```bash
node ./src/cli.js validate
```

### `new <kind> <id>`

创建一个新资产，同时初始化 `asset.json`、`content.md` 和首个版本快照。

```bash
node ./src/cli.js new skill skill.agent-review \
  --name "Agent Review" \
  --description "Review checklist for agent changes" \
  --owner team-harness \
  --tags review,quality
```

### `bump-version <kind> <id> <version>`

更新资产版本，并把当前内容固化为新的版本快照。

```bash
node ./src/cli.js bump-version skill skill.agent-review 1.1.0 --note "Expanded review checklist"
```

### `diff <kind> <id> <from-version> [to-version]`

比较两个版本的 metadata 和正文内容。若省略 `to-version`，默认对比到当前版本。

```bash
node ./src/cli.js diff skill skill.agent-review 1.0.0 1.1.0
node ./src/cli.js diff skill skill.agent-review 1.0.0
```

### `history <kind> <id>`

查看指定资产的版本时间线。

```bash
node ./src/cli.js history skill skill.prompt-authoring
```

### `show <kind> <id> [version]`

查看指定资产的完整内容；如果传入版本号，则返回对应 snapshot 的内容。

```bash
node ./src/cli.js show instruction instruction.repository-guardrails
node ./src/cli.js show skill skill.prompt-authoring 1.0.0
```

### `export [target]`

按目标 Agent 规范导出配置，输出目录由工作区配置中的 `exportDirectory` 决定。若省略 `target`，默认使用工作区配置中的 `defaultTarget`。

```bash
node ./src/cli.js export
node ./src/cli.js export generic
node ./src/cli.js export openai-codex
node ./src/cli.js export claude-code
```

## 设计原则

- 先统一内部模型，再做外部适配
- 资产与适配器解耦
- 版本信息与内容本体并存
- 本地优先，后续再接远端 registry

## 本地 Adapter 扩展

如果你想为某个团队内 Agent 运行时增加专用导出格式，可以在工作区里声明本地 adapter 模块：

```json
{
  "supportedTargets": ["generic", "json-lines"],
  "defaultTarget": "generic",
  "adapterModules": ["adapters/json-lines.js"]
}
```

示例模块：

```js
export default {
  target: "json-lines",
  render(workspace, assets) {
    return assets.map((asset) => ({
      workspace: workspace.name,
      id: asset.id,
      kind: asset.kind,
      version: asset.version
    }));
  }
};
```

## 下一步建议

这一版已经覆盖初始化、校验、创建、版本提升、差异比较和导出。如果继续推进，建议优先做这几个方向：

1. 把 `validate` 升级为正式 schema 校验和更强的错误定位
2. 为 `diff` 增加更细粒度的结构化输出
3. 把适配器拆成插件系统
4. 增加 Git 集成，让版本发布和资产变更自动关联

详细设计见 [docs/architecture.md](/Users/xiejinheng/Coding/Harness/docs/architecture.md)。
