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
