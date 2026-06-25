export function stripMarkdown(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitBlocks(markdown) {
  return String(markdown || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function markdownProtectedRanges(markdown) {
  const ranges = [];
  const text = String(markdown || "");
  const patterns = [
    /```[\s\S]*?```/g,
    /`[^`]*`/g,
    /!\[[^\]]*\]\([^)]*\)/g,
    /\[[^\]]+\]\([^)]*\)/g,
    /\{\{<\s*xana\s+[^>]*>\}\}/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

export function positionInRanges(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

export function lineColumnFor(text, index) {
  const prefix = String(text || "").slice(0, index);
  const lines = prefix.split(/\n/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}
