import { normalizeRelationship } from "./graph.js";
import { relationshipIdFor } from "./ids.js";

const FEMALE = "female";
const MALE = "male";

const DIRECT_PARENT_TYPES = new Map([
  ["mother_of", { parentRole: FEMALE }],
  ["father_of", { parentRole: MALE }],
  ["parent_of", { parentRole: null }]
]);

const DIRECT_STEP_PARENT_TYPES = new Map([
  ["step_mother_of", { parentRole: FEMALE }],
  ["step_father_of", { parentRole: MALE }],
  ["step_parent_of", { parentRole: null }]
]);

const DIRECT_CHILD_TYPES = new Map([
  ["child_of", { childGender: null }],
  ["son_of", { childGender: MALE }],
  ["daughter_of", { childGender: FEMALE }]
]);

const DIRECT_STEP_CHILD_TYPES = new Map([
  ["step_child_of", { childGender: null }],
  ["step_son_of", { childGender: MALE }],
  ["step_daughter_of", { childGender: FEMALE }]
]);

const DIRECT_SIBLING_TYPES = new Map([
  ["sibling_of", { gender: null }],
  ["brother_of", { gender: MALE }],
  ["sister_of", { gender: FEMALE }],
  ["half_sibling_of", { gender: null }],
  ["step_sibling_of", { gender: null }]
]);

const SYMMETRIC_TYPES = new Set([
  "sibling_of",
  "half_sibling_of",
  "step_sibling_of",
  "cousin_of",
  "spouse_of"
]);

