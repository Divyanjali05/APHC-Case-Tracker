# GSD (Get-Shit-Done) Workflow Documentation

## 1. Introduction

The GSD workflow is a structured, agentic software development lifecycle framework. It organizes development into verifiable phases, enforces strict architectural boundaries, maintains planning context in markdown files, and ensures autonomous execution without losing alignment with project goals.

## 2. Directory Structure

```text
.planning/
├── PROJECT.md          # Core mission, high-level capabilities, stack definition
├── REQUIREMENTS.md     # Detailed functional and non-functional requirements
├── ROADMAP.md          # Phased milestones (Phase 0 to Phase 5) with status
├── rules.md            # Repository and engineering guardrails
└── phases/
    ├── phase-0-setup.md                       # Current phase plan & criteria
    ├── phase-1-authentication-and-profiles.md # Upcoming phase plan
    └── ...
```

## 3. Phase Lifecycle

Each phase in the GSD workflow follows four defined steps:

1. **Audit & Plan**: Inspect current workspace state, verify prerequisites, write/update the phase specification file.
2. **Execute**: Implement the minimal, modular components required for that phase. Never implement features from future phases ahead of time.
3. **Verify**: Run automated linters, type checks, unit tests, and integration tests to confirm acceptance criteria.
4. **Checkpoint & Report**: Document all created files, executed commands, test results, blockers, and draft the scope for the next phase.

## 4. Phase Transitions

- An agent must **never** proceed to the next phase automatically without explicit user authorization.
- The current phase's acceptance criteria must all be satisfied or discrepancies clearly noted before closing the phase.
