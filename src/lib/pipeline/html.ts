// Lightweight HTML → plain text for conversation bodies. Intercom is fetched
// with display_as=plaintext, so bodies are mostly light markup; this strips the
// remaining tags and decodes common entities. Good enough for the scorer.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let t = html;
  // Block-level tags → newlines so paragraphs/lists stay readable.
  t = t.replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n");
  t = t.replace(/<\s*li[^>]*>/gi, "\n• ");
  // Drop all remaining tags.
  t = t.replace(/<[^>]+>/g, "");
  // Decode entities.
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  t = t.replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
  // Collapse excess whitespace.
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}