export function deriveKinshipRelationships(nodes = [], relationships = [], namespace = "local") {
  const nodeById = new Map(nodes.map((node) => [node.protocolId || node.protocol_id || node.id, node]));
  const knownGender = collectKnownGenders(nodes, relationships);
  const parentFacts = collectParentFacts(relationships);
  const stepParentFacts = collectStepParentFacts(relationships);
  const siblingPairs = collectSiblingPairs(relationships);

  const existingDirected = new Set();
  const existingSymmetric = new Set();
  for (const relationship of relationships) {
    const type = relationship.type || "related_to";
    const source = relationship.source;
    const target = relationship.target;
    if (!source || !target) continue;
    if (SYMMETRIC_TYPES.has(type)) {
      existingSymmetric.add(`${type}|${pairKey(source, target)}`);
    } else {
      existingDirected.add(`${type}|${source}|${target}`);
    }
  }

  const derived = [];
  const derivedDirected = new Set();
  const derivedSymmetric = new Set();

  function nodeLabel(id) {
    return nodeById.get(id)?.title || id;
  }

  function add(type, source, target, summary, options = {}) {
    if (!source || !target || source === target) return;
    if (SYMMETRIC_TYPES.has(type)) {
      const key = `${type}|${pairKey(source, target)}`;
      if (existingSymmetric.has(key) || derivedSymmetric.has(key)) return;
      derivedSymmetric.add(key);
    } else {
      const key = `${type}|${source}|${target}`;
      if (existingDirected.has(key) || derivedDirected.has(key)) return;
      derivedDirected.add(key);
    }
    derived.push(normalizeRelationship({
      id: relationshipIdFor(namespace, source, type, target, relationships.length + derived.length),
      source,
      target,
      type,
      summary,
      weight: options.weight ?? 2,
      visibility: options.visibility || "secondary",
      confidence: options.confidence
    }, { namespace, index: relationships.length + derived.length }));
  }

  for (const [child, parentMap] of parentFacts.byChild.entries()) {
    for (const fact of parentMap.values()) {
      add("parent_of", fact.parent, child, `${nodeLabel(fact.parent)} is the parent of ${nodeLabel(child)}.`);
      add("child_of", child, fact.parent, `${nodeLabel(child)} is the child of ${nodeLabel(fact.parent)}.`);

      const childGender = knownGender.get(child) || fact.childGender || null;
      if (childGender === MALE) {
        add("son_of", child, fact.parent, `${nodeLabel(child)} is the son of ${nodeLabel(fact.parent)}.`);
      } else if (childGender === FEMALE) {
        add("daughter_of", child, fact.parent, `${nodeLabel(child)} is the daughter of ${nodeLabel(fact.parent)}.`);
      }
    }
  }

  for (const [child, parentMap] of stepParentFacts.byChild.entries()) {
    for (const fact of parentMap.values()) {
      add("step_parent_of", fact.parent, child, `${nodeLabel(fact.parent)} is the step-parent of ${nodeLabel(child)}.`);
      add("step_child_of", child, fact.parent, `${nodeLabel(child)} is the step-child of ${nodeLabel(fact.parent)}.`);

      const parentGender = knownGender.get(fact.parent) || fact.parentRole || null;
      if (parentGender === FEMALE) {
        add("step_mother_of", fact.parent, child, `${nodeLabel(fact.parent)} is the step-mother of ${nodeLabel(child)}.`);
      } else if (parentGender === MALE) {
        add("step_father_of", fact.parent, child, `${nodeLabel(fact.parent)} is the step-father of ${nodeLabel(child)}.`);
      }

      const childGender = knownGender.get(child) || fact.childGender || null;
      if (childGender === MALE) {
        add("step_son_of", child, fact.parent, `${nodeLabel(child)} is the step-son of ${nodeLabel(fact.parent)}.`);
      } else if (childGender === FEMALE) {
        add("step_daughter_of", child, fact.parent, `${nodeLabel(child)} is the step-daughter of ${nodeLabel(fact.parent)}.`);
      }
    }
  }

  for (const [child, parentMap] of parentFacts.byChild.entries()) {
    for (const fact of parentMap.values()) {
      const grandparentFacts = parentFacts.byChild.get(fact.parent);
      if (!grandparentFacts) continue;
      for (const grandFact of grandparentFacts.values()) {
        add(
          "grandparent_of",
          grandFact.parent,
          child,
          `${nodeLabel(grandFact.parent)} is the grandparent of ${nodeLabel(child)} through ${nodeLabel(fact.parent)}.`,
          { weight: 3 }
        );
        add(
          "grandchild_of",
          child,
          grandFact.parent,
          `${nodeLabel(child)} is the grandchild of ${nodeLabel(grandFact.parent)} through ${nodeLabel(fact.parent)}.`,
          { weight: 3 }
        );
        if (grandFact.parentRole === FEMALE) {
          add(
            "grandmother_of",
            grandFact.parent,
            child,
            `${nodeLabel(grandFact.parent)} is the grandmother of ${nodeLabel(child)} through ${nodeLabel(fact.parent)}.`,
            { weight: 3 }
          );
        } else if (grandFact.parentRole === MALE) {
          add(
            "grandfather_of",
            grandFact.parent,
            child,
            `${nodeLabel(grandFact.parent)} is the grandfather of ${nodeLabel(child)} through ${nodeLabel(fact.parent)}.`,
            { weight: 3 }
          );
        }
      }
    }
  }

  for (const { first, second, sharedParentCount, firstParents, secondParents } of biologicalSiblingCandidates(parentFacts)) {
    add(
      "sibling_of",
      first,
      second,
      `${nodeLabel(first)} and ${nodeLabel(second)} share at least one parent.`,
      { weight: 3 }
    );

    const firstGender = knownGender.get(first) || null;
    const secondGender = knownGender.get(second) || null;
    if (firstGender === MALE) {
      add("brother_of", first, second, `${nodeLabel(first)} is the brother of ${nodeLabel(second)}.`, { weight: 3 });
    } else if (firstGender === FEMALE) {
      add("sister_of", first, second, `${nodeLabel(first)} is the sister of ${nodeLabel(second)}.`, { weight: 3 });
    }
    if (secondGender === MALE) {
      add("brother_of", second, first, `${nodeLabel(second)} is the brother of ${nodeLabel(first)}.`, { weight: 3 });
    } else if (secondGender === FEMALE) {
      add("sister_of", second, first, `${nodeLabel(second)} is the sister of ${nodeLabel(first)}.`, { weight: 3 });
    }

    if (sharedParentCount === 1 && firstParents.size >= 2 && secondParents.size >= 2) {
      add(
        "half_sibling_of",
        first,
        second,
        `${nodeLabel(first)} and ${nodeLabel(second)} share one parent but not both.`,
        { weight: 3 }
      );
    }
    siblingPairs.add(pairKey(first, second));
  }

  for (const siblingKey of siblingPairs) {
    const [first, second] = siblingKey.split("|");
    const firstGender = knownGender.get(first) || null;
    const secondGender = knownGender.get(second) || null;

    const firstChildren = parentFacts.byParent.get(first);
    if (firstChildren) {
      for (const childFact of firstChildren.values()) {
        if (secondGender === FEMALE) {
          add("aunt_of", second, childFact.child, `${nodeLabel(second)} is the aunt of ${nodeLabel(childFact.child)} through ${nodeLabel(first)}.`, { weight: 3 });
          const childGender = knownGender.get(childFact.child) || null;
          if (childGender === FEMALE) {
            add("niece_of", childFact.child, second, `${nodeLabel(childFact.child)} is the niece of ${nodeLabel(second)} through ${nodeLabel(first)}.`, { weight: 3 });
          } else if (childGender === MALE) {
            add("nephew_of", childFact.child, second, `${nodeLabel(childFact.child)} is the nephew of ${nodeLabel(second)} through ${nodeLabel(first)}.`, { weight: 3 });
          } else {
            add("niece_or_nephew_of", childFact.child, second, `${nodeLabel(childFact.child)} is the niece or nephew of ${nodeLabel(second)} through ${nodeLabel(first)}.`, { weight: 3 });
          }
        } else if (secondGender === MALE) {
          add("uncle_of", second, childFact.child, `${nodeLabel(second)} is the uncle of ${nodeLabel(childFact.child)} through ${nodeLabel(first)}.`, { weight: 3 });
          const childGender = knownGender.get(childFact.child) || null;
          if (childGender === FEMALE) {
            add("niece_of", childFact.child, second, `${nodeLabel(childFact.child)} is the niece of ${nodeLabel(second)} through ${nodeLabel(first)}.`, { weight: 3 });
          } else if (childGender === MALE) {
            add("nephew_of", childFact.child, second, `${nodeLabel(childFact.child)} is the nephew of ${nodeLabel(second)} through ${nodeLabel(first)}.`, { weight: 3 });
          } else {
            add("niece_or_nephew_of", childFact.child, second, `${nodeLabel(childFact.child)} is the niece or nephew of ${nodeLabel(second)} through ${nodeLabel(first)}.`, { weight: 3 });
          }
        } else {
          add("aunt_or_uncle_of", second, childFact.child, `${nodeLabel(second)} is the aunt or uncle of ${nodeLabel(childFact.child)} through ${nodeLabel(first)}.`, { weight: 3 });
          add("niece_or_nephew_of", childFact.child, second, `${nodeLabel(childFact.child)} is the niece or nephew of ${nodeLabel(second)} through ${nodeLabel(first)}.`, { weight: 3 });
        }
      }
    }

    const secondChildren = parentFacts.byParent.get(second);
    if (secondChildren) {
      for (const childFact of secondChildren.values()) {
        if (firstGender === FEMALE) {
          add("aunt_of", first, childFact.child, `${nodeLabel(first)} is the aunt of ${nodeLabel(childFact.child)} through ${nodeLabel(second)}.`, { weight: 3 });
          const childGender = knownGender.get(childFact.child) || null;
          if (childGender === FEMALE) {
            add("niece_of", childFact.child, first, `${nodeLabel(childFact.child)} is the niece of ${nodeLabel(first)} through ${nodeLabel(second)}.`, { weight: 3 });
          } else if (childGender === MALE) {
            add("nephew_of", childFact.child, first, `${nodeLabel(childFact.child)} is the nephew of ${nodeLabel(first)} through ${nodeLabel(second)}.`, { weight: 3 });
          } else {
            add("niece_or_nephew_of", childFact.child, first, `${nodeLabel(childFact.child)} is the niece or nephew of ${nodeLabel(first)} through ${nodeLabel(second)}.`, { weight: 3 });
          }
        } else if (firstGender === MALE) {
          add("uncle_of", first, childFact.child, `${nodeLabel(first)} is the uncle of ${nodeLabel(childFact.child)} through ${nodeLabel(second)}.`, { weight: 3 });
          const childGender = knownGender.get(childFact.child) || null;
          if (childGender === FEMALE) {
            add("niece_of", childFact.child, first, `${nodeLabel(childFact.child)} is the niece of ${nodeLabel(first)} through ${nodeLabel(second)}.`, { weight: 3 });
          } else if (childGender === MALE) {
            add("nephew_of", childFact.child, first, `${nodeLabel(childFact.child)} is the nephew of ${nodeLabel(first)} through ${nodeLabel(second)}.`, { weight: 3 });
          } else {
            add("niece_or_nephew_of", childFact.child, first, `${nodeLabel(childFact.child)} is the niece or nephew of ${nodeLabel(first)} through ${nodeLabel(second)}.`, { weight: 3 });
          }
        } else {
          add("aunt_or_uncle_of", first, childFact.child, `${nodeLabel(first)} is the aunt or uncle of ${nodeLabel(childFact.child)} through ${nodeLabel(second)}.`, { weight: 3 });
          add("niece_or_nephew_of", childFact.child, first, `${nodeLabel(childFact.child)} is the niece or nephew of ${nodeLabel(first)} through ${nodeLabel(second)}.`, { weight: 3 });
        }
      }
    }
  }

  for (const { first, second } of cousinCandidates(parentFacts, siblingPairs)) {
    add("cousin_of", first, second, `${nodeLabel(first)} and ${nodeLabel(second)} are cousins through their parents' sibling relationship.`, { weight: 2 });
  }

  return derived;
}

