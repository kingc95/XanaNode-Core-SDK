const DEFAULT_NODE_COLORS = {
  bg: "rgba(21, 25, 34, 0.96)",
  fg: "#e5edf7",
  outline: "rgba(255, 255, 255, 0.3)"
};

const DEFAULT_RELATIONSHIP_STYLE = {
  color: "rgba(85, 214, 190, 0.72)",
  inverse_color: "rgba(85, 214, 190, 0.72)",
  line_style: "solid",
  inverse_line_style: "dashed"
};

export function createProjectionRegistry({ nodeTypes = [], relationshipTypes = [] } = {}) {
  return {
    nodeTypesByType: Object.fromEntries(nodeTypes.map((definition) => [definition.type, definition])),
    relationshipTypesByType: Object.fromEntries(relationshipTypes.map((definition) => [definition.type, definition]))
  };
}

export function nodeProjectionStyle(node, registry = {}) {
  const frontMatter = node?.frontMatter || node?.data || node || {};
  const primaryType = frontMatter.type || node?.type;
  const subtype = frontMatter.subtype || node?.subtype || "";
  const primaryDefinition = registry.nodeTypesByType?.[primaryType] || {};
  const types = [
    primaryType,
    ...(Array.isArray(frontMatter.facets) ? frontMatter.facets : [])
  ].filter(Boolean);
  const colorRecords = types
    .map((type) => registry.nodeTypesByType?.[type]?.color || {})
    .filter(Boolean);
  const fills = unique(colorRecords.map((color) => color.bg || color.fill).filter(Boolean));
  const outlines = unique(colorRecords.map((color) => color.outline || color.stroke).filter(Boolean));
  const primaryColor = primaryDefinition.color || {};
  const projection = primaryDefinition.projection || {};
  return {
    type: primaryType || "node",
    fills: fills.length ? fills : [DEFAULT_NODE_COLORS.bg],
    outline: outlines[0] || DEFAULT_NODE_COLORS.outline,
    text: primaryColor.fg || DEFAULT_NODE_COLORS.fg,
    projection: {
      icon: projection.icon || primaryType || "node",
      iconLabel: projection.icon_label || fallbackIconLabel(primaryDefinition.label || primaryType || "node"),
      assetPath: projection.asset_path || (primaryType ? `assets/projection/node-types/${primaryType}.svg` : ""),
      subtypeAssetPath: subtype && projection.subtype_asset_path_template
        ? projection.subtype_asset_path_template.replaceAll("{type}", primaryType || "node").replaceAll("{subtype}", subtype)
        : ""
    }
  };
}

export function relationshipProjectionStyle(type, registry = {}) {
  const definition = registry.relationshipTypesByType?.[type] || {};
  const lineStyle = definition.line_style || DEFAULT_RELATIONSHIP_STYLE.line_style;
  return {
    type: type || "related_to",
    color: definition.color || DEFAULT_RELATIONSHIP_STYLE.color,
    inverseColor: definition.inverse_color || DEFAULT_RELATIONSHIP_STYLE.inverse_color,
    lineStyle,
    inverseLineStyle: definition.inverse_line_style || DEFAULT_RELATIONSHIP_STYLE.inverse_line_style,
    dash: lineStyleToDash(lineStyle),
    strokeWidth: lineStyle === "double" ? 3.2 : 2.4
  };
}

export function lineStyleToDash(style = "solid") {
  if (style === "dashed") return "8 6";
  if (style === "dotted") return "2 6";
  if (style === "double") return "12 3 2 3";
  return "";
}

