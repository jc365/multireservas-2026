# Sequence Diagram Template

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant Backend
    participant DB

    User->>Frontend: Action
    Frontend->>Backend: Request
    Backend->>DB: Query
    DB-->>Backend: Result
    Backend-->>Frontend: Response
    Frontend-->>User: Result
```

## Message Types

| Type | Syntax | Description |
|------|--------|-------------|
| Solid arrow | `->>` | Synchronous message |
| Dashed arrow | `-->>` | Response |
| Solid line | `->` | Solid arrow (no fill) |
| Dashed line | `-->` | Dashed line (no fill) |

## Activations

```mermaid
sequenceDiagram
    participant A
    participant B
    A->>B: Request
    activate B
    B-->>A: Response
    deactivate B
```

## Loops and Alternatives

```mermaid
sequenceDiagram
    participant A
    participant B

    loop Every 30s
        A->>B: Poll
        B-->>A: Data
    end

    alt Success
        A->>B: Process
        B-->>A: OK
    else Failure
        A->>B: Retry
        B-->>A: Error
    end
```

## Notes

```mermaid
sequenceDiagram
    participant A
    participant B
    A->>B: Message
    Note over A,B: Important context
    Note right of A: Local note
```
