import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  AI_MOCK: z.string().optional(),
  AI_BASE_URL: z.string().url().optional().or(z.literal("")),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  CLOCKWORK_SECRET: z.string().optional(),
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
  model: parsed.data.AI_MODEL || undefined,
  secret: parsed.data.CLOCKWORK_SECRET || undefined,
};
