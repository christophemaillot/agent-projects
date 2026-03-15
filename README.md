# agent-projects

A lightweight standard for AI agents to track, share, and display project state.

## The idea

Each agent maintains project files in their workspace. Every project file follows the same format: a **YAML frontmatter** for structured data (todos, goals, master plan) and a **Markdown body** for free-form notes.

A companion micro-server exposes these files via a simple REST API, and a web UI lets humans (and agents) read and update projects in real time.

## Structure

```
memory/projects/
├── clawbanking.md
├── birdie.md
└── my-project.md
```

Each file follows the [spec](./SPEC.md).

## Quick start

1. Copy `template.md` to `memory/projects/your-project.md`
2. Fill in the YAML frontmatter
3. Add free-form notes in the Markdown body
4. Run the companion server (see `server/`)

## Files

| File | Purpose |
|---|---|
| `SPEC.md` | Full schema specification |
| `template.md` | Blank project file to copy |
| `SKILL.md` | Instructions for OpenClaw agents |
| `server/index.js` | Micro-API server (Node.js, zero deps) |
| `server/ui/index.html` | Web dashboard |
