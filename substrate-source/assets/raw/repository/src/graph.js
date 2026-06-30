import { asArray, contentIdFor, omitUndefined, protocolIdFor, relationshipIdFor, slugify } from "./ids.js";

export function normalizeRelationship(raw = {}, context = {}) {
  const namespace = context.namespace || "local";
  const source = raw.source || context.sourceProtocolId || context.sourceId;
  const target = raw.target || raw.to || raw.node || raw.id;
  const type = raw.type || raw.relationship || "related_to";
  const index = context.index || 0;
  const id = raw.id || relationshipIdFor(namespace, source, type, target, index);
  const relationship = {
    id,
    source,
    target,
    type,
    summary: raw.summary || `${source} ${type.replace(/_/g, " ")} ${target}`,
    weight: raw.weight ?? 1,
    visibility: raw.visibility || "secondary",
    confidence: raw.confidence,
    content_id: raw.content_id,
    version_id: raw.version_id,
    signature: raw.signature,
    tumbler: raw.tumbler,
    asserted_by: raw.asserted_by || raw.created_by || context.createdBy,
    asserted_at: raw.asserted_at || raw.created_at,
    valid_from: raw.valid_from,
    valid_to: raw.valid_to,
    evidence: asArray(raw.evidence),
    external: Boolean(raw.external),
    target_substrate: raw.target_substrate
  };
  return omitUndefined(relationship);
}

export function relationshipsFromNode(node, indexOffset = 0) {
  const namespace = node.namespace || "local";
  return asArray(node.data?.relationships)
    .filter((relationship) => {
      if (!relationship || typeof relationship !== "object") return false;
      if (relationship.direction === "incoming") return false;
      if (relationship.direction === "outgoing" && !relationship.target) return false;
      return true;
    })
    .map((relationship, index) => normalizeRelationship(relationship, {
      namespace,
      sourceId: node.id,
      sourceProtocolId: node.protocolId,
      index: index + indexOffset,
      createdBy: node.data?.created_by
    }));
}

export function buildAdjacency(nodes, relationships) {
  const byId = new Map();
  for (const node of nodes) {
    byId.set(node.protocolId || node.protocol_id || node.id, { node, outgoing: [], incoming: [] });
  }
  for (const relationship of relationships) {
    if (byId.has(relationship.source)) byId.get(relationship.source).outgoing.push(relationship);
    if (byId.has(relationship.target)) byId.get(relationship.target).incoming.push(relationship);
  }
  return byId;
}

export function nodeToProtocolRecord(node, relationships = []) {
  const outgoing = relationships.filter((relationship) => relationship.source === node.protocolId);
  const incoming = relationships.filter((relationship) => relationship.target === node.protocolId);
  const trailNodes = asArray(node.data?.nodes).filter(Boolean);
  const trailBranches = asArray(node.data?.branches).filter(Boolean);
  const preservedFields = { ...(node.data || {}) };
  delete preservedFields.id;
  delete preservedFields.protocol_id;
  delete preservedFields.relationships;
  delete preservedFields.title;
  delete preservedFields.type;
  delete preservedFields.summary;
  delete preservedFields.content;
  delete preservedFields.body;
  return omitUndefined({
    ...preservedFields,
    id: node.protocolId,
    protocol_id: node.protocolId,
    content_id: node.content_id,
    version_id: node.version_id,
    signature: node.data?.signature,
    local_id: node.id,
    title: node.title,
    type: node.type,
    facets: asArray(node.data?.facets),
    summary: node.summary,
    content: node.body,
    importance: node.data?.importance || 3,
    trail_nodes: trailNodes.length ? trailNodes : undefined,
    trail_branches: trailBranches.length ? trailBranches : undefined,
    relationships: [
      ...outgoing.map((relationship) => ({ id: relationship.id, type: relationship.type, source: relationship.source, target: relationship.target, direction: "outgoing", external: relationship.external || false, target_substrate: relationship.target_substrate })),
      ...incoming.map((relationship) => ({ id: relationship.id, type: relationship.type, source: relationship.source, target: relationship.target, direction: "incoming", external: relationship.external || false, target_substrate: relationship.target_substrate }))
    ],
    body: node.body,
    source_file: node.relativeFile,
    created_by: node.data?.created_by,
    created_at: node.data?.created_at,
    updated_at: node.data?.updated_at,
    primary_media: node.data?.primary_media,
    media_type: node.data?.media_type,
    file: node.data?.file,
    alt: node.data?.alt,
    caption: node.data?.caption,
    creator: node.data?.creator,
    created_date: node.data?.created_date,
    source_name: node.data?.source_name,
    source_url: node.data?.source_url,
    license: node.data?.license,
    license_url: node.data?.license_url,
    rights_status: node.data?.rights_status,
    confidence: node.data?.confidence,
    aliases: asArray(node.data?.aliases),
    tags: asArray(node.data?.tags),
    tumbler: node.data?.tumbler,
    selector: node.data?.selector,
    outgoing_relationships: outgoing.map((relationship) => relationship.id),
    incoming_relationships: incoming.map((relationship) => relationship.id),
    metadata: node.data?.metadata || undefined
  });
}

