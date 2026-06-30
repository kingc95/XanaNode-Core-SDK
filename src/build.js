import fs from "node:fs";
import path from "node:path";
import { loadJsonNodes, loadJsonRelationships, loadManifest, loadMarkdownNodes, writeJson } from "./io.js";
import { buildFragments, findXanaReferences } from "./fragments.js";
import { relationshipsFromNode, normalizeRelationship, nodeToProtocolRecord } from "./graph.js";
import { omitUndefined, relationshipIdFor } from "./ids.js";
import { deriveKinshipRelationships } from "./kinship.js";
import { applySuggestionActions, buildReviewSuggestions } from "./suggestions.js";
import { validateSubstrateArtifacts } from "./validate.js";

function deriveSubstrateStructures(nodes, namespace, externalRelationships = []) {
  const fragmentGroups = new Map();
  const authoredFragmentNodes = [];
  const allFragments = [];

  for (const node of nodes) {
    const fragments = buildFragments(node.body, node.data, {
      namespace,
      sourceId: node.id,
      sourceProtocolId: node.protocolId,
      sourceContentId: node.content_id,
      sourceVersionId: node.version_id
    });
    fragmentGroups.set(node.protocolId, fragments);
    allFragments.push(...fragments.all);

    for (const fragment of fragments.authored) {
      authoredFragmentNodes.push(omitUndefined({
        id: fragment.protocol_id,
        protocol_id: fragment.protocol_id,
        content_id: fragment.content_id,
        version_id: fragment.version_id,
        local_id: `${node.id}#${fragment.id}`,
        title: fragment.label || `${node.title} fragment ${fragment.id}`,
        type: "fragment",
        summary: fragment.text,
        importance: 3,
        relationships: [],
        source_node: node.protocolId,
        source_content_id: fragment.source_content_id,
        source_version_id: fragment.source_version_id,
        fragment_id: fragment.id,
        tumbler: fragment.tumbler,
        selector: fragment.selector,
        source_url: fragment.source_url,
        rights_status: fragment.rights_status,
        outgoing_relationships: [],
        incoming_relationships: [],
        metadata: { generated: false }
      }));
    }
  }

  const authoredRelationships = [];
  for (const node of nodes) {
    authoredRelationships.push(...relationshipsFromNode(node, authoredRelationships.length));
  }

  const fragmentDerivedRelationships = authoredFragmentNodes.map((fragment, index) => normalizeRelationship({
    id: relationshipIdFor(namespace, fragment.id, "derived_from", fragment.source_node, index),
    source: fragment.id,
    target: fragment.source_node,
    type: "derived_from",
    summary: `${fragment.title} is derived from its source node`,
    weight: 1,
    visibility: "secondary"
  }, { namespace, index }));

  const transclusionRelationships = [];
  for (const node of nodes) {
    const refs = findXanaReferences(node.body);
    refs.forEach((ref, index) => {
      const target = ref.ref.replace(/^xana:\/\//, "");
      transclusionRelationships.push(normalizeRelationship({
        id: relationshipIdFor(namespace, node.protocolId, "transcludes", target, index),
        source: node.protocolId,
        target,
        type: "transcludes",
        summary: `${node.title} transcludes ${target}`,
        weight: 1,
        visibility: "secondary"
      }, { namespace, index }));
    });
  }

  const baseRelationships = [
    ...authoredRelationships,
    ...externalRelationships.map((relationship, index) => normalizeRelationship(relationship, { namespace, index: authoredRelationships.length + index })),
    ...fragmentDerivedRelationships,
    ...transclusionRelationships
  ];
  const baseProtocolNodes = [
    ...nodes.map((node) => nodeToProtocolRecord(node, baseRelationships)),
    ...authoredFragmentNodes
  ];
  const kinshipRelationships = deriveKinshipRelationships(baseProtocolNodes, baseRelationships, namespace);
  const relationships = [
    ...baseRelationships,
    ...kinshipRelationships
  ];
  const protocolNodes = [
    ...nodes.map((node) => nodeToProtocolRecord(node, relationships)),
    ...authoredFragmentNodes
  ];

  return {
    fragmentGroups,
    authoredFragmentNodes,
    allFragments,
    relationships,
    protocolNodes
  };
}

export async function buildSubstrate(rootDir, options = {}) {
  const manifest = loadManifest(rootDir, options.manifest || {});
  const namespace = options.namespace || manifest.namespace || "local";
  const markdownNodes = await loadMarkdownNodes(rootDir, { ...options, namespace });
  const jsonNodes = await loadJsonNodes(rootDir, { ...options, namespace });
  const dedupedNodes = new Map();
  for (const node of [...markdownNodes, ...jsonNodes]) {
    const key = node.protocolId || node.protocol_id || node.id;
    if (!key || dedupedNodes.has(key)) continue;
    dedupedNodes.set(key, node);
  }
  let nodes = [...dedupedNodes.values()];
  const externalRelationships = loadJsonRelationships(rootDir);
  let derived = deriveSubstrateStructures(nodes, namespace, externalRelationships);
  let suggestions = options.suggestions === false ? [] : buildReviewSuggestions(nodes, derived.allFragments, options.suggestionOptions || {});
  let appliedSuggestions = [];

  if ((options.suggestionMode || "review") === "apply" && suggestions.length) {
    const applied = applySuggestionActions(nodes, suggestions, { mode: "apply" });
    nodes = applied.nodes;
    appliedSuggestions = applied.applied;
    derived = deriveSubstrateStructures(nodes, namespace, externalRelationships);
    suggestions = options.suggestions === false ? [] : buildReviewSuggestions(nodes, derived.allFragments, options.suggestionOptions || {});
  }

  const substrate = {
    manifest,
    nodes,
    protocolNodes: derived.protocolNodes,
    relationships: derived.relationships,
    fragments: derived.allFragments,
    suggestions,
    applied_suggestions: appliedSuggestions,
    namespace,
    generated_at: new Date().toISOString()
  };

  const validation = validateSubstrateArtifacts(substrate, options);
  return { ...substrate, validation };
}

function nodeMatchesSelector(node, selector = {}) {
  if (!selector || typeof selector !== "object") return false;
  const tags = Array.isArray(node.tags) ? node.tags : Array.isArray(node.data?.tags) ? node.data.tags : [];
  const subtypes = [
    node.subtype,
    node.data?.subtype,
    ...(Array.isArray(node.subtypes) ? node.subtypes : []),
    ...(Array.isArray(node.data?.subtypes) ? node.data.subtypes : [])
  ].filter(Boolean);
  if (selector.type && selector.type !== node.type && selector.type !== node.data?.type) return false;
  if (selector.subtype && !subtypes.includes(selector.subtype)) return false;
  if (selector.tag && !tags.includes(selector.tag)) return false;
  if (selector.namespace && selector.namespace !== node.namespace && selector.namespace !== String(node.id || "").split(":")[0]) return false;
  if (selector.status && selector.status !== node.status && selector.status !== node.data?.status) return false;
  if (selector.draft !== undefined && Boolean(selector.draft) !== Boolean(node.data?.draft)) return false;
  return true;
}

function sharingDecisionForNode(node, manifest = {}) {
  const manifestSharing = manifest.sharing || {};
  const nodeSharing = node.sharing || node.data?.sharing || {};
  let shareable = manifestSharing.default_shareable !== false;
  let scope = shareable ? "public" : "private";

  for (const rule of Array.isArray(manifestSharing.rules) ? manifestSharing.rules : []) {
    if (!nodeMatchesSelector(node, rule.selector || {})) continue;
    if (typeof rule.shareable === "boolean") shareable = rule.shareable;
    if (rule.scope) scope = rule.scope;
  }

  if (Array.isArray(manifestSharing.excluded_nodes) && manifestSharing.excluded_nodes.includes(node.id)) {
    shareable = false;
    scope = "private";
  }

  if (typeof nodeSharing.shareable === "boolean") shareable = nodeSharing.shareable;
  if (nodeSharing.scope) scope = nodeSharing.scope;

  return { shareable, scope };
}

export function filterSubstrateForSharing(substrate, options = {}) {
  if (options.includePrivate === true) return substrate;

  const manifest = substrate.manifest || {};
  const allowedNodeIds = new Set();
  for (const node of substrate.protocolNodes || []) {
    const decision = sharingDecisionForNode(node, manifest);
    if (decision.shareable !== false && decision.scope !== "private") allowedNodeIds.add(node.id);
  }

  for (const node of substrate.protocolNodes || []) {
    if (node.type !== "fragment") continue;
    if (!node.source_node || allowedNodeIds.has(node.source_node)) continue;
    allowedNodeIds.delete(node.id);
  }

  const protocolNodes = (substrate.protocolNodes || []).filter((node) => allowedNodeIds.has(node.id));
  const relationships = (substrate.relationships || []).filter((relationship) => (
    allowedNodeIds.has(relationship.source) && allowedNodeIds.has(relationship.target)
  ));
  const fragments = (substrate.fragments || []).filter((fragment) => !fragment.source_node || allowedNodeIds.has(fragment.source_node));
  const suggestions = (substrate.suggestions || []).filter((suggestion) => {
    const refs = [
      suggestion.source,
      suggestion.target,
      suggestion.node,
      suggestion.target_fragment,
      suggestion.source_node
    ].filter(Boolean);
    return refs.every((ref) => !String(ref).includes(":") || allowedNodeIds.has(ref));
  });
  const applied_suggestions = (substrate.applied_suggestions || []).filter((suggestion) => {
    const refs = [
      suggestion.source,
      suggestion.target,
      suggestion.node,
      suggestion.target_fragment,
      suggestion.source_node
    ].filter(Boolean);
    return refs.every((ref) => !String(ref).includes(":") || allowedNodeIds.has(ref));
  });

  const filtered = {
    ...substrate,
    protocolNodes,
    relationships,
    fragments,
    suggestions,
    applied_suggestions
  };
  filtered.validation = validateSubstrateArtifacts(filtered, options);
  return filtered;
}

export async function writeSubstrateArtifacts(rootDir, outDir, options = {}) {
  const substrate = filterSubstrateForSharing(await buildSubstrate(rootDir, options), options);
  const splitArtifacts = options.splitArtifacts !== false;
  const bundleJson = options.bundleJson !== false;
  const bundleJsonl = options.bundleJsonl === true;

  if (splitArtifacts) {
    writeJson(path.join(outDir, "substrate.json"), substrate.manifest);
    writeJson(path.join(outDir, "relationships.json"), { relationships: substrate.relationships });
    for (const node of substrate.protocolNodes) {
      const safeName = node.id.replace(/^[^:]+:/, "").replace(/[^A-Za-z0-9_.-]+/g, "_");
      writeJson(path.join(outDir, "nodes", `${safeName}.json`), node);
    }
  }
  writeJson(path.join(outDir, "xananode-fragments.json"), { fragments: substrate.fragments });
  writeJson(path.join(outDir, "xananode-suggestions.json"), { suggestions: substrate.suggestions });
  writeJson(path.join(outDir, "xananode-applied-suggestions.json"), { suggestions: substrate.applied_suggestions || [] });
  writeJson(path.join(outDir, "validation.json"), substrate.validation);
  const bundle = {
    format: "xananode.substrate-bundle@0.1.0",
    generated_at: new Date().toISOString(),
    manifest: substrate.manifest,
    counts: {
      nodes: substrate.protocolNodes.length,
      relationships: substrate.relationships.length,
      fragments: substrate.fragments.length,
      suggestions: substrate.suggestions.length,
      applied_suggestions: substrate.applied_suggestions?.length || 0,
      warnings: substrate.validation?.warnings?.length || 0
    },
    nodes: substrate.protocolNodes,
    relationships: substrate.relationships,
    fragments: substrate.fragments,
    suggestions: substrate.suggestions,
    applied_suggestions: substrate.applied_suggestions || [],
    validation: substrate.validation
  };
  if (bundleJson) {
    writeJson(path.join(outDir, "substrate-bundle.json"), bundle);
  }
  if (bundleJsonl) {
    const lines = [
      JSON.stringify({
        record_type: "bundle_manifest",
        format: bundle.format,
        generated_at: bundle.generated_at,
        manifest: bundle.manifest,
        counts: bundle.counts
      }),
      ...bundle.nodes.map((node) => JSON.stringify({ record_type: "node", node })),
      ...bundle.relationships.map((relationship) => JSON.stringify({ record_type: "relationship", relationship })),
      JSON.stringify({
        record_type: "bundle_fragments",
        fragments: bundle.fragments
      }),
      JSON.stringify({
        record_type: "bundle_suggestions",
        suggestions: bundle.suggestions
      }),
      JSON.stringify({
        record_type: "bundle_applied_suggestions",
        suggestions: bundle.applied_suggestions
      }),
      JSON.stringify({
        record_type: "bundle_report",
        validation: bundle.validation
      })
    ];
    writeJsonl(path.join(outDir, "substrate-bundle.jsonl"), lines);
  }
  return substrate;
}

function writeJsonl(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}
