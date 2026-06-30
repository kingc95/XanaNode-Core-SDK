import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ValidationError } from "./errors.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localSchemaDir = path.join(packageRoot, "schemas");
const vendoredProtocolSchemaDir = path.join(packageRoot, "vendor", "xananode-protocol", "schemas");

function defaultSchemaDir() {
  return fs.existsSync(vendoredProtocolSchemaDir) ? vendoredProtocolSchemaDir : localSchemaDir;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

export function loadBundledSchemas(schemaDir = path.join(packageRoot, "schemas")) {
  const schemas = new Map();
  for (const file of fs.readdirSync(schemaDir).filter((name) => name.endsWith(".schema.json"))) {
    const fullPath = path.join(schemaDir, file);
    schemas.set(file, readJson(fullPath));
  }
  return schemas;
}

function latestSchemaFile(schemaDir, prefix) {
  const files = fs.readdirSync(schemaDir)
    .filter((name) => name.startsWith(`${prefix}.v`) && name.endsWith(".json") && !name.includes(".schema."))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return files.at(-1);
}

export function validateWithSchema(value, schema, label = "value") {
  const ajv = createAjv();
  const validate = ajv.compile(schema);
  const ok = validate(value);
  if (!ok) {
    throw new ValidationError(`${label} failed schema validation`, { errors: validate.errors || [] });
  }
  return true;
}

export function validateSubstrateArtifacts(substrate, options = {}) {
  const schemaDir = options.schemaDir || defaultSchemaDir();
  const schemas = loadBundledSchemas(schemaDir);
  const errors = [];
  const warnings = [];
  const ajv = createAjv();
  const validators = new Map();

  for (const [name, schema] of schemas.entries()) {
    try {
      validators.set(name, ajv.compile(schema));
    } catch (error) {
      warnings.push({ kind: "schema_compile_warning", schema: name, message: error.message });
    }
  }

  function check(name, value, label) {
    const validate = validators.get(name);
    if (!validate) return;
    if (!validate(value)) {
      errors.push({ label, schema: name, errors: validate.errors || [] });
    }
  }

  if (substrate.manifest) check("substrate-manifest.schema.json", substrate.manifest, "manifest");
  if (substrate.relationships) check("substrate-relationships.schema.json", { relationships: substrate.relationships }, "relationships");
  for (const node of substrate.protocolNodes || []) check("substrate-node.schema.json", node, `node ${node.id}`);

  const nodeTypesFile = latestSchemaFile(schemaDir, "xananode-node-types");
  const relationshipTypesFile = latestSchemaFile(schemaDir, "xananode-relationship-types");
  const nodeTypeRegistry = nodeTypesFile ? readJson(path.join(schemaDir, nodeTypesFile)) : { node_types: [] };
  const relationshipTypeRegistry = relationshipTypesFile ? readJson(path.join(schemaDir, relationshipTypesFile)) : { relationship_types: [] };
  const knownNodeTypes = new Set((nodeTypeRegistry.node_types || []).map((type) => type.type));
  const knownRelationshipTypes = new Set((relationshipTypeRegistry.relationship_types || []).map((type) => type.type));
  const nodeIds = new Set((substrate.protocolNodes || []).map((node) => node.id));

  for (const node of substrate.protocolNodes || []) {
    if (!knownNodeTypes.has(node.type)) {
      warnings.push({ kind: "unknown_node_type", node: node.id, type: node.type });
    }
  }

  for (const relationship of substrate.relationships || []) {
    if (!knownRelationshipTypes.has(relationship.type)) {
      warnings.push({ kind: "unknown_relationship_type", relationship: relationship.id, type: relationship.type });
    }
    if (!relationship.external && relationship.source && !nodeIds.has(relationship.source)) {
      warnings.push({ kind: "missing_source_node", relationship: relationship.id, source: relationship.source });
    }
    if (!relationship.external && relationship.target && !nodeIds.has(relationship.target)) {
      warnings.push({ kind: "missing_target_node", relationship: relationship.id, target: relationship.target });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
