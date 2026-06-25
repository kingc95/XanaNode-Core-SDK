# XanaNode Core SDK Substrate

This folder is the explicit substrate source generated from the XanaNode Core SDK repository.

It exists so higher layers can federate with Core as a normal substrate instead of re-deriving Core facts ad hoc.

Regenerate it from the repository root with:

```powershell
node tools/build-substrate-source.mjs
```

Or from `XanaNode-Master`:

```powershell
npm run core:build-substrate-source
```
