# XNP-0012: Executable Tool Contract

## Status

Draft

## Summary

Define a stable executable contract for official XanaNode tooling so applications can call Core and Workspace behavior without embedding Node.js directly.

## Motivation

XanaNode is a protocol, not a JavaScript framework.

Right now, the reference stack is implemented in Node-based repositories:

- XanaNode-Protocol
- XanaNode-Core-SDK
- XanaNode-Workspace
- XanaNode-Hugo
- XanaNode-Studio
- XanaNode-Mobile

That is acceptable as an implementation phase, but it is not the right long-term dependency story for the protocol itself.

If a desktop app, mobile app, static-site builder, AI agent, or institutional integration must install Node and call private JavaScript modules directly, then the protocol boundary is too soft. The protocol should be callable from any stack that can execute a program, pass files, and read JSON results.

## Proposal

Official tooling should converge on two primary executable surfaces:

- `xananode-core`
- `xananode-workspace`

These names describe roles, not implementation language. They may be delivered as:

- native binaries
- packaged runtime executables
- OS-specific launchers
- language wrappers that preserve the same command contract

## Goals

1. Keep protocol behavior callable from any language or host environment.
2. Separate implementation language from protocol contract.
3. Give Studio, Mobile, Hugo helpers, AI agents, and third-party tools one stable thing to call.
4. Keep artifact generation, intake analysis, and projection derivation aligned across the stack.

## Non-goals

1. This proposal does not replace language SDKs.
2. This proposal does not forbid direct in-process library use.
3. This proposal does not require one operating-system packaging strategy.

## Core responsibilities

`xananode-core` should own:

- substrate validation
- protocol inspection
- artifact builds
- portable bundle generation
- fragment derivation
- review suggestion generation
- intake analysis
- projection-data derivation

Recommended commands:

- `validate`
- `inspect`
- `build`
- `bundle`
- `analyze-intake`
- `projection`

## Workspace responsibilities

`xananode-workspace` should own:

- substrate initialization
- workspace open/create behavior
- author and repository enforcement
- local build orchestration
- portable export
- mounted substrate intake
- working-copy creation
- de-intertwingle cleanup
- health reporting
- snapshot orchestration

Recommended commands:

- `init`
- `open`
- `build`
- `export`
- `intertwingle`
- `deintertwingle`
- `health`
- `snapshot`

## Input and output rules

Executable implementations should:

- accept filesystem paths to substrate folders, `.substrate` archives, `substrate-bundle.json`, and `substrate-bundle.jsonl`
- support structured JSON output for machine callers
- emit non-zero exit codes on failure
- expose build metadata including implementation version and commit when possible
- preserve protocol semantics regardless of implementation language

Machine callers should not be expected to scrape prose logs to determine success.

## Why this matters

XanaNode is supposed to let knowledge move across tools and media without losing structure.

The same principle applies to the tooling itself.

If the protocol is real, then:

- a Kotlin Android app should be able to call it
- a Rust CLI should be able to call it
- a Python workflow should be able to call it
- a static-site renderer should be able to call it
- an AI agent should be able to call it

without pretending JavaScript is the protocol.

## Transition path

1. Keep the current Node reference implementations.
2. Tighten their command contracts and JSON outputs.
3. Package them as self-contained executables for supported platforms.
4. Teach official tools to prefer the executable boundary.
5. Allow alternate implementations later as long as they preserve the same artifact rules and command semantics.

## Compatibility

This proposal is additive.

Existing repositories may continue to expose:

- Node modules
- npm CLIs
- internal helper APIs

But official documentation should increasingly describe the executable contract as the stable cross-stack surface.
