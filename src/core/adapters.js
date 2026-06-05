function toBaseAsset(asset) {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    version: asset.version,
    description: asset.description,
    tags: asset.tags,
    owner: asset.owner,
    compatibility: asset.compatibility,
    content: asset.renderedContent,
    history: asset.history
  };
}

function groupByKind(assets) {
  return assets.reduce(
    (result, asset) => {
      result[asset.kind].push(asset);
      return result;
    },
    {
      agent: [],
      skill: [],
      instruction: []
    }
  );
}

function genericAdapter(workspace, assets) {
  return {
    target: "generic",
    workspace: {
      name: workspace.name,
      version: workspace.version,
      defaultTarget: workspace.defaultTarget
    },
    assets: assets.map(toBaseAsset)
  };
}

function openAICodexAdapter(workspace, assets) {
  const grouped = groupByKind(assets);

  return {
    target: "openai-codex",
    workspace: {
      name: workspace.name,
      version: workspace.version
    },
    agents: grouped.agent.map((asset) => ({
      id: asset.id,
      name: asset.name,
      profile: asset.renderedContent
    })),
    skills: grouped.skill.map((asset) => ({
      id: asset.id,
      name: asset.name,
      instructions: asset.renderedContent,
      version: asset.version
    })),
    instructions: grouped.instruction.map((asset) => ({
      id: asset.id,
      body: asset.renderedContent,
      tags: asset.tags
    }))
  };
}

function claudeCodeAdapter(workspace, assets) {
  const grouped = groupByKind(assets);

  return {
    target: "claude-code",
    metadata: {
      workspace: workspace.name,
      version: workspace.version
    },
    system: grouped.instruction.map((asset) => ({
      id: asset.id,
      prompt: asset.renderedContent
    })),
    skills: grouped.skill.map((asset) => ({
      key: asset.id,
      title: asset.name,
      markdown: asset.renderedContent,
      tags: asset.tags
    })),
    agents: grouped.agent.map((asset) => ({
      key: asset.id,
      config: asset.renderedContent
    }))
  };
}

export const adapters = {
  generic: genericAdapter,
  "openai-codex": openAICodexAdapter,
  "claude-code": claudeCodeAdapter
};

export function renderForTarget(target, workspace, assets) {
  const adapter = adapters[target];
  if (!adapter) {
    const supported = Object.keys(adapters).join(", ");
    throw new Error(`Unsupported target: ${target}. Supported targets: ${supported}`);
  }

  return adapter(workspace, assets);
}
