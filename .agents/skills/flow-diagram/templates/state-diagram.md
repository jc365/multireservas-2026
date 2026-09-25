# State Diagram Template

```mermaid
stateDiagram-v2
    [*] --> Pending: Created
    Pending --> Reviewed: Director reviews
    Reviewed --> Selected: Approved
    Reviewed --> Rejected: Not approved
    Selected --> [*]
    Rejected --> [*]
```

## Transitions

```mermaid
stateDiagram-v2
    state "In Progress" as IP
    [*] --> IP
    IP --> Done: Complete
    IP --> Failed: Error
    Done --> [*]
    Failed --> IP: Retry
```

## Composite States

```mermaid
stateDiagram-v2
    state Active {
        [*] --> Pending
        Pending --> Processing
        Processing --> Done
    }
    state Inactive {
        [*] --> Archived
    }
    [*] --> Active
    Active --> Inactive: Deactivate
    Inactive --> Active: Reactivate
    Active --> [*]: Delete
```

## Notes

| Element | Description |
|---------|-------------|
| `[*]` | Start/End state |
| `state "name" as alias` | Named state |
| `-->` | Transition |
| `: description` | Transition label |
| `note left of` | Note attached to state |