export function buildGraphProjection(nodes = [], relationships = [], options = {}) {
  const current = options.current || nodes[0] || null;
  const registry = options.registry || {};
  const maxNodes = options.maxNodes || 18;
  const maxEdges = options.maxEdges || 40;
  const graphNodes = current && !nodes.some((node) => nodeKey(node) === nodeKey(current))
    ? [current, ...nodes]
    : nodes;
  const byRef = new Map();
  for (const node of graphNodes) {
    for (const ref of nodeRefs(node)) byRef.set(ref, node);
  }

  const currentRef = primaryNodeRef(current);
  const rawEdges = [];
  for (const relationship of relationships) {
    const sourceRef = normalizeNodeRef(relationship.source);
    const targetRef = normalizeNodeRef(relationship.target || relationship.to || relationship.node || relationship.id);
    const source = byRef.get(sourceRef);
    const target = byRef.get(targetRef);
    if (!sourceRef || !targetRef || !source || !target) continue;
    rawEdges.push({ sourceRef, targetRef, source, target, type: relationship.type || "related_to" });
  }

  const visibleRefs = new Set();
  if (currentRef) visibleRefs.add(currentRef);
  for (const edge of rawEdges) {
    if (edge.sourceRef === currentRef) visibleRefs.add(edge.targetRef);
    if (edge.targetRef === currentRef) visibleRefs.add(edge.sourceRef);
  }

  const hasCurrentEdges = rawEdges.some((edge) => edge.sourceRef === currentRef || edge.targetRef === currentRef);
  const useOverviewLayout = !currentRef || !hasCurrentEdges;
  let visibleNodes = [...visibleRefs].map((ref) => byRef.get(ref)).filter(Boolean);
  if (useOverviewLayout) {
    visibleNodes = graphNodes.slice(0, maxNodes);
  } else if (visibleNodes.length < Math.min(graphNodes.length, 8)) {
    const existing = new Set(visibleNodes.map((node) => nodeKey(node)));
    for (const node of graphNodes) {
      if (visibleNodes.length >= 8) break;
      if (!existing.has(nodeKey(node))) visibleNodes.push(node);
    }
  }
  visibleNodes = visibleNodes.slice(0, maxNodes);

  const selectedIndex = Math.max(0, visibleNodes.findIndex((node) => nodeRefs(node).some((ref) => ref === currentRef)));
  const arranged = useOverviewLayout
    ? arrangeOverviewNodes(visibleNodes, selectedIndex, registry)
    : arrangeNeighborhoodNodes(visibleNodes, selectedIndex, registry);

  const arrangedByRef = new Map();
  for (const node of arranged) {
    for (const ref of nodeRefs(node.source)) arrangedByRef.set(ref, node);
  }

  const edges = rawEdges
    .map((edge, index) => {
      const source = arrangedByRef.get(edge.sourceRef);
      const target = arrangedByRef.get(edge.targetRef);
      if (!source || !target || source.key === target.key) return null;
      return {
        key: `${edge.sourceRef}-${edge.type}-${edge.targetRef}-${index}`,
        source,
        target,
        type: edge.type,
        style: relationshipProjectionStyle(edge.type, registry)
      };
    })
    .filter(Boolean)
    .slice(0, maxEdges);

  return { nodes: arranged, edges, hasVisibleEdges: edges.length > 0 };
}

export function relationshipsFromProjectionNodes(nodes = []) {
  const byRef = new Map();
  for (const node of nodes) {
    for (const ref of nodeRefs(node)) byRef.set(ref, node);
  }
  const relationships = [];
  for (const node of nodes) {
    const source = primaryNodeRef(node);
    for (const relationship of nodeRelationships(node)) {
      const target = normalizeNodeRef(relationship.target || relationship.to || relationship.node || relationship.id);
      if (!source || !target || !byRef.has(source) || !byRef.has(target)) continue;
      relationships.push({ ...relationship, source, target, type: relationship.type || "related_to" });
    }
  }
  return relationships;
}

