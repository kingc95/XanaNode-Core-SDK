import { stripMarkdown } from "./markdown.js";
import { buildReviewSuggestions } from "./suggestions.js";

function firstMeaningfulSentence(text = "") {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentenceMatch = cleaned.match(/(.{24,240}?[.!?])(\s|$)/);
  if (sentenceMatch) return sentenceMatch[1].trim();
  return cleaned.slice(0, 220).trim();
}

function firstHeading(text = "") {
  const heading = String(text || "").match(/^\s*#\s+(.+)$/m);
  return heading?.[1]?.trim() || "";
}

function inferTextNodeType(text = "") {
  const cleaned = stripMarkdown(String(text || "")).trim();
  if (!cleaned) return "source";
  if (cleaned.includes("?")) return "question";
  if (/\b(i observed|i saw|we observed|field note|observed that)\b/i.test(cleaned)) return "observation";
  if (/\b(should|must|need to|requires|proves|shows that|argues that)\b/i.test(cleaned)) return "claim";
  if (/\b(protocol|concept|means|is defined as|refers to)\b/i.test(cleaned)) return "concept";
  return "source";
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function analyzeTextIntake(text, options = {}) {
  const body = String(text || "").trim();
  const existingNodes = Array.isArray(options.nodes) ? options.nodes : [];
  const fragments = Array.isArray(options.fragments) ? options.fragments : [];
  const source = {
    id: "__intake_source__",
    protocolId: "__intake_source__",
    title: options.title || "Imported Text",
    type: options.type || "source",
    body,
    data: {}
  };
  const suggestions = body
    ? buildReviewSuggestions([source], fragments, {
      targetNodes: existingNodes,
      includeGeneratedTransclusions: true,
      maxSuggestionsPerNode: options.maxSuggestionsPerNode || 12
    })
    : [];

  const linkSuggestions = suggestions
    .filter((suggestion) => suggestion.kind === "possible_link")
    .map((suggestion) => ({
      target: suggestion.target,
      target_local_id: suggestion.target_local_id,
      target_type: suggestion.target_type,
      phrase: suggestion.phrase,
      confidence: suggestion.confidence,
      reason: suggestion.reason
    }));

  const transclusionSuggestions = suggestions
    .filter((suggestion) => suggestion.kind === "possible_transclusion")
    .map((suggestion) => ({
      target_fragment: suggestion.target_fragment,
      source_node: suggestion.source_node,
      phrase: suggestion.phrase,
      confidence: suggestion.confidence,
      reason: suggestion.reason
    }));

  const mentionRelationships = uniqueBy(linkSuggestions, (item) => item.target).map((item) => ({
    type: "mentions",
    target: item.target,
    summary: `This imported text mentions ${item.phrase}.`,
    confidence: item.confidence
  }));

  const suggestedTitle = options.title || firstHeading(body) || "";
  const suggestedSummary = firstMeaningfulSentence(stripMarkdown(body));
  return {
    source_kind: options.sourceKind || "text",
    suggested_title: suggestedTitle,
    suggested_type: inferTextNodeType(body),
    suggested_summary: suggestedSummary,
    link_suggestions: linkSuggestions,
    transclusion_suggestions: transclusionSuggestions,
    mention_relationships: mentionRelationships
  };
}
