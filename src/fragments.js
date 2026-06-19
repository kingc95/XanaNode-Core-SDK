import { stripMarkdown, splitBlocks } from "./markdown.js";
import { asArray, contentIdFor, fragmentProtocolIdFor, slugify } from "./ids.js";

export function buildGeneratedFragments(markdown) {
  return splitBlocks(markdown).map((block, index) => ({
    id: String(index + 1).padStart(4, "0"),
    label: `Block ${index + 1}`,
    text: stripMarkdown(block),
    raw: block,
    selector: { type: "FragmentSelector", value: String(index + 1).padStart(4, "0") },
    generated: true
  })).filter((fragment) => fragment.text);
}

export function normalizeAuthoredFragments(data = {}) {
  return asArray(data.fragments).map((fragment, index) => {
    const id = slugify(fragment.id || fragment.fragment_id || fragment.label || `fragment-${index + 1}`, `fragment-${index + 1}`);
    return {
      id,
      label: fragment.label || fragment.title || id,
      text: fragment.text || fragment.quote || fragment.summary || "",
      raw: fragment.raw || fragment.text || fragment.quote || "",
      selector: fragment.selector || { type: "semantic-anchor", value: id },
      content_id: fragment.content_id,
      version_id: fragment.version_id,
      rights_status: fragment.rights_status || data.rights_status,
      source_url: fragment.source_url || data.source_url,
      generated: false
    };
  });
}

export function buildFragments(markdown, data = {}, context = {}) {
  const generated = buildGeneratedFragments(markdown);
  const authored = normalizeAuthoredFragments(data);
  const sourceId = context.sourceId || data.id || data.slug || slugify(data.title, "node");
  const namespace = context.namespace || "local";
  const sourceProtocolId = context.sourceProtocolId;
  const sourceContentId = context.sourceContentId || data.content_id || contentIdFor(markdown);
  const sourceVersionId = context.sourceVersionId || data.version_id || sourceContentId;
  const withProtocol = (fragment) => {
    const contentId = fragment.content_id || contentIdFor(fragment.raw || fragment.text || fragment.id);
    const versionId = fragment.version_id || contentId;
    return {
      ...fragment,
      fragment_id: fragment.id,
      source_node: sourceProtocolId,
      source_content_id: sourceContentId,
      source_version_id: sourceVersionId,
      content_id: contentId,
      version_id: versionId,
      protocol_id: fragment.protocol_id || fragmentProtocolIdFor(namespace, sourceId, fragment.id),
      tumbler: fragment.tumbler || `${sourceProtocolId || sourceId}@${sourceVersionId}#fragment/${fragment.id}@${versionId}`
    };
  };
  return {
    generated: generated.map(withProtocol),
    authored: authored.map(withProtocol),
    all: [...authored, ...generated].map(withProtocol)
  };
}

export function parseXanaRef(ref) {
  const value = String(ref || "").trim().replace(/^xana:\/\//, "");
  const match = value.match(/^([^@/#]+(?:\/[^@/#]+)?)(?:@([^/#]+))?(?:\/([^#]+))?$/);
  if (!match) return null;
  return {
    node: match[1],
    version: match[2] || "latest",
    start: match[3] || null,
    end: match[3] || null,
    range: match[3] || "1"
  };
}

export function rangeToText(fragmentMap, range) {
  const start = typeof range === "string" ? range : range?.start || range?.range;
  const end = typeof range === "string" ? range : range?.end || start;
  if (!start) return null;
  const entries = fragmentMap instanceof Map
    ? [...fragmentMap.entries()]
    : Object.entries(fragmentMap || {});
  const selected = entries
    .filter(([key]) => key >= start && key <= end)
    .sort(([left], [right]) => left.localeCompare(right));
  const text = selected.map(([, value]) => typeof value === "string" ? value : value?.text).filter(Boolean).join("\n\n");
  return text || null;
}

export function findXanaReferences(markdown) {
  const body = String(markdown || "");
  const direct = [...body.matchAll(/xana:\/\/[^\s\]"'<>)}]+/g)].map((match) => ({ ref: match[0], kind: "uri", index: match.index }));
  const shortcodes = [...body.matchAll(/\{\{<\s*xana\s+[^>]*ref=["']([^"']+)["'][^>]*>\}\}/g)].map((match) => ({ ref: match[1], kind: "shortcode", index: match.index }));
  return [...direct, ...shortcodes];
}