export function projectionEdgePath(edge, options = {}) {
  const dx = edge.target.x - edge.source.x;
  const dy = edge.target.y - edge.source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const offset = Math.min(42, Math.max(18, distance * 0.08));
  const normalX = (-dy / distance) * offset;
  const normalY = (dx / distance) * offset;
  const targetInset = Math.max(0, Number(options.targetInset || 0));
  const sourceInset = Math.max(0, Number(options.sourceInset || 0));
  const ux = dx / distance;
  const uy = dy / distance;
  const sourceX = edge.source.x + ux * sourceInset;
  const sourceY = edge.source.y + uy * sourceInset;
  const targetX = edge.target.x - ux * targetInset;
  const targetY = edge.target.y - uy * targetInset;
  const midX = (sourceX + targetX) / 2 + normalX;
  const midY = (sourceY + targetY) / 2 + normalY;
  return `M ${sourceX} ${sourceY} Q ${midX} ${midY} ${targetX} ${targetY}`;
}

export function projectionEdgeArrowPoints(edge, size = 10, targetInset = 0) {
  const dx = edge.target.x - edge.source.x;
  const dy = edge.target.y - edge.source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / distance;
  const uy = dy / distance;
  const tipInset = Math.max(0, Number(targetInset || 0));
  const tipX = edge.target.x - ux * tipInset;
  const tipY = edge.target.y - uy * tipInset;
  const backtrack = Math.max(14, size * 1.8);
  const baseX = tipX - ux * backtrack;
  const baseY = tipY - uy * backtrack;
  const perpX = -uy;
  const perpY = ux;
  return [
    [tipX, tipY],
    [baseX - perpX * size, baseY - perpY * size],
    [baseX + perpX * size, baseY + perpY * size]
  ];
}

export function projectionNodeHasMedia(node = {}) {
  const data = node.frontMatter || node.data || node;
  return Boolean(
    data.primary_media ||
    data.primary_media_node ||
    data.image ||
    data.icon ||
    data.thumbnail ||
    (data.type === "media" && (data.file || data.url))
  );
}

export function wrapProjectionText(value, options = {}) {
  const text = String(value || "Untitled").trim() || "Untitled";
  const maxChars = Math.max(8, Number(options.maxCharsPerLine || 16));
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if (line.length + 1 + word.length <= maxChars) {
      line = `${line} ${word}`;
      continue;
    }
    lines.push(line);
    line = word;
  }

  if (line) lines.push(line);

  return lines.flatMap((candidate) => {
    if (candidate.length <= maxChars + 4) return [candidate];
    const chunks = [];
    for (let index = 0; index < candidate.length; index += maxChars) {
      chunks.push(candidate.slice(index, index + maxChars));
    }
    return chunks;
  });
}

export function buildHopNeighborhood(nodes = [], edges = [], options = {}) {
  const focusId = options.focusId || "";
  const maxDepth = Math.max(1, Number(options.maxDepth || 1));
  const nodeFilter = typeof options.nodeFilter === "function" ? options.nodeFilter : () => true;
  const edgeFilter = typeof options.edgeFilter === "function" ? options.edgeFilter : () => true;
  const edgeScore = typeof options.edgeScore === "function" ? options.edgeScore : () => 0;
  const depthSettings = options.depthSettings || {
    1: { minWeight: 5, maxSecond: 0, maxThird: 0, maxFourth: 0 },
    2: { minWeight: 4, maxSecond: 8, maxThird: 0, maxFourth: 0 },
    3: { minWeight: 3, maxSecond: 14, maxThird: 8, maxFourth: 0 },
    4: { minWeight: 2, maxSecond: 24, maxThird: 20, maxFourth: 16 }
  };
  const settings = depthSettings[Math.min(4, maxDepth)] || depthSettings[2];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const eligibleEdges = dedupeProjectionEdges(edges)
    .filter((edge) => edgeFilter(edge))
    .map((edge) => ({ ...edge, score: edgeScore(edge) }))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const visibleIds = new Set();
  const distances = {};

  if (focusId && byId.has(focusId)) {
    visibleIds.add(focusId);
    distances[focusId] = 0;
  }

  let frontier = new Set([focusId].filter(Boolean));
  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextFrontier = new Set();
    const budget = depth === 1 ? Infinity : Number(settings[`max${["", "First", "Second", "Third", "Fourth"][depth]}`] || 0);
    let accepted = 0;
    const candidateEdges = depth === 1
      ? eligibleEdges.filter((edge) => edge.source === focusId || edge.target === focusId)
      : eligibleEdges.filter((edge) => Number(edge.weight || 1) >= Number(settings.minWeight || 1));
    for (const edge of candidateEdges) {
      if (depth > 1 && accepted >= budget) break;
      const sourceInFrontier = frontier.has(edge.source);
      const targetInFrontier = frontier.has(edge.target);
      if (!sourceInFrontier && !targetInFrontier) continue;
      const nextId = sourceInFrontier ? edge.target : edge.source;
      const nextNode = byId.get(nextId);
      if (!nextNode || visibleIds.has(nextId) || !nodeFilter(nextNode)) continue;
      visibleIds.add(nextId);
      distances[nextId] = depth;
      nextFrontier.add(nextId);
      accepted++;
    }
    frontier = nextFrontier;
    if (!frontier.size) break;
  }

  const visibleNodes = nodes.filter((node) => visibleIds.has(node.id) && (node.id === focusId || nodeFilter(node)));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = eligibleEdges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    distances
  };
}