function collectKnownGenders(nodes, relationships) {
  const evidence = new Map();
  for (const node of nodes) {
    const id = node.protocolId || node.protocol_id || node.id;
    const explicit = normalizedGenderFromNode(node);
    if (id && explicit) addGenderEvidence(evidence, id, explicit);
  }
  for (const relationship of relationships) {
    const source = relationship.source;
    if (!source) continue;
    const type = relationship.type || "";
    if (type === "mother_of" || type === "daughter_of" || type === "sister_of" || type === "aunt_of" || type === "niece_of" || type === "step_mother_of" || type === "step_daughter_of") {
      addGenderEvidence(evidence, source, FEMALE);
    } else if (type === "father_of" || type === "son_of" || type === "brother_of" || type === "uncle_of" || type === "nephew_of" || type === "step_father_of" || type === "step_son_of") {
      addGenderEvidence(evidence, source, MALE);
    }
  }
  const known = new Map();
  for (const [id, set] of evidence.entries()) {
    if (set.size === 1) known.set(id, [...set][0]);
  }
  return known;
}

function normalizedGenderFromNode(node) {
  const data = node?.data || node || {};
  const rawValues = [
    data.gender,
    data.sex,
    data.identity_gender,
    ...(Array.isArray(data.subtypes) ? data.subtypes : []),
    data.subtype
  ].filter(Boolean);
  for (const value of rawValues) {
    const normalized = normalizedGender(value);
    if (normalized) return normalized;
  }
  return null;
}

