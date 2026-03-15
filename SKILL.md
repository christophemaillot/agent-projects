# Skill: agent-projects

Manage structured project files for the agent-projects standard.

## What this skill does

- Maintains project files in `memory/projects/` following the YAML+MD spec
- Reads and updates project state during work sessions
- Runs a companion micro-server for UI access

## File location

Projects live in `memory/projects/<slug>.md` relative to the workspace root.

## Reading a project

At the start of any session involving a project, load the relevant file:
```
memory_get("memory/projects/<slug>.md")
```

Or use `memory_search` to find relevant project context.

## Updating a project

After any significant work session, update the project file:

1. Mark completed todos as `done: true`
2. Add new todos discovered during the session
3. Update `status` if it changed
4. Append session notes to the Markdown body
5. Update `facts` if new stable references were found

## Creating a new project

1. Copy `template.md` from the agent-projects repo
2. Save as `memory/projects/<slug>.md`
3. Fill in the YAML frontmatter
4. Add initial notes to the Markdown body

## Running the server

```bash
cd /path/to/workspace
PROJECTS_TOKEN=your-token PROJECTS_DIR=memory/projects node /path/to/server/index.js
```

Default port: 3456. Set `PORT` to override.

## Conventions

- Slug = lowercase filename without extension (e.g., `clawbanking` for `clawbanking.md`)
- Never delete todos — mark `done: true` for traceability
- `facts` = stable, rarely-changing references (URLs, IDs, where tokens live)
- Markdown body = everything else (session logs, decisions, context)
- Update project files proactively — don't wait to be asked
