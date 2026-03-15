# agent-projects — Specification

## File format

Each project is a single `.md` file with a YAML frontmatter block followed by free-form Markdown.

```
---
<YAML frontmatter>
---

<Markdown body>
```

## YAML schema

```yaml
---
# Required
name: Project Name
status: active          # active | paused | stalled | done | archived

# Optional
tags: [tag1, tag2]

# Master Plan — the "why" and "what" (inspired by MASTER_PLAN.md)
master_plan:
  problem: "What pain point does this solve?"
  vision: "What does success look like?"
  phases:
    - name: "Phase name"
      done: false
      desc: "What users can do at this phase"
  non_goals:
    - "What this project deliberately won't do"

# Goals — measurable outcomes
goals:
  - "Achieve X"
  - "Reach Y users"

# Todos — actionable tasks
todos:
  - text: "Task description"
    priority: high        # high | medium | low
    done: false
    tags: []              # optional labels

# Facts — stable technical references
facts:
  url: https://example.com
  repo: owner/repo
  deploy: Railway
  # any key-value pairs
---
```

## Field reference

### `status`
| Value | Meaning |
|---|---|
| `active` | Being worked on |
| `paused` | Intentionally paused, will resume |
| `stalled` | Blocked or abandoned temporarily |
| `done` | Complete |
| `archived` | No longer relevant |

### `todos[].priority`
| Value | Use when |
|---|---|
| `high` | Blocking or urgent |
| `medium` | Important but not urgent |
| `low` | Nice to have |

## Markdown body

No structure required. Use it for:
- Technical notes and context
- Decisions and rationale
- Session logs
- Links and references
- Anything that doesn't fit in YAML

## Conventions

- File name = project slug, lowercase with hyphens (e.g., `clawbanking.md`)
- Keep `facts` for stable references (URLs, IDs, tokens location)
- Keep `todos` current — mark `done: true` rather than deleting
- `master_plan` is optional but encouraged for non-trivial projects
- The Markdown body is yours — no rules

## API

The companion server (`server/index.js`) exposes:

```
GET    /api/projects           → list all projects (parsed)
GET    /api/projects/:slug     → single project
PATCH  /api/projects/:slug     → update YAML fields (body: JSON patch)
```

Auth: `Authorization: Bearer <token>` (set via `PROJECTS_TOKEN` env var).
