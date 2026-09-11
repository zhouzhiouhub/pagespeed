export type PageSignals = {
  url: string;
  title: string | null;
  description: string | null;
  h1: string[];
  h2: string[];
  navTexts: string[];
  language: string | null;
};

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      "i",
    );
    const m = html.match(re);
    const value = m?.[1] ?? m?.[2];
    if (value) return decodeEntities(value);
  }
  return null;
}

function pickAll(html: string, tag: string, limit = 12): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const text = decodeEntities(m[1].replace(/<[^>]+>/g, " "));
    if (text && text.length >= 2 && text.length <= 120) out.push(text);
  }
  return [...new Set(out)];
}

export function extractPageSignals(url: string, html: string): PageSignals {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : null;
  const description =
    pickMeta(html, ["description", "og:description"]) ?? null;
  const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);

  return {
    url,
    title,
    description,
    h1: pickAll(html, "h1", 5),
    h2: pickAll(html, "h2", 16),
    navTexts: pickAll(html, "a", 40).filter((t) => t.length <= 40).slice(0, 20),
    language: langMatch?.[1] ?? null,
  };
}
