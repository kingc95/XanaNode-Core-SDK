import { stripMarkdown, markdownProtectedRanges, positionInRanges, lineColumnFor } from "./markdown.js";
import { uniqueStrings } from "./ids.js";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phrasePattern(phrase) {
  return new RegExp(`(^|[^A-Za-z0-9_])(${escapeRegExp(phrase)})(?=$|[^A-Za-z0-9_])`, "gi");
}

function allPhraseMatches(text, phrase) {
  return [...String(text || "").matchAll(phrasePattern(phrase))].map((match) => ({
    index: match.index + match[1].length,
    text: match[2]
  }));
}

function existingLinkedTargetIds(markdown, nodeIds) {
  const ids = new Set();
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of String(markdown || "").matchAll(linkPattern)) {
    const href = match[1];
    const maybe = href.split("#")[0].split("/").filter(Boolean).pop()?.replace(/\.[^.]+$/, "");
    if (maybe && nodeIds.has(maybe)) ids.add(maybe);
  }
  return ids;
}

function termListForNode(node) {
  return uniqueStrings([
    node.title,
    node.id,
    node.data?.slug,
    ...(node.data?.aliases || []),
    ...(node.data?.terms || [])
  ]).filter((term) => term.length >= 3);
}

export function buildReviewSuggestions(nodes, fragments = [], options = {}) {
  const suggestions = [];
  const nodeList = Array.isArray(nodes) ? nodes : [...nodes.values()];
  const nodeIds = new Set(nodeList.map((node) => node.id));
  const maxSuggestionsPerNode = options.maxSuggestionsPerNode || 50;
  const termsByTarget = nodeList.map((target) => ({ target, terms: termListForNode(target) })).filter((entry) => entry.terms.length);

  for (const source of nodeList) {
    const markdown = source.body || "";
    const protectedRanges = markdownProtectedRanges(markdown);
    const linkedTargets = existingLinkedTargetIds(markdown, nodeIds);
    let count = 0;

    for (const { target, terms } of termsByTarget) {
      if (source.id === target.id || linkedTargets.has(target.id)) continue;
      for (const term of terms) {
        const matches = allPhraseMatches(markdown, term).filter((match) => !positionInRanges(match.index, protectedRanges));
        if (!matches.length) continue;
        const first = matches[0];
        const pos = lineColumnFor(markdown, first.index);
        suggestions.push({
          kind: "possible_link",
          source: source.protocolId,
          source_local_id: source.id,
          target: target.protocolId,
          target_local_id: target.id,
          target_type: target.type,
          phrase: first.text,
          occurrences: matches.length,
          position: pos,
          confidence: Math.min(0.95, 0.45 + matches.length * 0.1),
          reason: `The phrase "${first.text}" appears in this node and matches ${target.title}.`,
          action: {
            type: "insert_markdown_link",
            replacement: `[${first.text}](${target.id})`
          }
        });
        count += 1;
        break;
      }
      if (count >= maxSuggestionsPerNode) break;
    }
  }

  for (const fragment of fragments) {
    if (!fragment.text || fragment.generated) continue;
    for (const source of nodeList) {
      if (source.protocolId === fragment.source_node) continue;
      const bodyText = stripMarkdown(source.body || "").toLowerCase();
      const fragmentText = String(fragment.text || "").toLowerCase();
      if (fragmentText.length >= 24 && bodyText.includes(fragmentText.slice(0, 80))) {
        suggestions.push({
          kind: "possible_transclusion",
          source: source.protocolId,
          target_fragment: fragment.protocol_id,
          source_node: fragment.source_node,
          confidence: 0.72,
          reason: "This node appears to quote or closely reuse an authored fragment.",
          action: {
            type: "insert_xana_shortcode",
            replacement: `{{< xana ref="${fragment.protocol_id}" >}}`
          }
        });
      }
    }
  }

  return suggestions.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}
