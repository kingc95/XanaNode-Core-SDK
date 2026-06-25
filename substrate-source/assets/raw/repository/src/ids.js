import { createHash } from "node:crypto";

export function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function uniqueStrings(values) {
  return [...new Set(asArray(values).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

export function omitUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export function slugify(value, fallback = "item") {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || fallback;
}

export function protocolTypePath(type) {
  return slugify(type || "node", "node");
}

export function nodeIdFor(relativeFile, data = {}) {
  if (data.id) return slugify(data.id, "node");
  if (data.slug) return slugify(data.slug, "node");
  if (data.title) return slugify(data.title, "node");
  const noExt = String(relativeFile || "node").replace(/\.[^.]+$/, "");
  return slugify(noExt.split(/[\\/]/).pop(), "node");
}

export function protocolIdFor(localId, data = {}, namespace = "local") {
  if (data.protocol_id) return String(data.protocol_id);
  if (data.protocolId) return String(data.protocolId);
  const type = data.type || "node";
  return `${namespace}:${protocolTypePath(type)}/${slugify(localId, "node")}`;
}

export function relationshipIdFor(namespace, sourceId, relationshipType, targetId, index = 0) {
  return `${namespace}:rel/${slugify(sourceId, "source")}-${slugify(relationshipType, "rel")}-${slugify(targetId, "target")}-${index + 1}`;
}

export function fragmentProtocolIdFor(namespace, sourceId, fragmentId) {
  return `${namespace}:fragment/${slugify(sourceId, "source")}-${slugify(fragmentId, "fragment")}`;
}

export function contentIdFor(value) {
  return `sha256:${createHash("sha256").update(String(value || "")).digest("hex")}`;
}

export function normalizeProtocolRef(ref, namespace = "local") {
  if (!ref) return ref;
  const value = String(ref).trim();
  if (/^[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+\//.test(value)) return value;
  return `${namespace}:node/${slugify(value, "node")}`;
}