export function findProjectionRoute(edges = [], fromId = "", toId = "", options = {}) {
  if (!fromId || !toId || fromId === toId) return null;
  const maxDepth = Math.max(1, Number(options.maxDepth || 6));
  const edgeFilter = typeof options.edgeFilter === "function" ? options.edgeFilter : () => true;
  const adjacency = new Map();
  for (const edge of dedupeProjectionEdges(edges).filter(edgeFilter)) {
    if (!edge.source || !edge.target) continue;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push({ id: edge.target, edge });
    adjacency.get(edge.target).push({ id: edge.source, edge });
  }

  const queue = [{ id: fromId, path: [fromId], edges: [] }];
  const seen = new Set([fromId]);
  while (queue.length) {
    const current = queue.shift();
    if (current.path.length - 1 >= maxDepth) continue;
    for (const next of adjacency.get(current.id) || []) {
      if (seen.has(next.id)) continue;
      const path = [...current.path, next.id];
      const routeEdges = [...current.edges, next.edge];
      if (next.id === toId) return { nodeIds: path, edges: routeEdges };
      seen.add(next.id);
      queue.push({ id: next.id, path, edges: routeEdges });
    }
  }
  return null;
}

export function layoutReadableProjection(visible = {}, options = {}) {
  const width = Number(options.width || 900);
  const height = Number(options.height || 620);
  const focusId = options.focusId || visible.focusId || "";
  const registry = options.registry || {};
  const maxDepth = Number(options.maxDepth || 4);
  const nodes = (visible.nodes || []).map((node) => {
    const distance = visible.distances?.[node.id] || (node.id === focusId ? 0 : maxDepth);
    return {
      ...node,
      style: nodeProjectionStyle(node, registry),
      selected: node.id === focusId,
      distance,
      depth: projectionDepthStyle(distance, node.id === focusId)
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    node.r = node.depth.radius;
    node.labelMax = node.depth.labelMax;
    node.showLabel = node.depth.showLabel;
    node.showType = node.depth.showType;
    node.labelOpacity = node.depth.labelOpacity;
    node.opacity = node.depth.opacity;
    node.strokeOpacity = node.depth.strokeOpacity;
    node.depthScale = node.depth.scale;
    node.hasProjectionMedia = projectionNodeHasMedia(node);
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const focus = byId.get(focusId) || nodes[0] || null;
  if (focus) {
    focus.x = centerX;
    focus.y = centerY;
    focus.r = Number(options.focusRadius || focus.depth?.radius || 62);
  }

  const edges = (visible.edges || [])
    .map((edge, index) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target || source.id === target.id) return null;
      const edgeDepth = Math.max(Number(source.distance || 0), Number(target.distance || 0));
      const edgeDepthStyle = projectionEdgeDepthStyle(edgeDepth);
      return {
        key: `${edge.source}-${edge.type}-${edge.target}-${index}`,
        source,
        target,
        type: edge.type || "related_to",
        label: options.labelForEdge ? options.labelForEdge(edge) : edge.type || "related_to",
        distance: edgeDepth,
        showLabel: edgeDepthStyle.showLabel,
        opacity: edgeDepthStyle.opacity,
        arrowOpacity: edgeDepthStyle.arrowOpacity,
        style: {
          ...relationshipProjectionStyle(edge.type || "related_to", registry),
          strokeWidth: edgeDepthStyle.strokeWidth
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.distance || 0) - Number(a.distance || 0));

  seedProjectionNodes(nodes, edges, width, height, focusId, options);
  relaxProjectionForces(nodes, edges, width, height, options);
  resolveProjectionNodeCollisions(nodes, width, height, {
    ...options,
    padding: Number(options.padding || 118),
    passes: Number(options.passes || 36)
  });

  nodes.sort((a, b) => Number(b.distance || 0) - Number(a.distance || 0));

  return { nodes, edges, distances: visible.distances || {}, focusId };
}

export function fitReadableProjectionViewport(nodes = [], options = {}) {
  if (!nodes.length) return { x: 0, y: 0, scale: 1 };
  const width = Number(options.width || 900);
  const height = Number(options.height || 620);
  const padding = Number(options.padding || 48);
  const maxScale = Number(options.maxScale || 1.9);
  const minScale = Number(options.minScale || 0.26);
  const bounds = nodes.reduce((acc, node) => mergeBounds(acc, projectionNodeBounds(node)), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const graphWidth = Math.max(1, bounds.maxX - bounds.minX);
  const graphHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = clampNumber(Math.min((width - padding * 2) / graphWidth, (height - padding * 2) / graphHeight, maxScale), minScale, maxScale, 1);
  const x = width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
  const y = height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;
  return { x, y, scale };
}

export function resolveProjectionNodeCollisions(nodes = [], width = 900, height = 620, options = {}) {
  const padding = Number(options.padding || 92);
  const passes = Number(options.passes || 24);
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.selected || b.selected) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const minDistance = projectionCollisionRadius(a) + projectionCollisionRadius(b) + padding;
        if (distance >= minDistance) continue;
        const push = (minDistance - distance) / 2;
        const nx = dx / distance;
        const ny = dy / distance;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

export function buildReadableTravelOverlayMarkup(fromNode, toNode, viewport, options = {}) {
  const routeNodes = Array.isArray(options.routeNodes) && options.routeNodes.length >= 2
    ? options.routeNodes
    : [fromNode, toNode].filter(Boolean);
  if (routeNodes.length < 2 || !viewport) return "";
  const lift = Number(options.lift || 0.14);
  const maxLift = Number(options.maxLift || 72);
  const points = routeNodes.map((node) => ({
    x: Number(node.x || 0) * viewport.scale + viewport.x,
    y: Number(node.y || 0) * viewport.scale + viewport.y
  }));
  const segments = [];
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const railHeight = Math.min(maxLift, distance * lift);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 - railHeight;
    const delay = index * 180;
    segments.push(`<path class="graph-travel-rail" d="M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}" fill="none" style="--travel-delay: ${delay}ms"></path>`);
    segments.push(`<circle class="graph-travel-step" cx="${to.x}" cy="${to.y}" r="${index === points.length - 2 ? 7 : 5}" style="--travel-delay: ${delay + 120}ms"></circle>`);
  }
  return `
    <circle class="graph-travel-start" cx="${points[0].x}" cy="${points[0].y}" r="6"></circle>
    ${segments.join("")}
  `;
}

function arrangeNeighborhoodNodes(visibleNodes, selectedIndex, registry) {
  const centerX = 450;
  const centerY = 310;
  const radius = visibleNodes.length > 10 ? 245 : 205;
  return visibleNodes.map((node, index) => {
    const selected = index === selectedIndex;
    const base = projectionNode(node, selected, registry);
    if (selected) return { ...base, x: centerX, y: centerY };
    const orbitIndex = index > selectedIndex ? index - 1 : index;
    const orbitCount = Math.max(1, visibleNodes.length - 1);
    const angle = (Math.PI * 2 * orbitIndex) / orbitCount - Math.PI / 2;
    return {
      ...base,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  });
}

function arrangeOverviewNodes(visibleNodes, selectedIndex, registry) {
  const count = visibleNodes.length;
  const columns = count <= 1 ? 1 : count <= 4 ? 2 : Math.min(4, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / Math.max(1, columns)));
  const gapX = columns > 1 ? 620 / (columns - 1) : 0;
  const gapY = rows > 1 ? 360 / (rows - 1) : 0;
  const startX = columns > 1 ? 140 : 450;
  const startY = rows > 1 ? 150 : 310;
  return visibleNodes.map((node, index) => {
    const column = columns ? index % columns : 0;
    const row = columns ? Math.floor(index / columns) : 0;
    return {
      ...projectionNode(node, index === selectedIndex, registry),
      x: startX + column * gapX,
      y: startY + row * gapY
    };
  });
}

function projectionNode(node, selected, registry) {
  return {
    key: nodeKey(node),
    source: node,
    title: node.title || node.id || "Untitled",
    type: node.type || node.data?.type || node.frontMatter?.type,
    selected,
    style: nodeProjectionStyle(node, registry)
  };
}

function nodeRelationships(node) {
  const candidates = [
    node?.frontMatter?.relationships,
    node?.relationships,
    node?.data?.relationships
  ];
  const relationships = candidates.find(Array.isArray) || [];
  return relationships.map((relationship) => ({
    ...relationship,
    target: relationship.target || relationship.to || relationship.node || relationship.id
  }));
}

function nodeRefs(node) {
  return [
    node?.id,
    node?.protocolId,
    node?.protocol_id,
    node?.slug,
    node?.title,
    node?.relativePath,
    node?.path,
    node?.filePath,
    node?.frontMatter?.id,
    node?.frontMatter?.slug
  ].filter(Boolean).map(normalizeNodeRef);
}

function seedProjectionNodes(nodes, edges, width, height, focusId, options = {}) {
  const centerX = width / 2;
  const centerY = height / 2;
  const countsByDepth = new Map();
  nodes.forEach((node) => {
    const depth = Math.min(4, Math.max(0, Number(node.distance || 0)));
    countsByDepth.set(depth, (countsByDepth.get(depth) || 0) + 1);
  });

  nodes.forEach((node, index) => {
    if (node.id === focusId || node.selected) {
      node.x = centerX;
      node.y = centerY;
      return;
    }
    const depth = Math.min(4, Math.max(1, Number(node.distance || 1)));
    const count = countsByDepth.get(depth) || 1;
    const depthOffset = depth * 0.41;
    const angle = stableAngle(node.id || `${depth}-${index}`) + depthOffset;
    const spread = Math.max(0, count - 8) * (depth === 1 ? 16 : 12);
    const radiusByDepth = options.ringRadii || [0, 340, 600, 880, 1160];
    const radius = (radiusByDepth[depth] || (280 + depth * 240)) + spread;
    node.x = centerX + Math.cos(angle) * radius;
    node.y = centerY + Math.sin(angle) * radius;
  });

  const directEdges = edges.filter((edge) => edge.source.id === focusId || edge.target.id === focusId);
  directEdges.forEach((edge, index) => {
    const node = edge.source.id === focusId ? edge.target : edge.source;
    if (!node || node.selected) return;
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, directEdges.length);
    const radius = 340 + Math.max(0, (countsByDepth.get(1) || 1) - 10) * 14;
    node.x = centerX + Math.cos(angle) * radius;
    node.y = centerY + Math.sin(angle) * radius;
  });
}

function relaxProjectionForces(nodes, edges, width, height, options = {}) {
  const centerX = width / 2;
  const centerY = height / 2;
  const iterations = Number(options.forceIterations || 240);
  const radiusByDepth = options.ringRadii || [0, 360, 640, 940, 1240];
  const velocities = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]));

  for (let tick = 0; tick < iterations; tick++) {
    const alpha = 1 - tick / iterations;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const av = velocities.get(a.id);
        const bv = velocities.get(b.id);
        if (!av || !bv) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (!distance) {
          dx = Math.cos(stableAngle(`${a.id}-${b.id}`));
          dy = Math.sin(stableAngle(`${a.id}-${b.id}`));
          distance = 1;
        }
        const minDistance = projectionCollisionRadius(a) + projectionCollisionRadius(b) + 132;
        const repulsion = Math.min(42, Math.max(0, (minDistance - distance) / minDistance) * 48 * alpha);
        if (repulsion <= 0) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        if (!a.selected) {
          av.x -= nx * repulsion;
          av.y -= ny * repulsion;
        }
        if (!b.selected) {
          bv.x += nx * repulsion;
          bv.y += ny * repulsion;
        }
      }
    }

    edges.forEach((edge) => {
      const source = edge.source;
      const target = edge.target;
      const sv = velocities.get(source.id);
      const tv = velocities.get(target.id);
      if (!sv || !tv) return;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.hypot(dx, dy) || 1;
      const edgeDepth = Math.max(Number(source.distance || 0), Number(target.distance || 0));
      const desired = edgeDepth <= 1 ? 360 : edgeDepth === 2 ? 470 : 620;
      const pull = (distance - desired) * 0.009 * alpha;
      const nx = dx / distance;
      const ny = dy / distance;
      if (!source.selected) {
        sv.x += nx * pull;
        sv.y += ny * pull;
      }
      if (!target.selected) {
        tv.x -= nx * pull;
        tv.y -= ny * pull;
      }
    });

    nodes.forEach((node) => {
      if (node.selected) {
        node.x = centerX;
        node.y = centerY;
        return;
      }
      const depth = Math.min(4, Math.max(1, Number(node.distance || 1)));
      const targetRadius = radiusByDepth[depth] || (300 + depth * 250);
      const velocity = velocities.get(node.id);
      if (!velocity) return;
      const dx = node.x - centerX;
      const dy = node.y - centerY;
      const distance = Math.hypot(dx, dy) || 1;
      const shellPull = (targetRadius - distance) * 0.011 * alpha;
      velocity.x += (dx / distance) * shellPull;
      velocity.y += (dy / distance) * shellPull;
      node.x += velocity.x;
      node.y += velocity.y;
      velocity.x *= 0.72;
      velocity.y *= 0.72;
    });
  }
}

