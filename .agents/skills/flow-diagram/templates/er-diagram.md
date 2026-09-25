# ER Diagram Template

```mermaid
erDiagram
    User ||--o{ Casting : owns
    User ||--o{ Submission : submits
    Casting ||--o{ Round : contains
    Round ||--o{ Submission : receives
    Round }o--o{ User : participates

    User {
        string id PK
        string email
        string name
        string password
    }

    Casting {
        string id PK
        string title
        string description
        datetime createdAt
    }

    Round {
        string id PK
        int number
        string status
        datetime createdAt
    }

    Submission {
        string id PK
        string videoUrl
        int score
        string feedback
        string status
        int duration
    }
```

## Relationship Types

| Symbol | Meaning |
|--------|---------|
| `\|\|--o{` | One to zero-or-many |
| `\|\|--\|\|` | One to one |
| `\|\|--\|{` | One to one-or-many |
| `}o--o{` | Many to many |
| `}o--\|\|` | Many to one |

## Cardinality Notation

| Notation | Meaning |
|----------|---------|
| `\|\|` | Exactly one |
| `\|o` | Zero or one |
| `\|{` | One or many |
| `o{` | Zero or many |

## Field Types

| Type | Example |
|------|---------|
| `string` | text |
| `int` | integer |
| `float` | decimal |
| `bool` | boolean |
| `date` | date only |
| `datetime` | date + time |
| `json` | JSON object |

## Keys

| Key | Syntax |
|-----|--------|
| Primary | `PK` |
| Foreign | `FK` |
| Unique | `UK` |
