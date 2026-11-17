export interface BuiltInProvider {
  id: string;
  name: string;
  apiStyle: "openai-compatible" | "anthropic" | "google";
  baseUrl: string;
  envKeyName: string;
  modelsEndpoint: boolean;
  local?: boolean;
}

export interface ModelMeta {
  id: string;
  providerId: string;
  label: string;
  contextWindow: number;
  tools: boolean;
  vision: boolean;
  recommended?: boolean;
  custom?: boolean;
}

export const BUILT_IN_PROVIDERS: BuiltInProvider[] = [
  { id: "openai", name: "OpenAI", apiStyle: "openai-compatible", baseUrl: "https://api.openai.com/v1", envKeyName: "OPENAI_API_KEY", modelsEndpoint: true },
  { id: "anthropic", name: "Anthropic", apiStyle: "anthropic", baseUrl: "https://api.anthropic.com", envKeyName: "ANTHROPIC_API_KEY", modelsEndpoint: true },
  { id: "google", name: "Google Gemini", apiStyle: "google", baseUrl: "https://generativelanguage.googleapis.com", envKeyName: "GOOGLE_API_KEY", modelsEndpoint: true },
  { id: "openrouter", name: "OpenRouter", apiStyle: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", envKeyName: "OPENROUTER_API_KEY", modelsEndpoint: true },
  { id: "groq", name: "Groq", apiStyle: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", envKeyName: "GROQ_API_KEY", modelsEndpoint: true },
  { id: "mistral", name: "Mistral", apiStyle: "openai-compatible", baseUrl: "https://api.mistral.ai/v1", envKeyName: "MISTRAL_API_KEY", modelsEndpoint: true },
  { id: "deepseek", name: "DeepSeek", apiStyle: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", envKeyName: "DEEPSEEK_API_KEY", modelsEndpoint: true },
  { id: "xai", name: "xAI", apiStyle: "openai-compatible", baseUrl: "https://api.x.ai/v1", envKeyName: "XAI_API_KEY", modelsEndpoint: true },
  { id: "together", name: "Together", apiStyle: "openai-compatible", baseUrl: "https://api.together.xyz/v1", envKeyName: "TOGETHER_API_KEY", modelsEndpoint: true },
  { id: "fireworks", name: "Fireworks", apiStyle: "openai-compatible", baseUrl: "https://api.fireworks.ai/inference/v1", envKeyName: "FIREWORKS_API_KEY", modelsEndpoint: true },
  { id: "ollama", name: "Ollama", apiStyle: "openai-compatible", baseUrl: "http://localhost:11434/v1", envKeyName: "OLLAMA_API_KEY", modelsEndpoint: true, local: true },
];

export const CURATED_MODELS: ModelMeta[] = [
  { id: "openai:gpt-4o", providerId: "openai", label: "GPT-4o", contextWindow: 128000, tools: true, vision: true, recommended: true },
  { id: "openai:gpt-4o-mini", providerId: "openai", label: "GPT-4o mini", contextWindow: 128000, tools: true, vision: true },
  { id: "openai:o4-mini", providerId: "openai", label: "o4-mini", contextWindow: 200000, tools: true, vision: true },
  { id: "anthropic:claude-sonnet-4", providerId: "anthropic", label: "Claude Sonnet 4", contextWindow: 200000, tools: true, vision: true, recommended: true },
  { id: "anthropic:claude-3-7-sonnet", providerId: "anthropic", label: "Claude 3.7 Sonnet", contextWindow: 200000, tools: true, vision: true },
  { id: "anthropic:claude-3-5-haiku", providerId: "anthropic", label: "Claude 3.5 Haiku", contextWindow: 200000, tools: true, vision: false },
  { id: "google:gemini-2.0-flash", providerId: "google", label: "Gemini 2.0 Flash", contextWindow: 1000000, tools: true, vision: true, recommended: true },
  { id: "google:gemini-1.5-pro", providerId: "google", label: "Gemini 1.5 Pro", contextWindow: 2000000, tools: true, vision: true },
  { id: "google:gemini-1.5-flash", providerId: "google", label: "Gemini 1.5 Flash", contextWindow: 1000000, tools: true, vision: true },
  { id: "openrouter:openai/gpt-4o-mini", providerId: "openrouter", label: "GPT-4o mini (OpenRouter)", contextWindow: 128000, tools: true, vision: true, recommended: true },
  { id: "openrouter:anthropic/claude-3.5-sonnet", providerId: "openrouter", label: "Claude 3.5 Sonnet (OpenRouter)", contextWindow: 200000, tools: true, vision: true },
  { id: "openrouter:google/gemini-flash-1.5", providerId: "openrouter", label: "Gemini Flash 1.5 (OpenRouter)", contextWindow: 1000000, tools: true, vision: true },
  { id: "groq:llama-3.3-70b-versatile", providerId: "groq", label: "Llama 3.3 70B", contextWindow: 128000, tools: true, vision: false, recommended: true },
  { id: "groq:llama-3.1-8b-instant", providerId: "groq", label: "Llama 3.1 8B Instant", contextWindow: 128000, tools: true, vision: false },
  { id: "groq:mixtral-8x7b-32768", providerId: "groq", label: "Mixtral 8x7B", contextWindow: 32768, tools: true, vision: false },
  { id: "mistral:mistral-large-latest", providerId: "mistral", label: "Mistral Large", contextWindow: 128000, tools: true, vision: false, recommended: true },
  { id: "mistral:mistral-small-latest", providerId: "mistral", label: "Mistral Small", contextWindow: 32000, tools: true, vision: false },
  { id: "mistral:pixtral-large-latest", providerId: "mistral", label: "Pixtral Large", contextWindow: 128000, tools: true, vision: true },
  { id: "deepseek:deepseek-chat", providerId: "deepseek", label: "DeepSeek Chat", contextWindow: 64000, tools: true, vision: false, recommended: true },
  { id: "deepseek:deepseek-reasoner", providerId: "deepseek", label: "DeepSeek Reasoner", contextWindow: 64000, tools: false, vision: false },
  { id: "deepseek:deepseek-coder", providerId: "deepseek", label: "DeepSeek Coder", contextWindow: 64000, tools: true, vision: false },
  { id: "xai:grok-2", providerId: "xai", label: "Grok 2", contextWindow: 131072, tools: true, vision: false, recommended: true },
  { id: "xai:grok-2-vision", providerId: "xai", label: "Grok 2 Vision", contextWindow: 32768, tools: true, vision: true },
  { id: "xai:grok-beta", providerId: "xai", label: "Grok Beta", contextWindow: 131072, tools: true, vision: false },
  { id: "together:meta-llama/Llama-3.3-70B-Instruct-Turbo", providerId: "together", label: "Llama 3.3 70B Turbo", contextWindow: 128000, tools: true, vision: false, recommended: true },
  { id: "together:Qwen/Qwen2.5-72B-Instruct-Turbo", providerId: "together", label: "Qwen 2.5 72B", contextWindow: 32768, tools: true, vision: false },
  { id: "together:meta-llama/Llama-Vision-Free", providerId: "together", label: "Llama Vision", contextWindow: 131072, tools: true, vision: true },
  { id: "fireworks:accounts/fireworks/models/llama-v3p3-70b-instruct", providerId: "fireworks", label: "Llama 3.3 70B", contextWindow: 128000, tools: true, vision: false, recommended: true },
  { id: "fireworks:accounts/fireworks/models/qwen2p5-72b-instruct", providerId: "fireworks", label: "Qwen 2.5 72B", contextWindow: 32768, tools: true, vision: false },
  { id: "fireworks:accounts/fireworks/models/llama-v3p2-11b-vision-instruct", providerId: "fireworks", label: "Llama 3.2 11B Vision", contextWindow: 128000, tools: true, vision: true },
  { id: "ollama:llama3.2", providerId: "ollama", label: "Llama 3.2", contextWindow: 128000, tools: true, vision: false, recommended: true },
  { id: "ollama:qwen2.5", providerId: "ollama", label: "Qwen 2.5", contextWindow: 32768, tools: true, vision: false },
  { id: "ollama:llava", providerId: "ollama", label: "LLaVA", contextWindow: 8192, tools: false, vision: true },
];
