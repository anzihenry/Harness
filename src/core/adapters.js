import path from "node:path";
import { pathToFileURL } from "node:url";

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

const builtInAdapterDefinitions = [
  {
    target: "generic",
    render: genericAdapter,
    source: "built-in"
  },
  {
    target: "openai-codex",
    render: openAICodexAdapter,
    source: "built-in"
  },
  {
    target: "claude-code",
    render: claudeCodeAdapter,
    source: "built-in"
  }
];

function createRegistry() {
  return new Map();
}

function normalizeAdapterDefinition(adapter, source) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error(`Invalid adapter from ${source}. Expected an object export.`);
  }

  if (typeof adapter.target !== "string" || adapter.target.trim() === "") {
    throw new Error(`Invalid adapter from ${source}. Adapter target must be a non-empty string.`);
  }

  if (typeof adapter.render !== "function") {
    throw new Error(`Invalid adapter from ${source}. Adapter render must be a function.`);
  }

  return {
    target: adapter.target,
    render: adapter.render,
    source
  };
}

export function registerAdapter(registry, adapter) {
  const normalized = normalizeAdapterDefinition(adapter, adapter.source || "runtime");
  registry.set(normalized.target, normalized);
  return normalized;
}

function registerBuiltInAdapters(registry) {
  for (const adapter of builtInAdapterDefinitions) {
    registerAdapter(registry, adapter);
  }
}

function collectModuleAdapters(moduleExports, source) {
  const candidates = [];

  if (Array.isArray(moduleExports.adapters)) {
    candidates.push(...moduleExports.adapters);
  }

  if (moduleExports.adapter) {
    candidates.push(moduleExports.adapter);
  }

  if (moduleExports.default) {
    if (Array.isArray(moduleExports.default)) {
      candidates.push(...moduleExports.default);
    } else if (typeof moduleExports.default === "function" && typeof moduleExports.target === "string") {
      candidates.push({
        target: moduleExports.target,
        render: moduleExports.default
      });
    } else {
      candidates.push(moduleExports.default);
    }
  }

  if (typeof moduleExports.target === "string" && typeof moduleExports.render === "function") {
    candidates.push({
      target: moduleExports.target,
      render: moduleExports.render
    });
  }

  if (candidates.length === 0) {
    throw new Error(`Adapter module ${source} did not export any adapters.`);
  }

  return candidates.map((adapter) => normalizeAdapterDefinition(adapter, source));
}

async function loadAdapterModule(modulePath) {
  const moduleUrl = pathToFileURL(modulePath).href;
  const moduleExports = await import(moduleUrl);
  return collectModuleAdapters(moduleExports, modulePath);
}

export async function getAdapterRegistry(workspace, workspaceRoot = process.cwd()) {
  const registry = createRegistry();
  registerBuiltInAdapters(registry);

  for (const adapterModule of workspace.adapterModules || []) {
    const resolvedPath = path.resolve(workspaceRoot, adapterModule);
    const adapters = await loadAdapterModule(resolvedPath);
    for (const adapter of adapters) {
      registerAdapter(registry, adapter);
    }
  }

  return registry;
}

export async function listAdapterTargets(workspace, workspaceRoot = process.cwd()) {
  const registry = await getAdapterRegistry(workspace, workspaceRoot);
  return [...registry.values()]
    .map((adapter) => ({
      target: adapter.target,
      source: adapter.source
    }))
    .sort((left, right) => left.target.localeCompare(right.target));
}

export async function renderForTarget(target, workspace, assets, workspaceRoot = process.cwd()) {
  const registry = await getAdapterRegistry(workspace, workspaceRoot);
  const adapter = registry.get(target);

  if (!adapter) {
    const supported = [...registry.keys()].sort().join(", ");
    throw new Error(`Unsupported target: ${target}. Supported targets: ${supported}`);
  }

  return adapter.render(workspace, assets);
}
