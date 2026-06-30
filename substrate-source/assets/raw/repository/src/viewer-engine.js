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

export const MIN_VIEWER_SEARCH_QUERY_LENGTH = 3;
export const DEFAULT_VIEWER_TOUR_SETTINGS = Object.freeze({
  mode: "narration",
  voice: "",
  rate: 1,
  pitch: 1,
  detail: "title-summary-content",
  timedSeconds: 9
});

export function normalizeViewerTourSettings(value = {}) {
  const next = {
    ...DEFAULT_VIEWER_TOUR_SETTINGS,
    ...(value && typeof value === "object" ? value : {})
  };
  next.mode = next.mode === "timed" ? "timed" : "narration";
  next.voice = String(next.voice || "");
  next.rate = Math.max(0.65, Math.min(1.55, Number(next.rate) || DEFAULT_VIEWER_TOUR_SETTINGS.rate));
  next.pitch = Math.max(0.75, Math.min(1.35, Number(next.pitch) || DEFAULT_VIEWER_TOUR_SETTINGS.pitch));
  next.timedSeconds = Math.max(3, Math.min(120, Number(next.timedSeconds) || DEFAULT_VIEWER_TOUR_SETTINGS.timedSeconds));
  if (!["title-only", "title-summary", "title-summary-content", "full"].includes(next.detail)) {
    next.detail = DEFAULT_VIEWER_TOUR_SETTINGS.detail;
  }
  return next;
}

export function getViewerTimedDwellMs(settings = {}) {
  const resolved = normalizeViewerTourSettings(settings);
  return Math.max(3000, Math.min(120000, resolved.timedSeconds * 1000));
}

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

export function shouldRunViewerSearch(value, minLength = MIN_VIEWER_SEARCH_QUERY_LENGTH) {
  return String(value || "").trim().length >= Math.max(1, Number(minLength) || MIN_VIEWER_SEARCH_QUERY_LENGTH);
}