function normalizedGender(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["female", "woman", "girl"].includes(text)) return FEMALE;
  if (["male", "man", "boy"].includes(text)) return MALE;
  return null;
}

function addGenderEvidence(map, id, gender) {
  if (!map.has(id)) map.set(id, new Set());
  map.get(id).add(gender);
}

function collectParentFacts(relationships) {
  const byChild = new Map();
  const byParent = new Map();
  for (const relationship of relationships) {
    const type = relationship.type || "";
    if (DIRECT_PARENT_TYPES.has(type)) {
      const source = relationship.source;
      const target = relationship.target;
      if (!source || !target) continue;
      addParentFact(byChild, byParent, {
        parent: source,
        child: target,
        parentRole: DIRECT_PARENT_TYPES.get(type).parentRole,
        childGender: null
      });
      continue;
    }
    if (DIRECT_CHILD_TYPES.has(type)) {
      const source = relationship.source;
      const target = relationship.target;
      if (!source || !target) continue;
      addParentFact(byChild, byParent, {
        parent: target,
        child: source,
        parentRole: null,
        childGender: DIRECT_CHILD_TYPES.get(type).childGender
      });
    }
  }
  return { byChild, byParent };
}

function collectStepParentFacts(relationships) {
  const byChild = new Map();
  const byParent = new Map();
  for (const relationship of relationships) {
    const type = relationship.type || "";
    if (DIRECT_STEP_PARENT_TYPES.has(type)) {
      const source = relationship.source;
      const target = relationship.target;
      if (!source || !target) continue;
      addParentFact(byChild, byParent, {
        parent: source,
        child: target,
        parentRole: DIRECT_STEP_PARENT_TYPES.get(type).parentRole,
        childGender: null
      });
      continue;
    }
    if (DIRECT_STEP_CHILD_TYPES.has(type)) {
      const source = relationship.source;
      const target = relationship.target;
      if (!source || !target) continue;
      addParentFact(byChild, byParent, {
        parent: target,
        child: source,
        parentRole: null,
        childGender: DIRECT_STEP_CHILD_TYPES.get(type).childGender
      });
    }
  }
  return { byChild, byParent };
}

