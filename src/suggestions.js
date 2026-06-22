import { stripMarkdown, markdownProtectedRanges, positionInRanges, lineColumnFor } from "./markdown.js";
import { uniqueStrings } from "./ids.js";
import { createNodeRecord } from "./graph.js";

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
  const data = node.data || {};
  return uniqueStrings([
    node.title,
    node.id,
    node.protocolId,
    node.protocol_id,
    data.slug,
    ...(data.aliases || []),
    ...(data.terms || []),
    ...(node.aliases || []),
    ...(node.terms || [])
  ]).filter((term) => term.length >= 3);
}

function autolinkTargetEnabled(node) {
  const data = node.data || {};
  if (data.autolink === true || node.autolink === true) return true;
  if (data.autolink === false || node.autolink === false) return false;

  const id = protocolIdForNode(node);
  const registryType = String(data.registry_type || node.registry_type || "");
  if (
    node.type === "schema" &&
    (
      id.includes("/node-type-") ||
      id.includes("/relationship-type-") ||
      id.includes("/property-") ||
      id.includes("/canonical-schema-") ||
      registryType.startsWith("node-type") ||
      registryType.startsWith("relationship-type") ||
      registryType.startsWith("property")
    )
  ) {
    return false;
  }

  return true;
}

function suggestionKey(suggestion) {
  return [
    suggestion.source,
    suggestion.position?.index ?? "",
    normalizeComparableText(suggestion.phrase)
  ].join("|");
}

function dedupeLinkSuggestions(suggestions) {
  const seen = new Set();
  const unique = [];
  for (const suggestion of suggestions) {
    const key = suggestionKey(suggestion);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(suggestion);
  }
  return unique;
}

export function buildReviewSuggestions(nodes, fragments = [], options = {}) {
  const suggestions = [];
  const nodeList = Array.isArray(nodes) ? nodes : [...nodes.values()];
  const targetNodes = options.targetNodes
    ? (Array.isArray(options.targetNodes) ? options.targetNodes : [...options.targetNodes.values()])
    : nodeList;
  const nodeIds = new Set(targetNodes.map((node) => node.id));
  const maxSuggestionsPerNode = options.maxSuggestionsPerNode || 50;
  const includeGeneratedTransclusions = options.includeGeneratedTransclusions !== false;
  const termsByTarget = targetNodes
    .filter((target) => autolinkTargetEnabled(target))
    .map((target) => ({ target, terms: termListForNode(target) }))
    .filter((entry) => entry.terms.length);

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
          source: source.protocolId || source.protocol_id || source.id,
          source_local_id: source.id,
          target: target.protocolId || target.protocol_id || target.id,
          target_local_id: target.id,
          target_type: target.type,
          phrase: first.text,
          occurrences: matches.length,
          position: { ...pos, index: first.index },
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
    if (!fragment.text) continue;
    if (fragment.generated && !includeGeneratedTransclusions) continue;
    for (const source of nodeList) {
      if (source.protocolId === fragment.source_node) continue;
      const rawBody = String(source.body || "");
      const bodyText = stripMarkdown(rawBody).toLowerCase();
      const fragmentText = String(fragment.text || "").toLowerCase();
      if (fragmentText.length >= 24 && bodyText.includes(fragmentText.slice(0, 80))) {
        const rawIndex = rawBody.toLowerCase().indexOf(fragmentText);
        suggestions.push({
          kind: "possible_transclusion",
          source: source.protocolId || source.protocol_id || source.id,
          source_local_id: source.id,
          target_fragment: fragment.protocol_id,
          source_node: fragment.source_node,
          phrase: fragment.text,
          position: rawIndex >= 0 ? { ...lineColumnFor(rawBody, rawIndex), index: rawIndex } : undefined,
          confidence: fragment.generated ? 0.58 : 0.72,
          reason: fragment.generated
            ? "This node appears to reuse a repeated fragment that could be transcluded."
            : "This node appears to quote or closely reuse an authored fragment.",
          action: {
            type: "insert_xana_shortcode",
            replacement: `{{< xana ref="${fragment.protocol_id}" >}}`
          }
        });
      }
    }
  }

  return dedupeLinkSuggestions(suggestions).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

