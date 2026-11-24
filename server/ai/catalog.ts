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
  // OpenAI - Latest models
  { id: "openai:gpt-4o", providerId: "openai", label: "GPT-4o", contextWindow: 128000, tools: true, vision: true, recommended: true },
  { id: "openai:gpt-4o-mini", providerId: "openai", label: "GPT-4o mini", contextWindow: 128000, tools: true, vision: true },
  
  // Anthropic - Latest Claude models
  { id: "anthropic:claude-sonnet-4-20250514", providerId: "anthropic", label: "Claude Sonnet 4", contextWindow: 200000, tools: true, vision: true, recommended: true },
  { id: "anthropic:claude-3-7-sonnet-20250219", providerId: "anthropic", label: "Claude 3.7 Sonnet", contextWindow: 200000, tools: true, vision: true },
  { id: "anthropic:claude-3-5-haiku-20241022", providerId: "anthropic", label: "Claude 3.5 Haiku", contextWindow: 200000, tools: true, vision: false },
  
  // Google - Latest Gemini models
  { id: "google:gemini-2.0-flash-exp", providerId: "google", label: "Gemini 2.0 Flash", contextWindow: 1000000, tools: true, vision: true, recommended: true },
  { id: "google:gemini-1.5-pro-latest", providerId: "google", label: "Gemini 1.5 Pro", contextWindow: 2000000, tools: true, vision: true },
  
  // DeepSeek - Latest models
  { id: "deepseek:deepseek-chat", providerId: "deepseek", label: "DeepSeek V3", contextWindow: 64000, tools: true, vision: false, recommended: true },
  
  // Groq - Fast inference
  { id: "groq:llama-3.3-70b-versatile", providerId: "groq", label: "Llama 3.3 70B (Groq)", contextWindow: 128000, tools: true, vision: false, recommended: true },
  
  // Ollama - Local models
  { id: "ollama:llama3.2", providerId: "ollama", label: "Llama 3.2 (Local)", contextWindow: 128000, tools: true, vision: false, recommended: true },
];
