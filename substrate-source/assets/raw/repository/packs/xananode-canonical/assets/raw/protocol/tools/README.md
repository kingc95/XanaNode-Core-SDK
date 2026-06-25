# Tools

This directory contains repository maintenance tools.

## Validator

Run:

```bash
python -m pip install -r requirements-dev.txt
python tools/validate.py
```

The validator checks JSON Schema conformance for protocol artifacts and XanaNode-specific integrity rules such as declared relationship types, registered namespaces, and resolvable relationship endpoints.