function projectionCollisionRadius(node) {
  const base = Number(node.r || 24);
  if (node.showLabel === false) return base + 8;
  const metrics = projectionLabelMetrics(node);
  const typeWidth = node.showType === false ? 0 : Math.min(132, Math.max(54, String(node.type || "node").length * 6.8 + 22));
  return Math.max(base + 24, metrics.width * 0.68, typeWidth * 0.6);
}

function projectionNodeBounds(node) {
  const radius = Number(node.r || 24);
  const metrics = node.showLabel === false ? { width: 0, height: 0 } : projectionLabelMetrics(node);
  const typeWidth = node.showType === false ? 0 : Math.min(132, Math.max(54, String(node.type || "node").length * 6.8 + 22));
  const labelExternal = node.showLabel !== false;
  const labelWidth = labelExternal ? metrics.width : 0;
  const halfWidth = Math.max(radius, labelWidth / 2, typeWidth / 2);
  const top = radius + (node.showType === false ? 0 : 22) + (node.showLabel === false || !labelExternal ? 0 : metrics.height + 12);
  const bottom = radius + (node.showType === false ? 0 : 20);
  return {
    minX: Number(node.x || 0) - halfWidth,
    minY: Number(node.y || 0) - top,
    maxX: Number(node.x || 0) + halfWidth,
    maxY: Number(node.y || 0) + bottom
  };
}

