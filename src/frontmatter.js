import yaml from "js-yaml";

export function parseFrontMatter(raw, filePath = "") {
  const text = String(raw || "");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { data: {}, body: text, raw, filePath };
  }

  const lineEnd = text.startsWith("---\r\n") ? "\r\n" : "\n";
  const marker = `${lineEnd}---${lineEnd}`;
  const endIndex = text.indexOf(marker, 3);
  if (endIndex === -1) {
    return { data: {}, body: text, raw, filePath };
  }

  const yamlText = text.slice(3 + lineEnd.length - 1, endIndex).trim();
  const body = text.slice(endIndex + marker.length);
  const data = yamlText ? yaml.load(yamlText) || {} : {};
  return { data, body, raw, filePath };
}

export function stringifyFrontMatter(data, body = "") {
  const yamlText = yaml.dump(data || {}, { lineWidth: 100, noRefs: true, sortKeys: false }).trimEnd();
  return `---\n${yamlText}\n---\n${body || ""}`;
}
