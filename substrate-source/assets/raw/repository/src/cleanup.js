import { asArray } from "./ids.js";

export function prepareNodeRemoval(nodes = [], targetRef) {
  const target = findNodeByRef(nodes, targetRef);
  if (!target) {
    throw new Error(`Node not found for removal: ${String(targetRef || "").trim() || "unknown node"}`);
  }

  const targetRefs = collectNodeRefs(target);
  const affectedNodes = [];
  const removedRelationships = [];
  const touchedTrailNodes = [];

  for (const node of nodes) {
    if (sameNode(node, targetRefs)) continue;

    const relationships = getNodeRelationships(node);
    const keptRelationships = [];
    const removedFromNode = [];
    for (const relationship of relationships) {
      if (matchesRef(relationship?.target, targetRefs) || matchesRef(relationship?.source, targetRefs)) {
        removedFromNode.push(relationshipSummary(node, relationship));
        removedRelationships.push(relationshipSummary(node, relationship));
      } else {
        keptRelationships.push(relationship);
      }
    }

    const trailNodes = asArray(node?.data?.nodes);
    const nextTrailNodes = trailNodes.filter((value) => !matchesRef(value, targetRefs));
    const removedTrailRefs = trailNodes.filter((value) => matchesRef(value, targetRefs));

    const branches = asArray(node?.data?.branches);
    const branchResult = pruneBranchReferences(branches, targetRefs);

    if (!removedFromNode.length && !removedTrailRefs.length && !branchResult.removed.length) continue;

    const nextData = {
      ...node.data,
      relationships: keptRelationships
    };
    if (node.type === "trail" || trailNodes.length) nextData.nodes = nextTrailNodes;
    if (branches.length || branchResult.branches.length) nextData.branches = branchResult.branches;

    if (removedTrailRefs.length || branchResult.removed.length) {
      touchedTrailNodes.push({
        node: summarizeNode(node),
        removed_sequence_refs: removedTrailRefs,
        removed_branch_refs: branchResult.removed
      });
    }

    affectedNodes.push({
      node: summarizeNode(node),
      nextData,
      removed_relationships: removedFromNode,
      removed_sequence_refs: removedTrailRefs,
      removed_branch_refs: branchResult.removed
    });
  }

  const isolatedNodes = findIsolatedNodes(nodes, target, affectedNodes);

  return {
    target: summarizeNode(target),
    target_refs: [...targetRefs],
    affected_nodes: affectedNodes,
    removed_relationships: removedRelationships,
    touched_trails: touchedTrailNodes,
    isolated_nodes: isolatedNodes,
    warnings: buildRemovalWarnings({
      target,
      removedRelationships,
      touchedTrailNodes,
      isolatedNodes
    })
  };
}

function buildRemovalWarnings({ target, removedRelationships, touchedTrailNodes, isolatedNodes }) {
  const warnings = [];
  if (removedRelationships.length) {
    warnings.push(`Removing ${target.title || target.id} will also remove ${removedRelationships.length} relationship${removedRelationships.length === 1 ? "" : "s"}.`);
  }
  if (touchedTrailNodes.length) {
    warnings.push(`Trail ordering will change in ${touchedTrailNodes.length} trail node${touchedTrailNodes.length === 1 ? "" : "s"}.`);
  }
  if (isolatedNodes.length) {
    warnings.push(`${isolatedNodes.length} remaining node${isolatedNodes.length === 1 ? "" : "s"} will be left isolated unless you reconnect them.`);
  }
  return warnings;
}

