import { z } from "zod";
import fs from "node:fs";

// The API process previously only saw variables exported by the shell, while
// Vite read .env.local for the client. Load local files server-side too so an
// LLM_* or AI_* setup in .env.local works in both halves of the app.
for (const file of [".env.local", ".env"]) {
  try {
    if (fs.existsSync(file)) process.loadEnvFile(file);
  } catch {
    // A malformed env file is reported by configuration checks, not startup.
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  AI_MOCK: z.string().optional(),
  AI_BASE_URL: z.string().url().optional().or(z.literal("")),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional().or(z.literal("")),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  CLOCKWORK_SECRET: z.string().optional(),
  CLOCKWORK_PUBLIC_URL: z.string().url().optional().or(z.literal("")),
  KANE_ENABLED: z.string().optional(),
  KANE_AI_PLAY_ENABLED: z.string().optional(),
  KANE_CLI: z.string().optional(),
  KANE_TIMEOUT_SECONDS: z.coerce.number().int().positive().max(900).default(180),
  KANE_MAX_STEPS: z.coerce.number().int().positive().max(100).default(40),
  KANE_HEADLESS: z.string().optional(),
  KANE_AI_PLAY_EVIDENCE_DIR: z.string().optional(),
  KANE_AI_PLAY_TEST: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid server environment: ${detail}`);
}

export const env = {
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  mock: parsed.data.AI_MOCK === "1" || parsed.data.AI_MOCK === "true",
  baseUrl: parsed.data.AI_BASE_URL || undefined,
  apiKey: parsed.data.AI_API_KEY || undefined,
  model: parsed.data.LLM_MODEL || parsed.data.AI_MODEL || undefined,
  llmBaseUrl: parsed.data.LLM_BASE_URL || undefined,
  llmApiKey: parsed.data.LLM_API_KEY || undefined,
  secret: parsed.data.CLOCKWORK_SECRET || undefined,
  publicUrl: parsed.data.CLOCKWORK_PUBLIC_URL || undefined,
  kaneEnabled: parsed.data.KANE_ENABLED === "1" || parsed.data.KANE_ENABLED === "true",
  kaneAiPlayEnabled: parsed.data.KANE_AI_PLAY_ENABLED === "1" || parsed.data.KANE_AI_PLAY_ENABLED === "true",
  kaneCli: parsed.data.KANE_CLI || undefined,
  kaneTimeoutSeconds: parsed.data.KANE_TIMEOUT_SECONDS,
  kaneMaxSteps: parsed.data.KANE_MAX_STEPS,
  kaneHeadless: parsed.data.KANE_HEADLESS === "1" || parsed.data.KANE_HEADLESS === "true",
  kaneEvidenceDir: parsed.data.KANE_AI_PLAY_EVIDENCE_DIR || ".data/ai-play",
  kaneAiPlayTest: parsed.data.KANE_AI_PLAY_TEST || undefined,
};