export function buildViewerSearchState(nodes = [], value = "", options = {}) {
  const raw = String(value || "");
  const trimmed = raw.trim();
  const minLength = Math.max(1, Number(options.minLength) || MIN_VIEWER_SEARCH_QUERY_LENGTH);
  if (!trimmed) {
    return {
      input: raw,
      query: "",
      ready: false,
      pending: false,
      plan: { display: "" },
      results: [],
      error: null,
      meta: ""
    };
  }

  if (!shouldRunViewerSearch(trimmed, minLength)) {
    return {
      input: raw,
      query: "",
      ready: false,
      pending: true,
      plan: { display: trimmed },
      results: [],
      error: null,
      meta: `Keep typing. Search starts after ${minLength} characters.`
    };
  }

  try {
    const next = searchViewerNodes(nodes, trimmed, options);
    return {
      ...next,
      input: raw,
      query: trimmed,
      ready: true,
      pending: false,
      error: null,
      meta: next.results?.length
        ? `${next.results.length} match${next.results.length === 1 ? "" : "es"} for ${next.plan?.display || trimmed}`
        : `No matches for ${next.plan?.display || trimmed}.`
    };
  } catch (error) {
    return {
      input: raw,
      query: trimmed,
      ready: true,
      pending: false,
      plan: { display: trimmed },
      results: [],
      error: error instanceof Error ? error.message : String(error),
      meta: `Search paused: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export function stripViewerHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function trimViewerSearchSource(value, maxLength = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function buildViewerNodeSearchText(node = {}) {
  return normalizeSearchText([
    node.id,
    node.title,
    node.type,
    node.summary,
    trimViewerSearchSource(node.content),
    trimViewerSearchSource(stripViewerHtml(node.html || "")),
    node.url,
    node.youtube_url,
    node.primary_media_node?.youtube_url,
    node.youtube_url ? "youtube video" : "",
    node.primary_media_node?.youtube_url ? "youtube video" : "",
    node.media_type,
    node.creator,
    node.source_name,
    node.rights_status,
    node.caption,
    Array.isArray(node.tags) ? node.tags.join(" ") : "",
    Array.isArray(node.aliases) ? node.aliases.join(" ") : ""
  ].filter(Boolean).join(" "));
}

export function scoreViewerSearchResult(node = {}, haystack = "", normalizedQuery = "", queryTokens = []) {
  let score = 0;
  if (!haystack) return 0;

  const title = normalizeSearchText(node.title || "");
  const id = normalizeSearchText(node.id || "");
  const summary = normalizeSearchText(node.summary || "");

  if (id === normalizedQuery) score += 120;
  if (title === normalizedQuery) score += 100;
  if (title.includes(normalizedQuery)) score += 70;
  if (id.includes(normalizedQuery)) score += 55;
  if (summary.includes(normalizedQuery)) score += 35;
  if (haystack.includes(normalizedQuery)) score += 25;

  queryTokens.forEach((token) => {
    if (title.includes(token)) score += 18;
    if (id.includes(token)) score += 14;
    if (summary.includes(token)) score += 10;
    if (haystack.includes(token)) score += 5;
  });

  const tokenMatches = queryTokens.filter((token) =>
    title.includes(token)
    || id.includes(token)
    || summary.includes(token)
    || haystack.includes(token)
  ).length;

  if (queryTokens.length) {
    const coverage = tokenMatches / queryTokens.length;
    score += coverage * 40;
    if (queryTokens.length >= 3 && coverage < 0.34) score -= 18;
    if (queryTokens.length >= 5 && coverage < 0.2) score -= 30;
  }

  score += Number(node.importance || 0);
  return score;
}

export function makeViewerSearchSnippet(node = {}, queryTokens = []) {
  const source = stripViewerHtml(node.summary || node.content || node.html || "");
  const text = source.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const lower = text.toLowerCase();
  const firstMatch = queryTokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) {
    return text.length > 140 ? `${text.slice(0, 140)}...` : text;
  }

  const start = Math.max(0, firstMatch - 50);
  const end = Math.min(text.length, firstMatch + 90);
  const snippet = text.slice(start, end).trim();
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${snippet}${suffix}`;
}

export function searchViewerNodes(nodes = [], query = "", options = {}) {
  const searchPlan = buildSearchPlan(query, options);
  if (!searchPlan.display) {
    return { plan: searchPlan, results: [] };
  }

  const normalizedQuery = searchPlan.display;
  const queryTokens = searchPlan.tokens;
  const limit = Math.max(1, Number(options.limit || 30));

  const results = nodes
    .map((node) => {
      const haystack = buildViewerNodeSearchText(node);
      const score = scoreViewerSearchResult(node, haystack, normalizedQuery, queryTokens);
      return {
        node,
        score,
        snippet: makeViewerSearchSnippet(node, queryTokens)
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aImportance = Number(a.node.importance || 0);
      const bImportance = Number(b.node.importance || 0);
      if (bImportance !== aImportance) return bImportance - aImportance;
      return String(a.node.title || "").localeCompare(String(b.node.title || ""));
    })
    .slice(0, limit);

  return { plan: searchPlan, results };
}

export function resolveViewerNodeSelection(query, allNodes = []) {
  const raw = String(query || "").trim();
  if (!raw) return null;

  const rawLower = raw.toLowerCase();
  const normalized = normalizeSearchText(raw);
  return allNodes.find((node) => {
    if (!node) return false;
    const id = String(node.id || "").toLowerCase();
    const titleNormalized = normalizeSearchText(node.title || "");
    return id === rawLower
      || titleNormalized === normalized
      || normalizeSearchText(node.id || "") === normalized;
  }) || null;
}

function normalizeViewerRef(value, normalizeId) {
  if (!value) return "";
  return typeof normalizeId === "function"
    ? String(normalizeId(value) || "").trim()
    : String(value || "").trim();
}

function makeViewerIdPredicate(nodeIds, normalizeId) {
  if (nodeIds instanceof Set) {
    return (value) => nodeIds.has(normalizeViewerRef(value, normalizeId));
  }
  if (Array.isArray(nodeIds)) {
    const asSet = new Set(nodeIds.map((value) => normalizeViewerRef(value, normalizeId)).filter(Boolean));
    return (value) => asSet.has(normalizeViewerRef(value, normalizeId));
  }
  return () => true;
}

function uniqueViewerIds(values = [], normalizeId) {
  const ids = [];
  values.forEach((value) => {
    const id = normalizeViewerRef(value, normalizeId);
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

export function getViewerTrailNodeIds(node = {}, options = {}) {
  const normalizeId = options.normalizeId;
  const hasAllowedId = makeViewerIdPredicate(options.nodeIds, normalizeId);
  const allEdges = Array.isArray(options.allEdges) ? options.allEdges : [];
  const directValues = Array.isArray(node.nodes)
    ? node.nodes
    : Array.isArray(node.trail_nodes)
      ? node.trail_nodes
      : [];
  const explicitIds = uniqueViewerIds(directValues, normalizeId).filter((id) => hasAllowedId(id));
  if (explicitIds.length) return explicitIds;

  const nodeId = normalizeViewerRef(node.id, normalizeId);
  if (!nodeId) return [];

  const outgoingTrailEdges = allEdges.filter((edge) => {
    const sourceId = normalizeViewerRef(edge?.source, normalizeId);
    const targetId = normalizeViewerRef(edge?.target, normalizeId);
    return sourceId === nodeId
      && targetId
      && hasAllowedId(targetId)
      && (edge?.origin === "trail" || edge?.type === "starts_with" || edge?.type === "continues_to");
  });

  const directTargets = uniqueViewerIds(outgoingTrailEdges.map((edge) => edge.target), normalizeId);
  const leadEdge = outgoingTrailEdges.find((edge) => edge?.type === "starts_with")
    || outgoingTrailEdges.find((edge) => edge?.type === "continues_to")
    || null;
  const leadId = normalizeViewerRef(leadEdge?.target, normalizeId);
  if (!leadId) return directTargets;

  const sequence = [];
  const seen = new Set();
  let currentId = leadId;
  while (currentId && !seen.has(currentId) && hasAllowedId(currentId)) {
    sequence.push(currentId);
    seen.add(currentId);
    const nextEdge = allEdges.find((edge) => {
      const sourceId = normalizeViewerRef(edge?.source, normalizeId);
      const targetId = normalizeViewerRef(edge?.target, normalizeId);
      return sourceId === currentId
        && targetId
        && hasAllowedId(targetId)
        && edge?.type === "continues_to";
    });
    currentId = normalizeViewerRef(nextEdge?.target, normalizeId);
  }

  return sequence.length ? sequence : directTargets;
}

export function getViewerTrailBranches(node = {}, options = {}) {
  const normalizeId = options.normalizeId;
  const hasAllowedId = makeViewerIdPredicate(options.nodeIds, normalizeId);
  const branches = Array.isArray(node.trail_branches)
    ? node.trail_branches
    : Array.isArray(node.branches)
      ? node.branches
      : [];
  if (!Array.isArray(branches)) return [];

  return branches
    .map((branch) => ({
      after: normalizeViewerRef(branch?.after, normalizeId),
      prompt: String(branch?.prompt || "Choose the next path"),
      choices: Array.isArray(branch?.choices)
        ? branch.choices
          .map((choice) => ({
            label: String(choice?.label || "Continue"),
            summary: String(choice?.summary || ""),
            nodes: uniqueViewerIds(choice?.nodes || [], normalizeId).filter((id) => hasAllowedId(id))
          }))
          .filter((choice) => choice.nodes.length)
        : []
    }))
    .filter((branch) => branch.after && branch.choices.length);
}

export function getViewerTrailPlaylistNodeIds(node = {}, options = {}) {
  const ids = [];
  const push = (value) => {
    const id = normalizeViewerRef(value, options.normalizeId);
    if (id && !ids.includes(id)) ids.push(id);
  };

  getViewerTrailNodeIds(node, options).forEach(push);
  getViewerTrailBranches(node, options).forEach((branch) => {
    branch.choices.forEach((choice) => choice.nodes.forEach(push));
  });

  return ids;
}

export function findViewerTrailContext(node = {}, allNodes = [], options = {}) {
  if (!node) return null;
  if (node.type === "trail") return node;
  const nodeId = normalizeViewerRef(node.id, options.normalizeId);
  if (!nodeId) return null;
  return allNodes.find((candidate) => {
    if (!candidate || candidate.type !== "trail") return false;
    return getViewerTrailPlaylistNodeIds(candidate, options).includes(nodeId);
  }) || null;
}

export function buildViewerTrailPlaybackState(trailNode = {}, options = {}) {
  const nodes = getViewerTrailNodeIds(trailNode, options);
  if (!nodes.length) return null;
  return {
    trailId: normalizeViewerRef(trailNode.id, options.normalizeId),
    nodes,
    index: Math.max(0, Number(options.startIndex || 0)),
    branches: getViewerTrailBranches(trailNode, options),
    branchChoices: { ...(options.branchChoices || {}) },
    playback: Boolean(options.playback)
  };
}

export function buildViewerActiveTrail(node = {}, options = {}) {
  return buildViewerTrailPlaybackState(node, options);
}

export function createViewerTourSession(options = {}) {
  const focusId = normalizeViewerRef(options.focusId, options.normalizeId);
  return {
    tourIndex: 0,
    previousFocusId: "",
    tourVisited: focusId ? [focusId] : [],
    tourRecent: focusId ? [focusId] : [],
    activeTrail: options.trailNode
      ? buildViewerActiveTrail(options.trailNode, options.trailOptions || {})
      : null
  };
}

export function pickNextViewerTrailNode(activeTrail = {}, focusId = "", options = {}) {
  if (!activeTrail?.nodes?.length) {
    return { nextId: null, trail: activeTrail, branch: null, done: true };
  }

  const normalizedFocusId = normalizeViewerRef(focusId, options.normalizeId);
  const branch = activeTrail.branches?.find((candidate) => {
    return candidate.after === normalizedFocusId && !activeTrail.branchChoices?.[candidate.after];
  }) || null;
  if (branch) {
    return { nextId: null, trail: activeTrail, branch, done: false };
  }

  const currentIndex = activeTrail.nodes.indexOf(normalizedFocusId);
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : Number(activeTrail.index || 0);
  const nextId = activeTrail.nodes[nextIndex] || null;
  return {
    nextId,
    trail: {
      ...activeTrail,
      index: nextIndex + 1
    },
    branch: null,
    done: !nextId
  };
}

export function applyViewerTrailBranchChoice(activeTrail = {}, afterId = "", choice = {}, options = {}) {
  return {
    ...activeTrail,
    nodes: uniqueViewerIds(choice?.nodes || [], options.normalizeId),
    index: 0,
    branchChoices: {
      ...(activeTrail.branchChoices || {}),
      [normalizeViewerRef(afterId, options.normalizeId)]: String(choice?.label || "Continue")
    }
  };
}

export function rememberViewerTourVisit(nodeId = "", options = {}) {
  const normalized = normalizeViewerRef(nodeId, options.normalizeId);
  const recentLimit = Math.max(1, Number(options.recentLimit) || 7);
  const resetFloor = Math.max(1, Number(options.resetFloor) || 8);
  const resetRatio = Math.max(0.1, Math.min(1, Number(options.resetRatio) || 0.7));
  const visibleCount = Math.max(0, Number(options.visibleCount) || 0);
  const visited = uniqueViewerIds(options.tourVisited || [], options.normalizeId);
  const recent = uniqueViewerIds(options.tourRecent || [], options.normalizeId);

  if (normalized && !visited.includes(normalized)) visited.push(normalized);
  const nextRecent = normalized
    ? [...recent.filter((entry) => entry !== normalized), normalized].slice(-recentLimit)
    : recent.slice(-recentLimit);

  let nextVisited = visited;
  if (visibleCount > 0 && nextVisited.length > Math.max(resetFloor, Math.floor(visibleCount * resetRatio))) {
    nextVisited = [...nextRecent];
  }

  return {
    tourVisited: nextVisited,
    tourRecent: nextRecent
  };
}

export function getViewerTrailLeadId(node = {}, options = {}) {
  const trailNodes = getViewerTrailNodeIds(node, options);
  if (node?.type === "trail" && trailNodes.length) return trailNodes[0];
  const normalizeId = options.normalizeId;
  const nodeId = normalizeViewerRef(node?.id, normalizeId);
  if (!nodeId) return "";
  const leadEdge = (options.allEdges || []).find((edge) => {
    const sourceId = normalizeViewerRef(edge?.source, normalizeId);
    return sourceId === nodeId && (edge?.type === "starts_with" || edge?.type === "continues_to");
  });
  return normalizeViewerRef(leadEdge?.target, normalizeId);
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

export function advanceViewerPlaybackState(options = {}) {
  const {
    tourActive = false,
    activeTrail = null,
    focusId = "",
    previousFocusId = "",
    tourRecent = [],
    tourVisited = [],
    tourIndex = 0,
    nodes = []
  } = options;

  if (activeTrail?.nodes?.length) {
    const choice = pickNextViewerTrailNode(activeTrail, focusId, options);
    if (choice.branch) {
      return {
        kind: "branch",
        nextId: null,
        nextIndex: tourIndex,
        activeTrail: choice.trail,
        branch: choice.branch,
        stopTour: false,
        stopTrail: false
      };
    }
    if (!choice.nextId) {
      return {
        kind: tourActive ? "stop-tour" : "stop-trail",
        nextId: null,
        nextIndex: tourIndex,
        activeTrail: choice.trail,
        branch: null,
        stopTour: tourActive,
        stopTrail: !tourActive
      };
    }
    return {
      kind: "node",
      nextId: choice.nextId,
      nextIndex: tourIndex,
      activeTrail: choice.trail,
      branch: null,
      stopTour: false,
      stopTrail: false
    };
  }

  const choice = pickNextViewerTourNode({
    ...options,
    nodes,
    focusId,
    previousFocusId,
    tourRecent,
    tourVisited,
    tourIndex
  });
  if (!choice.nextId) {
    return {
      kind: "stop-tour",
      nextId: null,
      nextIndex: tourIndex,
      activeTrail,
      branch: null,
      stopTour: true,
      stopTrail: false
    };
  }

  return {
    kind: "node",
    nextId: choice.nextId,
    nextIndex: choice.nextIndex,
    activeTrail,
    branch: null,
    stopTour: false,
    stopTrail: false
  };
}

function buildViewerPathGraph(allEdges = [], allowReverse = true) {
  const adjacency = new Map();
  const addEdge = (fromId, toId, edge, reversed) => {
    if (!adjacency.has(fromId)) adjacency.set(fromId, []);
    adjacency.get(fromId).push({ toId, edge, reversed });
  };

  allEdges.forEach((edge, index) => {
    const normalizedEdge = { ...edge, _edgeIndex: index };
    addEdge(normalizedEdge.source, normalizedEdge.target, normalizedEdge, false);
    if (allowReverse) addEdge(normalizedEdge.target, normalizedEdge.source, normalizedEdge, true);
  });

  return adjacency;
}

function viewerRelationshipStoryPriority(type) {
  const priorities = {
    defines: 10,
    has_claim: 10,
    supports: 9,
    evidence_for: 9,
    derived_from: 9,
    authored: 8,
    created: 8,
    influenced: 8,
    implements: 8,
    enables: 8,
    contains: 8,
    uses: 7,
    explains: 7,
    documents: 7,
    context_for: 6,
    continues_to: 6,
    related_to: 2,
    mentions: 1
  };
  return priorities[type] || 4;
}

export function scoreViewerConnectivePath(path = {}) {
  const hopCount = path.hops?.length || 1;
  const edgeScore = (path.hops || []).reduce((sum, hop) => {
    const edge = hop.edge || {};
    const weight = Number(edge.weight || 1);
    const visibility = edge.visibility === "primary" ? 8 : edge.visibility === "secondary" ? 4 : 0;
    const directionPenalty = hop.reversed ? -1 : 0;
    return sum + weight * 6 + visibility + viewerRelationshipStoryPriority(edge.type) + directionPenalty;
  }, 0);
  return edgeScore - hopCount * 5;
}

export function findViewerConnectivePaths(allEdges = [], sourceId = "", targetId = "", options = {}) {
  const allowReverse = options.allowReverse !== false;
  const maxDepth = Number(options.maxDepth || 6);
  const maxPaths = Number(options.maxPaths || 6);
  const searchLimit = Math.max(maxPaths * 12, 48);
  const adjacency = buildViewerPathGraph(allEdges, allowReverse);
  const results = [];
  const visited = new Set([sourceId]);
  const path = [];
  const pathNodeIds = [sourceId];

  const dfs = (currentId, depth) => {
    if (results.length >= searchLimit) return;
    if (depth > maxDepth) return;

    if (currentId === targetId) {
      results.push({
        nodes: [...pathNodeIds],
        hops: path.map((step) => ({ ...step }))
      });
      return;
    }

    const neighbors = adjacency.get(currentId) || [];
    for (const step of neighbors) {
      if (visited.has(step.toId)) continue;
      visited.add(step.toId);
      path.push({
        fromId: currentId,
        toId: step.toId,
        edge: step.edge,
        reversed: step.reversed
      });
      pathNodeIds.push(step.toId);
      dfs(step.toId, depth + 1);
      pathNodeIds.pop();
      path.pop();
      visited.delete(step.toId);
      if (results.length >= searchLimit) return;
    }
  };

  dfs(sourceId, 0);

  return results
    .sort((a, b) => {
      const scoreDiff = scoreViewerConnectivePath(b) - scoreViewerConnectivePath(a);
      if (scoreDiff) return scoreDiff;
      if (a.hops.length !== b.hops.length) return a.hops.length - b.hops.length;
      return a.nodes.join(" ").localeCompare(b.nodes.join(" "));
    })
    .slice(0, maxPaths);
}

export function viewerRelationshipPhrase(type, reversed = false) {
  const forwardPhrases = {
    supports: "supports",
    contradicts: "contradicts",
    explains: "explains",
    defines: "defines",
    has_claim: "has claim",
    claim_of: "is a claim of",
    demonstrates: "demonstrates",
    derives_from: "derives from",
    derived_from: "derives from",
    cites: "cites",
    quotes: "quotes",
    mentions: "mentions",
    references: "references",
    documents: "documents",
    authored: "authored",
    authored_by: "was authored by",
    created: "created",
    created_by: "was created by",
    participated_in: "participated in",
    spoke_at: "spoke at",
    features: "features",
    presented: "presented",
    introduced: "introduced",
    proposed: "proposed",
    influenced: "influenced",
    influenced_by: "was influenced by",
    popularized: "popularized",
    anticipated: "anticipated",
    anticipates: "anticipates",
    shaped: "shaped",
    shapes: "shapes",
    implements: "implements",
    implemented_by: "is implemented by",
    enables: "enables",
    preserves: "preserves",
    transcludes: "transcludes",
    deep_links_to: "deep-links to",
    has_primary_media: "has primary media",
    used_as_primary_media_for: "is used as primary media for",
    context_for: "gives context for",
    has_context: "has context from",
    continues_to: "continues to",
    continued_from: "continues from",
    starts_with: "starts with",
    started_by: "is started by",
    example_of: "is an example of",
    part_of: "is part of",
    contains: "contains",
    uses: "uses",
    used_by: "is used by",
    related_to: "relates to"
  };

  if (!reversed) return forwardPhrases[type] || String(type || "relates_to").replace(/_/g, " ");
  const reversePhrases = {
    supports: "is supported by",
    contradicts: "is contradicted by",
    explains: "is explained by",
    defines: "is defined by",
    demonstrates: "is demonstrated by",
    cites: "is cited by",
    quotes: "is quoted by",
    mentions: "is mentioned by",
    references: "is referenced by",
    documents: "is documented by",
    features: "is featured in",
    presented: "was presented by",
    proposed: "was proposed by",
    introduced: "was introduced by",
    popularized: "was popularized by",
    enables: "is enabled by",
    preserves: "is preserved by",
    transcludes: "is transcluded by",
    deep_links_to: "is deep-linked by",
    continues_to: "was continued from",
    starts_with: "is started by",
    contains: "is contained by",
    uses: "is used by",
    related_to: "relates to"
  };
  return reversePhrases[type] || `is ${String(type || "related_to").replace(/_/g, " ")} by`;
}

export function buildViewerPathStory(path = {}, nodeById = new Map()) {
  const parts = (path.hops || []).map((hop, index) => {
    const fromNode = nodeById.get(hop.fromId);
    const toNode = nodeById.get(hop.toId);
    const fromTitle = String(fromNode?.title || hop.fromId || "").trim();
    const toTitle = String(toNode?.title || hop.toId || "").trim();
    const phrase = viewerRelationshipPhrase(hop.edge?.type || "related_to", hop.reversed);
    const lead = index === 0 ? "" : "Then ";
    return `${lead}${fromTitle} ${phrase} ${toTitle}`;
  });
  return parts.length ? `${parts.join(". ")}.` : "";
}
