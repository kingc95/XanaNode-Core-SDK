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
  const types = [
    primaryType,
    ...(Array.isArray(frontMatter.facets) ? frontMatter.facets : [])
  ].filter(Boolean);
  const colorRecords = types
    .map((type) => registry.nodeTypesByType?.[type]?.color || {})
    .filter(Boolean);
  const fills = unique(colorRecords.map((color) => color.bg || color.fill).filter(Boolean));
  const outlines = unique(colorRecords.map((color) => color.outline || color.stroke).filter(Boolean));
  const primaryColor = registry.nodeTypesByType?.[primaryType]?.color || {};
  return {
    type: primaryType || "node",
    fills: fills.length ? fills : [DEFAULT_NODE_COLORS.bg],
    outline: outlines[0] || DEFAULT_NODE_COLORS.outline,
    text: primaryColor.fg || DEFAULT_NODE_COLORS.fg
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

export function projectionEdgePath(edge) {
  const dx = edge.target.x - edge.source.x;
  const dy = edge.target.y - edge.source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const offset = Math.min(42, Math.max(18, distance * 0.08));
  const normalX = (-dy / distance) * offset;
  const normalY = (dx / distance) * offset;
  const midX = (edge.source.x + edge.target.x) / 2 + normalX;
  const midY = (edge.source.y + edge.target.y) / 2 + normalY;
  return `M ${edge.source.x} ${edge.source.y} Q ${midX} ${midY} ${edge.target.x} ${edge.target.y}`;
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
