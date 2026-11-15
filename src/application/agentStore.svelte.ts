import {
  backendAdapter,
  type AgentChatMessage,
  type AgentProviderConfig,
  type AgentProviderPreset,
} from '../infrastructure/backendAdapter';
import { modelStore } from './modelStore.svelte';
import { uiStore } from './uiStore.svelte';

const AGENT_CONFIG_KEY = 'lonestar-agent-config';

export const AGENT_PRESET_DEFAULTS: Record<
  Exclude<AgentProviderPreset, 'custom'>,
  { label: string; baseUrl: string; model: string; requiresKey: boolean }
> = {
  lmstudio: {
    label: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1',
    model: 'google/gemma-4-e4b',
    requiresKey: false,
  },
  ollama: {
    label: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'gemma4:e4b',
    requiresKey: false,
  },
  openai: {
    label: 'OpenAI (Cloud)',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    requiresKey: true,
  },
  openrouter: {
    label: 'OpenRouter (Cloud)',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.5-pro',
    requiresKey: true,
  },
};

export function defaultAgentConfig(): AgentProviderConfig {
  return {
    providerPreset: 'lmstudio',
    baseUrl: AGENT_PRESET_DEFAULTS.lmstudio.baseUrl,
    model: AGENT_PRESET_DEFAULTS.lmstudio.model,
    apiKey: '',
    temperature: 0.2,
    includeIstarDocs: true,
  };
}

function loadPersistedConfig(): AgentProviderConfig {
  const defaults = defaultAgentConfig();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(AGENT_CONFIG_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AgentProviderConfig>;
    return {
      providerPreset: parsed.providerPreset ?? defaults.providerPreset,
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : defaults.baseUrl,
      model: typeof parsed.model === 'string' ? parsed.model : defaults.model,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : defaults.apiKey,
      temperature:
        typeof parsed.temperature === 'number' && !Number.isNaN(parsed.temperature)
          ? Math.min(1.5, Math.max(0, parsed.temperature))
          : defaults.temperature,
      includeIstarDocs:
        typeof parsed.includeIstarDocs === 'boolean'
          ? parsed.includeIstarDocs
          : defaults.includeIstarDocs,
    };
  } catch {
    return defaults;
  }
}

function savePersistedConfig(config: AgentProviderConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AGENT_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export interface AgentConversationEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  appliedOperations: string[];
  repairedWarnings: string[];
  errors: string[];
  mutatedModel: boolean;
  isError?: boolean;
}

function nextMsgId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

class AgentStore {
  config = $state<AgentProviderConfig>(loadPersistedConfig());
  messages = $state<AgentConversationEntry[]>([]);
  busy = $state<boolean>(false);
  availableModels = $state<string[]>([]);
  connectionStatus = $state<'idle' | 'ok' | 'error'>('idle');
  connectionMessage = $state<string>('');

  updateConfig(patch: Partial<AgentProviderConfig>): void {
    this.config = { ...this.config, ...patch };
    savePersistedConfig(this.config);
  }

  applyPreset(preset: AgentProviderPreset): void {
    if (preset === 'custom') {
      this.updateConfig({ providerPreset: 'custom' });
      this.availableModels = [];
      this.connectionStatus = 'idle';
      this.connectionMessage = '';
      return;
    }
    const spec = AGENT_PRESET_DEFAULTS[preset];
    this.updateConfig({
      providerPreset: preset,
      baseUrl: spec.baseUrl,
      model: spec.model,
    });
    this.availableModels = [];
    this.connectionStatus = 'idle';
    this.connectionMessage = '';
  }

  async detectModels(): Promise<void> {
    this.connectionStatus = 'idle';
    this.connectionMessage = 'Checking endpoint…';
    try {
      const models = await backendAdapter.agentListModels(
        this.config.baseUrl,
        this.config.apiKey,
      );
      this.availableModels = models;
      if (models.length === 0) {
        this.connectionStatus = 'ok';
        this.connectionMessage = 'Connected, but no loaded models were returned.';
      } else {
        this.connectionStatus = 'ok';
        this.connectionMessage = `Found ${models.length} model(s).`;
        if (!this.config.model.trim() || (models.length === 1 && !models.includes(this.config.model))) {
          this.updateConfig({ model: models[0] });
        }
      }
    } catch (err) {
      this.availableModels = [];
      this.connectionStatus = 'error';
      this.connectionMessage = String(err);
    }
  }

  async sendPrompt(promptText: string, onAfterModelUpdate?: () => void): Promise<void> {
    const clean = promptText.trim();
    if (!clean || this.busy) return;

    const priorHistory: AgentChatMessage[] = this.messages
      .filter((m) => !m.isError && m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    this.messages = [
      ...this.messages,
      {
        id: nextMsgId('u'),
        role: 'user',
        content: clean,
        appliedOperations: [],
        repairedWarnings: [],
        errors: [],
        mutatedModel: false,
      },
    ];

    this.busy = true;
    try {
      const modelSnapshot = JSON.parse(JSON.stringify(modelStore.model));
      const configSnapshot = JSON.parse(JSON.stringify(this.config)) as AgentProviderConfig;

      const res = await backendAdapter.agentRunTurn({
        config: configSnapshot,
        modelState: modelSnapshot,
        selectedEntityId: uiStore.selection?.id ?? null,
        history: priorHistory,
        userPrompt: clean,
      });

      const mutated = res.appliedOperations.length > 0;
      if (mutated) {
        modelStore.replaceModel(res.updatedModel);
        const sel = uiStore.selection;
        if (sel) {
          const stillExists =
            (sel.type === 'actor' && res.updatedModel.actors.some((a) => a.id === sel.id)) ||
            (sel.type === 'element' && res.updatedModel.elements.some((e) => e.id === sel.id)) ||
            (sel.type === 'link' && res.updatedModel.links.some((l) => l.id === sel.id)) ||
            (sel.type === 'dependency' &&
              res.updatedModel.dependencies.some((d) => d.id === sel.id));
          if (!stillExists) {
            uiStore.selection = null;
          }
        }
        onAfterModelUpdate?.();
        uiStore.notify(
          `AI Agent applied ${res.appliedOperations.length} change(s)`,
          res.errors.length > 0 ? 'info' : 'success',
        );
      }

      this.messages = [
        ...this.messages,
        {
          id: nextMsgId('a'),
          role: 'assistant',
          content: res.assistantMessage,
          appliedOperations: res.appliedOperations,
          repairedWarnings: res.repairedWarnings,
          errors: res.errors,
          mutatedModel: mutated,
        },
      ];
    } catch (err) {
      const errText = err instanceof Error ? err.message : String(err);
      this.messages = [
        ...this.messages,
        {
          id: nextMsgId('err'),
          role: 'assistant',
          content: `Request failed: ${errText}`,
          appliedOperations: [],
          repairedWarnings: [],
          errors: [errText],
          mutatedModel: false,
          isError: true,
        },
      ];
      uiStore.notify('AI Agent request failed', 'error');
    } finally {
      this.busy = false;
    }
  }

  clearConversation(): void {
    this.messages = [];
  }
}

export const agentStore = new AgentStore();