function fallbackIconLabel(value) {
  return String(value || "node")
    .split(/\s+|_/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "N";
}

function projectionLabelMetrics(node) {
  const distance = Number(node.distance || 0);
  const maxCharsPerLine = node.selected ? 18 : distance <= 1 ? 16 : 14;
  const lines = wrapProjectionText(node.title || node.id || "Untitled", { maxCharsPerLine });
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return {
    lines,
    width: Math.max(72, Math.min(240, longest * 8.8 + 24)),
    height: Math.max(22, lines.length * 14 + 8)
  };
}

function mergeBounds(acc, bounds) {
  acc.minX = Math.min(acc.minX, bounds.minX);
  acc.minY = Math.min(acc.minY, bounds.minY);
  acc.maxX = Math.max(acc.maxX, bounds.maxX);
  acc.maxY = Math.max(acc.maxY, bounds.maxY);
  return acc;
}

function stableAngle(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * Math.PI * 2;
}

function dedupeProjectionEdges(edges = []) {
  const seen = new Set();
  return edges.filter((edge) => {
    const key = [edge.source, edge.target, edge.type || "related_to"].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function projectionDepthStyle(distance, selected = false) {
  if (selected || Number(distance || 0) <= 0) {
    return {
      radius: 62,
      scale: 1,
      opacity: 1,
      strokeOpacity: 1,
      labelOpacity: 1,
      labelMax: 30,
      showLabel: true,
      showType: true
    };
  }

  const depth = Math.min(4, Math.max(1, Number(distance || 1)));
  const styles = {
    1: { radius: 48, scale: 0.96, opacity: 0.98, strokeOpacity: 0.96, labelOpacity: 1, labelMax: 24, showLabel: true, showType: true },
    2: { radius: 34, scale: 0.76, opacity: 0.58, strokeOpacity: 0.54, labelOpacity: 0.62, labelMax: 16, showLabel: true, showType: false },
    3: { radius: 22, scale: 0.52, opacity: 0.28, strokeOpacity: 0.28, labelOpacity: 0.34, labelMax: 0, showLabel: false, showType: false },
    4: { radius: 14, scale: 0.34, opacity: 0.14, strokeOpacity: 0.18, labelOpacity: 0.24, labelMax: 0, showLabel: false, showType: false }
  };
  return styles[depth] || styles[4];
}

function projectionEdgeDepthStyle(distance) {
  const depth = Math.min(4, Math.max(1, Number(distance || 1)));
  const styles = {
    1: { opacity: 0.82, arrowOpacity: 0.95, strokeWidth: 2.8, showLabel: true },
    2: { opacity: 0.42, arrowOpacity: 0.52, strokeWidth: 1.8, showLabel: false },
    3: { opacity: 0.2, arrowOpacity: 0.26, strokeWidth: 1.2, showLabel: false },
    4: { opacity: 0.11, arrowOpacity: 0.16, strokeWidth: 0.9, showLabel: false }
  };
  return styles[depth] || styles[4];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function primaryNodeRef(node) {
  return normalizeNodeRef(node?.protocolId || node?.protocol_id || node?.id || node?.slug || node?.title || "");
}

function nodeKey(node) {
  return node?.id || node?.slug || node?.relativePath || node?.path || node?.filePath || node?.title || "node";
}

function normalizeNodeRef(value) {
  return String(value || "")
    .trim()
    .replace(/^node\//i, "")
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}
