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

export function buildReviewSuggestions(nodes, fragments = [], options = {}) {
  const suggestions = [];
  const nodeList = Array.isArray(nodes) ? nodes : [...nodes.values()];
  const targetNodes = options.targetNodes
    ? (Array.isArray(options.targetNodes) ? options.targetNodes : [...options.targetNodes.values()])
    : nodeList;
  const nodeIds = new Set(targetNodes.map((node) => node.id));
  const maxSuggestionsPerNode = options.maxSuggestionsPerNode || 50;
  const termsByTarget = targetNodes.map((target) => ({ target, terms: termListForNode(target) })).filter((entry) => entry.terms.length);

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
          source: source.protocolId || source.protocol_id || source.id,
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
  const existingTerms = existingProtocolNodes.map((node) => ({
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