export function createRelationshipNodeRecord({
  relationship = {},
  sourceNode = {},
  targetNode = {},
  namespace = "local",
  title,
  summary,
  body = "",
  relativeFile = "",
  relationships,
  evidence,
  confidence,
  status,
  reviewStatus,
  evidenceStrength,
  assertedBy,
  assertedAt,
  reviewedBy,
  importance = 4,
  subtype
} = {}) {
  const source = relationship.source || sourceNode.protocolId || sourceNode.protocol_id || sourceNode.id;
  const target = relationship.target || targetNode.protocolId || targetNode.protocol_id || targetNode.id;
  const relationshipType = relationship.relationship_type || relationship.type || "related_to";
  const sourceTitle = sourceNode.title || sourceNode.name || source || "Source";
  const targetTitle = targetNode.title || targetNode.name || target || "Target";
  const localId = relationship.id || `${source || "source"}-${relationshipType}-${target || "target"}`;
  const nextTitle = title || relationship.title || `${sourceTitle} ${relationshipType.replace(/_/g, " ")} ${targetTitle}`;
  const nextSummary = summary || relationship.summary || `A first-class relationship between ${sourceTitle} and ${targetTitle}.`;
  const hasExplicitRelationships = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "relationships");
  const nextRelationships = hasExplicitRelationships
    ? asArray(relationships)
    : asArray(relationship.relationships).length
      ? asArray(relationship.relationships)
      : [
          omitUndefined({
            type: "related_to",
            target: source,
            summary: `Connect this relationship node back to its source node: ${sourceTitle}.`,
            direction: "outgoing"
          }),
          omitUndefined({
            type: "related_to",
            target: target,
            summary: `Connect this relationship node back to its target node: ${targetTitle}.`,
            direction: "outgoing"
          })
        ];

  return createNodeRecord({
    data: omitUndefined({
      ...relationship,
      id: localId,
      title: nextTitle,
      type: "relationship",
      subtype: subtype || relationship.subtype,
      importance,
      summary: nextSummary,
      source_node: source,
      target_node: target,
      relationship_type: relationshipType,
      relationships: nextRelationships,
      evidence: asArray(evidence ?? relationship.evidence),
      confidence: confidence ?? relationship.confidence,
      status: status ?? relationship.status,
      review_status: reviewStatus ?? relationship.review_status,
      evidence_strength: evidenceStrength ?? relationship.evidence_strength,
      asserted_by: assertedBy ?? relationship.asserted_by,
      asserted_at: assertedAt ?? relationship.asserted_at,
      reviewed_by: reviewedBy ?? relationship.reviewed_by
    }),
    body,
    relativeFile,
    namespace
  });
}

export function relationshipNodeToRelationshipRecord(node, context = {}) {
  const data = node?.data || {};
  const source = data.source_node || context.source || context.sourceNode || node?.source_node;
  const target = data.target_node || context.target || context.targetNode || node?.target_node;
  const relationshipType = data.relationship_type || context.relationshipType || data.subtype || "related_to";
  return omitUndefined({
    id: context.id || data.source_relationship_id || relationshipIdFor(context.namespace || node?.namespace || "local", source, relationshipType, target, context.index || 0),
    source,
    target,
    type: relationshipType,
    summary: context.summary || data.summary || node?.summary || "",
    weight: context.weight ?? data.weight ?? 1,
    visibility: context.visibility ?? data.visibility ?? "secondary",
    confidence: context.confidence ?? data.confidence,
    asserted_by: context.asserted_by ?? data.asserted_by,
    asserted_at: context.asserted_at ?? data.asserted_at,
    evidence: asArray(context.evidence ?? data.evidence),
    review_status: context.review_status ?? data.review_status,
    evidence_strength: context.evidence_strength ?? data.evidence_strength
  });
}

export function createNodeRecord({ data = {}, body = "", relativeFile = "", namespace = "local" }) {
  const id = slugify(data.id || data.slug || data.title || relativeFile.replace(/\.[^.]+$/, ""), "node");
  const type = data.type || "concept";
  const protocolId = protocolIdFor(id, { ...data, type }, namespace);
  const contentId = data.content_id || contentIdFor(`${JSON.stringify(data)}\n${body}`);
  const versionId = data.version_id || contentId;
  return {
    id,
    protocolId,
    protocol_id: protocolId,
    content_id: contentId,
    version_id: versionId,
    namespace,
    type,
    title: data.title || id,
    summary: data.summary || data.description || "",
    data: { ...data, id, type, protocol_id: protocolId },
    body,
    relativeFile
  };
}
