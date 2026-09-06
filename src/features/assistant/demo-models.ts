// Demo-mode free-model allowlist (dependency-free: safe to import from the
// Cloudflare Worker relay too).
//
// The baked demo key WILL be extractable from the JS bundle. What makes that
// harmless is the combination of: this allowlist (free models only, enforced
// in the request path whenever the demo key is active) + a $0-5 capped
// OpenRouter key (repo secret OPENROUTER_KEY, set by a human).
//
// Verified 2026-09-06 via
// https://openrouter.ai/api/v1/models?supported_parameters=tools: every id
// below ends in ":free", has `"prompt": "0", "completion": "0"` pricing, and
// lists both "tools" and "tool_choice" in supported_parameters. The assistant
// depends on tool_calls, so a non-tool model would silently break it.
// Re-verify before rotating DEMO_DEFAULT_MODEL.

export const DEMO_DEFAULT_MODEL = "z-ai/glm-5.2:free"

export const DEMO_MODEL_ALLOWLIST: readonly string[] = [
  "cohere/north-mini-code:free",
  "dots-studio/dots-3-note-preview:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "inclusionai/ling-3.0-flash-sante:free",
  "liquid/lfm-2.5-2.6b:free",
  "minimax/minimax-m2.7:free",
  "minimax/minimax-m3:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "poolside/laguna-s-2.1:free",
  "poolside/laguna-xs-2.1:free",
  "thinkingmachines/inkling-small:free",
  "thinkingmachines/inkling:free",
  "z-ai/glm-5.2:free",
]

const DEMO_MODEL_SET: ReadonlySet<string> = new Set(DEMO_MODEL_ALLOWLIST)

/**
 * Exact allowlist match (after trimming incidental whitespace). Case-sensitive
 * on purpose: "Z-AI/GLM-5.2:FREE" is rejected. The paid anchor
 * ("z-ai/glm-5.2" without ":free") and prefixed/suffixed variants
 * ("openrouter/z-ai/glm-5.2:free", "z-ai/glm-5.2:free:extra") are rejected.
 */
export function isDemoModelAllowed(model: unknown): model is string {
  return typeof model === "string" && DEMO_MODEL_SET.has(model.trim())
}
