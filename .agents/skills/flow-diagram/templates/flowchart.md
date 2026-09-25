# Flowchart Template

```mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
```

## Node Shapes

| Shape | Syntax | Use |
|-------|--------|-----|
| Rectangle | `[text]` | Process step |
| Rounded | `(text)` | Start/End |
| Diamond | `{text}` | Decision |
| Circle | `((text))` | Connector |
| Stadium | `([text])` | Terminal |
| Subroutine | `[[text]]` | Subprocess |
| Cylinder | `[(text)]` Database |
| Flag | `>text]` | Flag |

## Connectors

| Type | Syntax |
|------|--------|
| Arrow | `-->` |
| Dotted | `-.->` |
| Thick | `==>` |
| Link | `---` |

## Labels

```mermaid
flowchart LR
    A[Start] -->|label| B[End]
```

## Subgraphs

```mermaid
flowchart TD
    subgraph group1 [Group Title]
        A --> B
    end
    subgraph group2 [Another Group]
        C --> D
    end
    B --> C
```
