---
name: flow-diagram
description: Generate Mermaid diagrams from process descriptions.
---

# Skill: flow-diagram

Generate Mermaid diagrams from process descriptions.

## Supported Diagram Types

| Type | Mermaid Command | Use Case |
|------|-----------------|----------|
| Flow | `flowchart TD` | Step-by-step processes (login, review, export) |
| Sequence | `sequenceDiagram` | Actor-system interactions |
| State | `stateDiagram-v2` | Status transitions (submission lifecycle) |
| ER | `erDiagram` | Data models and entity relationships |

## Workflow

1. User describes the process to visualize
2. Skill selects the most appropriate diagram type
3. Generate Mermaid code following the template
4. Save to `docs/diagrams/<name>.md`

## Templates

Refer to `templates/` directory:
- `flowchart.md` — Flow diagrams
- `sequence-diagram.md` — Sequence diagrams
- `state-diagram.md` — State diagrams
- `er-diagram.md` — ER diagrams

## Examples

Refer to `examples/sample-diagrams.md` for reference diagrams.

## Output

- `.md` file with Mermaid code block
- Renderable in GitHub/GitLab/any Markdown viewer

## Rules

- Use standard Mermaid syntax
- Node IDs: uppercase letters (A, B, C...)
- Descriptions in square brackets for nodes
- Descriptions in curly braces for decisions
- Keep diagrams focused and readable
