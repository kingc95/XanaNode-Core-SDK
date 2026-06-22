# Compatibility Levels

Compatibility levels describe how safely one implementation can ingest or federate another substrate.

## Level 0: Opaque

The substrate can be stored as raw data, but its schema is unknown.

## Level 1: Manifest Recognized

The substrate declares a manifest and namespace.

## Level 2: Core Valid

The substrate validates against XanaNode Core.

## Level 3: Extensions Declared

The substrate uses custom types, but those types are declared in namespaced extension schemas.

## Level 4: Merge Candidate

The substrate can participate in identity matching, schema mapping, and merge reporting.

## Level 5: Federation Ready

The substrate supports stable IDs, provenance, declared schemas, merge reports, and compatibility reports.

Compatibility is not a moral ranking. It is a practical statement about how much automated interoperation is safe.
