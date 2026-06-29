import {
  buildHopNeighborhood,
  findProjectionRoute,
  layoutReadableProjection
} from "./projection.js";

export const DEFAULT_VIEWER_SEARCH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
  "do", "does", "he", "i", "in", "into", "is", "it", "me", "my", "of", "on", "or", "please",
  "show", "tell", "that", "the", "their", "them", "this", "to", "want",
  "was", "what", "when", "where", "which", "who", "why", "with", "you",
  "your", "about", "find", "search", "trace", "follow", "explain"
]);

export const DEFAULT_VIEWER_RELATIONSHIP_PRIORITY = {
  defines: 10,
  created: 9,
  created_by: 9,
  originated_by: 9,
  coined: 9,
  represented_by: 9,
  used_as_primary_media_for: 9,
  depicts: 9,
  participated_in: 8,
  authored: 8,
  features: 8,
  featured_in: 8,
  presented: 8,
  presented_by: 8,
  proposed: 7,
  demonstrates: 7,
  demonstrated_by: 7,
  explains: 7,
  explained_by: 7,
  context_for: 6,
  documents: 6,
  extends: 6,
  supports: 6,
  supported_by: 6,
  contrasts: 6,
  depends_on: 6,
  exposes: 6,
  anticipates: 6,
  contains: 6,
  includes: 6,
  uses: 5,
  used_by: 5,
  cites: 5,
  related_to: 4,
  related: 3,
  mentions: 1,
  unresolved_media: 1
};

export function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripSearchLeadIn(value) {
  let next = String(value || "").trim();
  const prefixes = [
    /^who\s+is\s+/,
    /^what\s+is\s+/,
    /^what\s+are\s+/,
    /^tell\s+me\s+about\s+/,
    /^show\s+me\s+/,
    /^find\s+/,
    /^search\s+for\s+/,
    /^i\s+want\s+to\s+know\s+about\s+/,
    /^can\s+you\s+find\s+/,
    /^where\s+is\s+/,
    /^why\s+is\s+/,
    /^how\s+does\s+/,
    /^how\s+do\s+/,
    /^give\s+me\s+/,
    /^trace\s+/,
    /^follow\s+/
  ];

  for (const pattern of prefixes) {
    next = next.replace(pattern, "");
  }

  return next.trim();
}

export function tokenizeSearch(value) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function buildSearchPlan(value, options = {}) {
  const stopwords = options.stopwords || DEFAULT_VIEWER_SEARCH_STOPWORDS;
  const raw = String(value || "").trim();
  const normalizedRaw = normalizeSearchText(raw);
  const conversational = stripSearchLeadIn(normalizedRaw);
  const rawTokens = tokenizeSearch(conversational);
  const filteredTokens = rawTokens.filter((token) => !stopwords.has(token));
  const finalTokens = filteredTokens.length ? filteredTokens : rawTokens;
  const normalized = finalTokens.join(" ").trim();

  return {
    raw,
    normalized,
    tokens: finalTokens,
    display: normalized || normalizedRaw || raw
  };
}

export function nodeSubtypeValues(node) {
  if (!node) return [];
  const values = [];
  const push = (value) => {
    if (!value) return;
    const text = String(value).trim();
    if (text && !values.includes(text)) values.push(text);
  };

  push(node.subtype);
  if (Array.isArray(node.subtypes)) node.subtypes.forEach(push);
  if (Array.isArray(node.additional_subtypes)) node.additional_subtypes.forEach(push);
  if (Array.isArray(node.facets)) node.facets.forEach(push);
  return values;
}

export function scoreViewerEdge(edge, allNodes = [], focusId, options = {}) {
  const relationshipPriority = {
    ...DEFAULT_VIEWER_RELATIONSHIP_PRIORITY,
    ...(options.relationshipPriority || {})
  };
  const source = allNodes.find((node) => node.id === edge.source);
  const target = allNodes.find((node) => node.id === edge.target);
  const sourceImportance = Number(source?.importance || 3);
  const targetImportance = Number(target?.importance || 3);
  const weight = Number(edge.weight || 1);
  const typePriority = relationshipPriority[edge.type] || 3;
  const directBonus = edge.source === focusId || edge.target === focusId ? 20 : 0;
  const explicitBonus = edge.origin === "relationship" ? 8 : 0;
  const visibilityBonus = edge.visibility === "primary" ? 5 : edge.visibility === "secondary" ? 2 : 0;
  return directBonus + explicitBonus + visibilityBonus + weight * 10 + typePriority + sourceImportance + targetImportance;
}

function asSetLike(values, fallback = null) {
  if (values instanceof Set) return values;
  if (Array.isArray(values)) return new Set(values);
  return fallback;
}

export function buildVisibleSubgraph(allNodes = [], allEdges = [], options = {}) {
  const {
    focusId = "",
    maxDepth = 1,
    enabledTypes,
    enabledMediaTypes,
    enabledRelationshipTypes,
    enabledSubtypes,
    nodeFilter,
    edgeFilter,
    edgeScore,
    exhaustive = false
  } = options;

  const typeSet = asSetLike(enabledTypes);
  const mediaTypeSet = asSetLike(enabledMediaTypes);
  const relationshipTypeSet = asSetLike(enabledRelationshipTypes);
  const subtypeSet = asSetLike(enabledSubtypes);

  function defaultNodeFilter(node) {
    if (node.id === focusId) return true;
    if (typeSet && !typeSet.has(node.type)) return false;
    const subtypes = nodeSubtypeValues(node);
    if (subtypeSet && subtypes.length && !subtypes.some((value) => subtypeSet.has(value))) return false;
    if (node.type === "media" && mediaTypeSet) {
      return mediaTypeSet.has(node.media_type || "image");
    }
    return true;
  }

  function defaultEdgeFilter(edge) {
    if (!relationshipTypeSet) return true;
    return relationshipTypeSet.has(edge.type || "related_to");
  }

  return buildHopNeighborhood(allNodes, allEdges, {
    focusId,
    maxDepth,
    exhaustive,
    nodeFilter: (node) => defaultNodeFilter(node) && (nodeFilter ? nodeFilter(node) : true),
    edgeFilter: (edge) => defaultEdgeFilter(edge) && (edgeFilter ? edgeFilter(edge) : true),
    edgeScore: edgeScore || ((edge) => scoreViewerEdge(edge, allNodes, focusId))
  });
}