function replaceSlice(text, start, end, replacement) {
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

function applyLinkSuggestionToBody(body, suggestion) {
  const source = String(body || "");
  const phrase = String(suggestion.phrase || "");
  const replacement = suggestion.action?.replacement;
  const index = suggestion.position?.index;
  if (!phrase || !replacement || !Number.isInteger(index) || index < 0) {
    return { changed: false, body: source };
  }
  const ranges = markdownProtectedRanges(source);
  if (positionInRanges(index, ranges)) return { changed: false, body: source };
  const existing = source.slice(index, index + phrase.length);
  if (!existing || existing.toLowerCase() !== phrase.toLowerCase()) return { changed: false, body: source };
  return {
    changed: true,
    body: replaceSlice(source, index, index + phrase.length, replacement)
  };
}

function applyTransclusionSuggestionToBody(body, suggestion) {
  const source = String(body || "");
  const phrase = String(suggestion.phrase || "");
  const replacement = suggestion.action?.replacement;
  let index = suggestion.position?.index;
  if (!phrase || !replacement) return { changed: false, body: source };
  if (!Number.isInteger(index) || index < 0) index = source.toLowerCase().indexOf(phrase.toLowerCase());
  if (!Number.isInteger(index) || index < 0) return { changed: false, body: source };
  const ranges = markdownProtectedRanges(source);
  if (positionInRanges(index, ranges)) return { changed: false, body: source };
  const existing = source.slice(index, index + phrase.length);
  if (!existing || existing.toLowerCase() !== phrase.toLowerCase()) return { changed: false, body: source };
  return {
    changed: true,
    body: replaceSlice(source, index, index + phrase.length, replacement)
  };
}

export function applySuggestionActions(nodes = [], suggestions = [], options = {}) {
  const mode = options.mode || "apply";
  if (mode !== "apply") return { nodes: Array.isArray(nodes) ? nodes : [], applied: [], skipped: suggestions };
  const bySource = new Map();
  for (const suggestion of suggestions) {
    if (!suggestion?.source) continue;
    if (!bySource.has(suggestion.source)) bySource.set(suggestion.source, []);
    bySource.get(suggestion.source).push(suggestion);
  }

  const applied = [];
  const skipped = [];
  const nextNodes = (Array.isArray(nodes) ? nodes : []).map((node) => {
    const sourceId = node.protocolId || node.protocol_id || node.id;
    const sourceSuggestions = (bySource.get(sourceId) || [])
      .slice()
      .sort((left, right) => (right.position?.index ?? -1) - (left.position?.index ?? -1));
    if (!sourceSuggestions.length) return node;

    let body = String(node.body || "");
    for (const suggestion of sourceSuggestions) {
      let outcome = { changed: false, body };
      if (suggestion.kind === "possible_link") {
        outcome = applyLinkSuggestionToBody(body, suggestion);
      } else if (suggestion.kind === "possible_transclusion") {
        outcome = applyTransclusionSuggestionToBody(body, suggestion);
      }
      if (outcome.changed) {
        body = outcome.body;
        applied.push({
          ...suggestion,
          applied_at: new Date().toISOString()
        });
      } else {
        skipped.push(suggestion);
      }
    }

    if (body === String(node.body || "")) return node;
    const data = { ...(node.data || {}), summary: node.summary || node.data?.summary || "" };
    const rebuilt = createNodeRecord({
      data,
      body,
      relativeFile: node.relativeFile || "",
      namespace: node.namespace || String(sourceId).split(":")[0] || "local"
    });
    return {
      ...node,
      ...rebuilt,
      fullPath: node.fullPath,
      raw: node.raw
    };
  });

  return { nodes: nextNodes, applied, skipped };
}

function protocolIdForNode(node) {
  return node?.protocolId || node?.protocol_id || node?.id || "";
}

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nodeComparisonTerms(node) {
  return uniqueStrings([
    node.title,
    node.id,
    protocolIdForNode(node).split("/").at(-1),
    ...(node.aliases || []),
    ...(node.data?.aliases || [])
  ]).map(normalizeComparableText).filter(Boolean);
}

function overlapScore(leftTerms, rightTerms) {
  if (!leftTerms.length || !rightTerms.length) return 0;
  let best = 0;
  for (const left of leftTerms) {
    for (const right of rightTerms) {
      if (left === right) best = Math.max(best, 1);
      else if (left.length >= 6 && right.length >= 6 && (left.includes(right) || right.includes(left))) best = Math.max(best, 0.78);
    }
  }
  return best;
}

export function analyzeSubstrateIntake(substrate = {}, incoming = {}, options = {}) {
  const existingNodes = Array.isArray(substrate.nodes) ? substrate.nodes : [];
  const existingProtocolNodes = Array.isArray(substrate.protocolNodes) ? substrate.protocolNodes : existingNodes;
  const existingRelationships = Array.isArray(substrate.relationships) ? substrate.relationships : [];
  const fragments = Array.isArray(substrate.fragments) ? substrate.fragments : [];
  const incomingNodes = Array.isArray(incoming.nodes) ? incoming.nodes : [];
  const incomingRelationships = Array.isArray(incoming.relationships) ? incoming.relationships : [];

  const existingIds = new Set(existingProtocolNodes.map(protocolIdForNode));
  const incomingIds = new Set(incomingNodes.map(protocolIdForNode));
  const allTargetNodes = [...existingNodes, ...incomingNodes];

  const autolinks = buildReviewSuggestions(existingNodes, [], {
    ...options,
    targetNodes: allTargetNodes
  }).filter((suggestion) => suggestion.kind === "possible_link");

  const transclusions = buildReviewSuggestions(existingNodes, fragments, options)
    .filter((suggestion) => suggestion.kind === "possible_transclusion");

  const mergeCandidates = [];
  const existingTerms = existingProtocolNodes
    .filter((node) => !incomingIds.has(protocolIdForNode(node)))
    .map((node) => ({
    node,
    id: protocolIdForNode(node),
    terms: nodeComparisonTerms(node)
  }));
  for (const incomingNode of incomingNodes) {
    const incomingId = protocolIdForNode(incomingNode);
    const incomingTerms = nodeComparisonTerms(incomingNode);
    for (const existing of existingTerms) {
      const score = incomingId && incomingId === existing.id ? 1 : overlapScore(incomingTerms, existing.terms);
      if (score >= (options.mergeCandidateThreshold || 0.78)) {
        mergeCandidates.push({
          kind: score === 1 ? "same_id" : "possible_same_entity",
          existing: existing.id,
          incoming: incomingId,
          existing_title: existing.node.title,
          incoming_title: incomingNode.title,
          confidence: score,
          reason: score === 1
            ? "Incoming node has the same protocol id as an existing node."
            : "Incoming node title or alias closely matches an existing node."
        });
      }
    }
  }

  const relationshipImports = incomingRelationships
    .filter((relationship) => existingIds.has(relationship.source) || existingIds.has(relationship.target))
    .map((relationship) => ({
      kind: "incoming_relationship_touches_existing_node",
      relationship: relationship.id,
      source: relationship.source,
      target: relationship.target,
      type: relationship.type,
      summary: relationship.summary || "",
      touches_source: existingIds.has(relationship.source),
      touches_target: existingIds.has(relationship.target),
      confidence: 0.9,
      reason: "Incoming relationship references at least one node already present in the substrate."
    }));

  const newNodes = incomingNodes
    .filter((node) => !existingIds.has(protocolIdForNode(node)))
    .map((node) => ({
      kind: "new_node",
      node: protocolIdForNode(node),
      title: node.title,
      type: node.type,
      connected_by_incoming_relationships: incomingRelationships.filter((relationship) => relationship.source === protocolIdForNode(node) || relationship.target === protocolIdForNode(node)).length
    }));

  const danglingRelationships = incomingRelationships
    .filter((relationship) => {
      const sourceKnown = existingIds.has(relationship.source) || incomingIds.has(relationship.source);
      const targetKnown = existingIds.has(relationship.target) || incomingIds.has(relationship.target);
      return !sourceKnown || !targetKnown;
    })
    .map((relationship) => ({
      kind: "dangling_incoming_relationship",
      relationship: relationship.id,
      source: relationship.source,
      target: relationship.target,
      type: relationship.type,
      missing_source: !(existingIds.has(relationship.source) || incomingIds.has(relationship.source)),
      missing_target: !(existingIds.has(relationship.target) || incomingIds.has(relationship.target)),
      confidence: 1,
      reason: "Incoming relationship references a node that is not in the current substrate or incoming pack."
    }));

  return {
    autolinks,
    transclusions,
    merge_candidates: mergeCandidates.sort((a, b) => b.confidence - a.confidence),
    relationship_imports: relationshipImports,
    new_nodes: newNodes,
    dangling_relationships: danglingRelationships
  };
}