function addParentFact(byChild, byParent, fact) {
  const childKey = fact.child;
  const parentKey = fact.parent;
  if (!byChild.has(childKey)) byChild.set(childKey, new Map());
  if (!byParent.has(parentKey)) byParent.set(parentKey, new Map());
  const childMap = byChild.get(childKey);
  const parentMap = byParent.get(parentKey);
  const childExisting = childMap.get(parentKey);
  const merged = mergeParentFacts(childExisting, fact);
  childMap.set(parentKey, merged);
  parentMap.set(childKey, merged);
}

function mergeParentFacts(existing, incoming) {
  if (!existing) return { ...incoming };
  return {
    ...existing,
    parentRole: existing.parentRole || incoming.parentRole || null,
    childGender: existing.childGender || incoming.childGender || null
  };
}

function collectSiblingPairs(relationships) {
  const pairs = new Set();
  for (const relationship of relationships) {
    const type = relationship.type || "";
    if (!DIRECT_SIBLING_TYPES.has(type)) continue;
    const source = relationship.source;
    const target = relationship.target;
    if (!source || !target || source === target) continue;
    pairs.add(pairKey(source, target));
  }
  return pairs;
}

function* biologicalSiblingCandidates(parentFacts) {
  const children = [...parentFacts.byChild.keys()];
  for (let index = 0; index < children.length; index += 1) {
    for (let other = index + 1; other < children.length; other += 1) {
      const first = children[index];
      const second = children[other];
      const firstParents = new Set(parentFacts.byChild.get(first)?.keys() || []);
      const secondParents = new Set(parentFacts.byChild.get(second)?.keys() || []);
      const shared = intersection(firstParents, secondParents);
      if (!shared.size) continue;
      yield {
        first,
        second,
        sharedParentCount: shared.size,
        firstParents,
        secondParents
      };
    }
  }
}

function* cousinCandidates(parentFacts, siblingPairs) {
  const yielded = new Set();
  const children = [...parentFacts.byChild.keys()];
  for (let index = 0; index < children.length; index += 1) {
    for (let other = index + 1; other < children.length; other += 1) {
      const first = children[index];
      const second = children[other];
      if (siblingPairs.has(pairKey(first, second))) continue;
      const firstParents = [...(parentFacts.byChild.get(first)?.keys() || [])];
      const secondParents = [...(parentFacts.byChild.get(second)?.keys() || [])];
      let isCousin = false;
      for (const firstParent of firstParents) {
        for (const secondParent of secondParents) {
          if (siblingPairs.has(pairKey(firstParent, secondParent))) {
            isCousin = true;
            break;
          }
        }
        if (isCousin) break;
      }
      if (!isCousin) continue;
      const key = pairKey(first, second);
      if (yielded.has(key)) continue;
      yielded.add(key);
      yield { first, second };
    }
  }
}

function intersection(first, second) {
  const values = new Set();
  for (const item of first) {
    if (second.has(item)) values.add(item);
  }
  return values;
}

function pairKey(first, second) {
  return [first, second].sort().join("|");
}
