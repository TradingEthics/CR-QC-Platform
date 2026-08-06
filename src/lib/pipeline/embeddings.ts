// Text embeddings via Gemini (text-embedding-004) for the escalation detectors.
// Free-tier friendly; one batch HTTP call per conversation.
import "server-only";

const MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-001";

async function embedOne(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
    }),
  });
  if (!res.ok) throw new Error(`Embeddings ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as { embedding?: { values: number[] } };
  return data.embedding?.values ?? [];
}

/** Embed several texts (parallel single calls). Returns one vector per input, in order. */
export async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  return Promise.all(texts.map((t) => embedOne(t, apiKey)));
}

/** Cosine similarity of two equal-length vectors (0..1 for embeddings). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
