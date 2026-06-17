import path from "node:path";
import { loadManifest, loadMarkdownNodes, writeJson } from "./io.js";
import { buildFragments, findXanaReferences } from "./fragments.js";
import { relationshipsFromNode, normalizeRelationship, nodeToProtocolRecord } from "./graph.js";
import { omitUndefined, relationshipIdFor } from "./ids.js";
import { buildReviewSuggestions } from "./suggestions.js";
import { validateSubstrateArtifacts } from "./validate.js";

export async function buildSubstrate(rootDir, options = {}) {
  const manifest = loadManifest(rootDir, options.manifest || {});
  const namespace = options.namespace || manifest.namespace || "local";
  const nodes = await loadMarkdownNodes(rootDir, { ...options, namespace });

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

  const relationships = [...authoredRelationships, ...fragmentDerivedRelationships, ...transclusionRelationships];
  const protocolNodes = [
    ...nodes.map((node) => nodeToProtocolRecord(node, relationships)),
    ...authoredFragmentNodes
  ];

  const suggestions = options.suggestions === false ? [] : buildReviewSuggestions(nodes, allFragments, options.suggestionOptions || {});
  const substrate = {
    manifest,
    nodes,
    protocolNodes,
    relationships,
    fragments: allFragments,
    suggestions,
    namespace,
    generated_at: new Date().toISOString()
  };

  const validation = validateSubstrateArtifacts(substrate, options);
  return { ...substrate, validation };
}

export async function writeSubstrateArtifacts(rootDir, outDir, options = {}) {
  const substrate = await buildSubstrate(rootDir, options);
  writeJson(path.join(outDir, "substrate.json"), substrate.manifest);
  writeJson(path.join(outDir, "relationships.json"), { relationships: substrate.relationships });
  writeJson(path.join(outDir, "xananode-fragments.json"), { fragments: substrate.fragments });
  writeJson(path.join(outDir, "xananode-suggestions.json"), { suggestions: substrate.suggestions });
  for (const node of substrate.protocolNodes) {
    const safeName = node.id.replace(/^[^:]+:/, "").replace(/[^A-Za-z0-9_.-]+/g, "_");
    writeJson(path.join(outDir, "nodes", `${safeName}.json`), node);
  }
  writeJson(path.join(outDir, "validation.json"), substrate.validation);
  return substrate;
}