function findIsolatedNodes(nodes, targetNode, affectedNodes) {
  const targetRefs = collectNodeRefs(targetNode);
  const affectedByProtocol = new Map(affectedNodes.map((entry) => [entry.node.protocol_id || entry.node.id, entry]));
  const survivors = nodes.filter((node) => !sameNode(node, targetRefs));
  const survivorRefs = new Set(survivors.flatMap((node) => [...collectNodeRefs(node)]));
  const adjacency = new Map();

  for (const node of survivors) {
    const nodeId = node.protocolId || node.protocol_id || node.id;
    adjacency.set(nodeId, { outgoing: 0, incoming: 0, trail: 0 });
  }

  for (const node of survivors) {
    const nodeId = node.protocolId || node.protocol_id || node.id;
    const affected = affectedByProtocol.get(nodeId);
    const relationships = affected?.nextData?.relationships ?? getNodeRelationships(node);
    for (const relationship of relationships) {
      if (!survivorRefs.has(normalizeRef(relationship?.target))) continue;
      adjacency.get(nodeId).outgoing += 1;
      const targetNodeId = findProtocolIdForRef(survivors, relationship?.target);
      if (targetNodeId && adjacency.has(targetNodeId)) adjacency.get(targetNodeId).incoming += 1;
    }
    const trailNodes = asArray(affected?.nextData?.nodes ?? node?.data?.nodes);
    if (trailNodes.length) adjacency.get(nodeId).trail += trailNodes.length;
  }

  return survivors
    .filter((node) => {
      const metrics = adjacency.get(node.protocolId || node.protocol_id || node.id);
      return metrics && metrics.outgoing === 0 && metrics.incoming === 0 && metrics.trail === 0;
    })
    .map(summarizeNode);
}

function pruneBranchReferences(branches = [], targetRefs) {
  const removed = [];
  const nextBranches = asArray(branches).map((branch) => {
    if (!branch || typeof branch !== "object") return branch;
    const next = { ...branch };
    if (Array.isArray(branch.nodes)) {
      next.nodes = branch.nodes.filter((value) => {
        const match = matchesRef(value, targetRefs);
        if (match) removed.push(value);
        return !match;
      });
    }
    if (Array.isArray(branch.choices)) {
      next.choices = branch.choices.map((choice) => {
        if (!choice || typeof choice !== "object") return choice;
        const nextChoice = { ...choice };
        if (Array.isArray(choice.nodes)) {
          nextChoice.nodes = choice.nodes.filter((value) => {
            const match = matchesRef(value, targetRefs);
            if (match) removed.push(value);
            return !match;
          });
        }
        if (Array.isArray(choice.branches)) {
          const nested = pruneBranchReferences(choice.branches, targetRefs);
          nextChoice.branches = nested.branches;
          removed.push(...nested.removed);
        }
        return nextChoice;
      });
    }
    return next;
  });
  return { branches: nextBranches, removed };
}

function relationshipSummary(node, relationship) {
  return {
    source_node: node.protocolId || node.protocol_id || node.id,
    type: relationship?.type || "related_to",
    target: relationship?.target || ""
  };
}

function getNodeRelationships(node) {
  return asArray(node?.data?.relationships).filter(Boolean);
}

function summarizeNode(node) {
  return {
    id: node?.id || node?.data?.id || "",
    protocol_id: node?.protocolId || node?.protocol_id || node?.data?.protocol_id || "",
    title: node?.title || node?.data?.title || node?.id || "Untitled Node",
    type: node?.type || node?.data?.type || "concept",
    relativeFile: node?.relativeFile || ""
  };
}

function sameNode(node, refs) {
  const nodeRefs = collectNodeRefs(node);
  for (const ref of nodeRefs) {
    if (refs.has(ref)) return true;
  }
  return false;
}

function findNodeByRef(nodes, targetRef) {
  const normalized = normalizeRef(targetRef);
  if (!normalized) return null;
  return nodes.find((node) => collectNodeRefs(node).has(normalized)) || null;
}

function findProtocolIdForRef(nodes, ref) {
  const normalized = normalizeRef(ref);
  if (!normalized) return null;
  const match = nodes.find((node) => collectNodeRefs(node).has(normalized));
  return match?.protocolId || match?.protocol_id || match?.id || null;
}

function collectNodeRefs(node) {
  return new Set([
    node?.protocolId,
    node?.protocol_id,
    node?.data?.protocol_id,
    node?.id,
    node?.data?.id,
    node?.relativeFile,
    node?.title,
    node?.data?.title
  ].map(normalizeRef).filter(Boolean));
}

function matchesRef(value, refs) {
  const normalized = normalizeRef(value);
  return normalized ? refs.has(normalized) : false;
}

function normalizeRef(value) {
  return String(value || "").trim().toLowerCase();
}
