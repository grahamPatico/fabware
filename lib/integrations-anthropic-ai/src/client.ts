import Anthropic from "@anthropic-ai/sdk";

// Historically the Replit version of this app proxied through Replit's AI
// gateway with AI_INTEGRATIONS_ANTHROPIC_* vars. In production we also
// accept the stock ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL names the SDK
// uses by default — whichever is set wins. If neither API key is set we
// construct the client anyway and let the first call fail loudly, so that
// the server still boots for non-chat routes.
const apiKey =
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ??
  process.env.ANTHROPIC_API_KEY ??
  "";
const baseURL =
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ??
  process.env.ANTHROPIC_BASE_URL ??
  undefined;

export const anthropic = new Anthropic({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});
