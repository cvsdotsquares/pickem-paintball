/**
 * Models James can pick for a Post Generator step from the post page (James, 17 Oct: bring in Fable when a
 * post needs more creativity). Shared by the job runner and the page, so keep it free of server-only imports.
 */
export const MODEL_CHOICES = [
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-fable-5-1", label: "Fable 5.1 (more creative)" },
] as const;

/**
 * Steps with a model picker, and the model each uses when James leaves it on Default.
 * Options = the three first layouts, where the idea turns into designs: Fable by default (James, 30 Oct; was Sonnet).
 */
export const PICKABLE_DEFAULTS: Record<string, string> = {
  "post-options": "claude-fable-5-1",
  "post-revise": "claude-opus-5-5",
};

export const modelLabel = (id: string) => MODEL_CHOICES.find((m) => m.id === id)?.label.split(" (")[0] ?? id;