export function buildViewerGraphModel(allNodes = [], allEdges = [], options = {}) {
  const {
    focusId = "",
    maxDepth = 1,
    registry = null,
    width = 900,
    height = 620,
    labelForEdge = null
  } = options;
  const visible = buildVisibleSubgraph(allNodes, allEdges, options);
  const graph = layoutReadableProjection(visible, {
    focusId,
    registry,
    width,
    height,
    maxDepth,
    labelForEdge
  });
  return { visible, graph };
}

export function buildViewerTravelPlan(graphModel, currentId, nextId, options = {}) {
  if (!graphModel || !currentId || !nextId) return null;
  const currentNode = graphModel.nodes?.find((node) => node.id === currentId) || null;
  const nextNode = graphModel.nodes?.find((node) => node.id === nextId) || null;
  const route = findProjectionRoute(graphModel.edges || [], currentId, nextId, {
    maxDepth: options.maxDepth || 4
  });
  const routeNodes = (route?.nodeIds || [])
    .map((id) => graphModel.nodes?.find((node) => node.id === id))
    .filter(Boolean);
  return { currentNode, nextNode, route, routeNodes };
}

export function describeViewerGraphDensity(graph = {}) {
  const edgeCount = Array.isArray(graph.edges) ? graph.edges.length : 0;
  const nodeCount = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  const incidentCounts = new Map();
  for (const edge of graph.edges || []) {
    incidentCounts.set(edge.source?.id, (incidentCounts.get(edge.source?.id) || 0) + 1);
    incidentCounts.set(edge.target?.id, (incidentCounts.get(edge.target?.id) || 0) + 1);
  }
  const maxIncident = Math.max(0, ...incidentCounts.values(), 0);
  const dense = edgeCount >= 120 || nodeCount >= 140 || maxIncident >= 70;
  return {
    mode: dense ? "dense" : "normal",
    edgeCount,
    nodeCount,
    maxIncident,
    incidentCounts
  };
}

export function selectViewerLabeledNodes(graph = {}, options = {}) {
  const dense = options.dense === true;
  const maxDenseLabels = Number(options.maxDenseLabels || 24);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  if (!dense) {
    return new Set(nodes.map((node) => node.id || node.key).filter(Boolean));
  }
  const incidentCounts = describeViewerGraphDensity(graph).incidentCounts;
  const ranked = [...nodes]
    .sort((a, b) => {
      const aSelected = a.selected ? 1 : 0;
      const bSelected = b.selected ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      const aDistance = Number(a.distance || 0);
      const bDistance = Number(b.distance || 0);
      if (aDistance !== bDistance) return aDistance - bDistance;
      const aIncident = incidentCounts.get(a.id) || 0;
      const bIncident = incidentCounts.get(b.id) || 0;
      if (aIncident !== bIncident) return bIncident - aIncident;
      return Number(b.importance || 0) - Number(a.importance || 0);
    });
  const visible = new Set();
  for (const node of ranked) {
    if (node.selected) visible.add(node.id || node.key);
  }
  for (const node of ranked) {
    const id = node.id || node.key;
    if (!id) continue;
    if (Number(node.distance || 0) <= 1 && visible.size < maxDenseLabels) visible.add(id);
    if (visible.size >= maxDenseLabels) break;
  }
  return visible;
}

export function pickNextViewerTourNode(options = {}) {
  const {
    nodes = [],
    focusId = "",
    previousFocusId = "",
    tourRecent = [],
    tourVisited = [],
    tourIndex = 0
  } = options;

  const visibleNodes = nodes.filter((node) => node.id !== focusId);
  const localNodes = visibleNodes.filter((node) => node.distance === 1 || node.distance === 2);
  const basePool = localNodes.length ? localNodes : visibleNodes;
  const recent = new Set(tourRecent || []);
  const visited = tourVisited instanceof Set ? tourVisited : new Set(tourVisited || []);
  const fresh = basePool.filter((node) => !visited.has(node.id) && !recent.has(node.id));
  const notRecent = basePool.filter((node) => !recent.has(node.id) && node.id !== previousFocusId);
  const pool = (fresh.length ? fresh : notRecent.length ? notRecent : basePool)
    .sort((a, b) => {
      const aDistance = a.distance || 3;
      const bDistance = b.distance || 3;
      if (aDistance !== bDistance) return aDistance - bDistance;
      return Number(b.importance || 3) - Number(a.importance || 3);
    });

  if (!pool.length) {
    return { nextId: null, nextIndex: tourIndex };
  }

  const normalizedIndex = tourIndex % pool.length;
  const next = pool[normalizedIndex];
  return {
    nextId: next?.id || null,
    nextIndex: (normalizedIndex + 1) % pool.length
  };
}
