// Simple spintax expansion for preview purposes.
// Supports patterns like: "{Oi|Olá}, tudo bem?"
// If multiple spintax blocks exist, it expands combinations up to a limit.

export function expandSpintax(input: string, limit = 12): string[] {
  const text = (input ?? "").toString();
  if (!text.includes("{") || !text.includes("|")) return [text];

  const results = new Set<string>();

  const expandRec = (current: string) => {
    if (results.size >= limit) return;

    const start = current.indexOf("{");
    if (start === -1) {
      results.add(current);
      return;
    }

    const end = current.indexOf("}", start + 1);
    if (end === -1) {
      // Unmatched brace -> do not try to expand further
      results.add(current);
      return;
    }

    const inside = current.slice(start + 1, end);
    // If it's not spintax (no pipe), keep as-is and continue searching
    if (!inside.includes("|")) {
      expandRec(current.slice(0, end + 1) + current.slice(end + 1));
      return;
    }

    const options = inside
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);

    if (options.length === 0) {
      results.add(current);
      return;
    }

    for (const opt of options) {
      if (results.size >= limit) break;
      const next = current.slice(0, start) + opt + current.slice(end + 1);
      expandRec(next);
    }
  };

  expandRec(text);

  const arr = Array.from(results);
  return arr.length ? arr : [text];
}

// Process spintax by randomly selecting one option from each {option1|option2} block
export function processSpintaxRandom(input: string): string {
  const text = (input ?? "").toString();
  if (!text.includes("{") || !text.includes("|")) return text;

  let result = text;
  const regex = /\{([^{}]+)\}/g;
  
  let match;
  while ((match = regex.exec(result)) !== null) {
    const inside = match[1];
    if (inside.includes("|")) {
      const options = inside.split("|").map((s) => s.trim()).filter(Boolean);
      if (options.length > 0) {
        const randomOption = options[Math.floor(Math.random() * options.length)];
        result = result.slice(0, match.index) + randomOption + result.slice(match.index + match[0].length);
        // Reset regex to search from the beginning since string changed
        regex.lastIndex = 0;
      }
    }
  }
  
  return result;
}
