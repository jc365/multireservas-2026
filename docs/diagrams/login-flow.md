# Login Flow — Frontend Web

## Diagram 1: Login Interaction (sequenceDiagram)

```mermaid
sequenceDiagram
    actor User
    participant Layout
    participant LoginForm
    participant UserContext
    participant API
    participant Backend
    participant DB

    Note over Layout: App mounts

    alt No token in localStorage
        Layout->>UserContext: Auto-login as director
        UserContext->>API: POST /auth/login {xUserId: 'director'}
        API->>Backend: Demo login request
        Backend->>DB: Find user by demo email
        DB-->>Backend: User found
        Backend-->>API: {token, userId}
        API-->>UserContext: Token received
        UserContext-->>Layout: Login complete
        Layout->>Layout: Navigate to /dashboard
    else Token exists
        Layout->>UserContext: checkAuth()
        UserContext->>API: GET /users/:id
        alt Valid token
            API-->>UserContext: User data
            UserContext-->>Layout: user loaded
        else Invalid/expired token (401)
            API-->>UserContext: 401 error
            UserContext-->>Layout: user = null
            Note over Layout: Token stays in localStorage
            Note over Layout: App shows empty state
        end
    end

    Note over User,LoginForm: User logs out and sees login form

    alt Email + Password login
        User->>LoginForm: Enter credentials
        LoginForm->>UserContext: login({email, password})
        UserContext->>API: POST /auth/login {email, password}
        API->>Backend: Validate credentials
        Backend->>DB: Find user by email
        DB-->>Backend: User found
        Backend->>Backend: bcrypt compare
        alt Invalid credentials
            Backend-->>API: 401 error
            API-->>UserContext: Error
            UserContext-->>LoginForm: Show error
            LoginForm-->>User: "Credenciales invalidas"
        else Valid credentials
            Backend->>Backend: Generate JWT (24h)
            Backend-->>API: {token, userId}
            API-->>UserContext: Token received
            UserContext->>UserContext: Store token + userId
            UserContext->>API: GET /users/:id
            API-->>UserContext: User data
            UserContext->>API: GET /users/me/participations
            API-->>UserContext: Participations
            UserContext-->>LoginForm: Login success
            LoginForm-->>User: Redirect to dashboard
        end
    else Demo mode login
        User->>Layout: Select role (actor/preselector)
        Layout->>UserContext: login({xUserId: role})
        UserContext->>API: POST /auth/login {xUserId: role}
        API->>Backend: Demo login request
        Backend->>Backend: Check DEMO_MODE=true
        alt DEMO_MODE disabled
            Backend-->>API: Error
            API-->>UserContext: Error
            UserContext-->>Layout: Login failed
        else DEMO_MODE enabled
            Backend->>DB: Find user by demo email
            DB-->>Backend: User found
            Backend->>Backend: Generate JWT (no password check)
            Backend-->>API: {token, userId}
            API-->>UserContext: Token received
            UserContext-->>Layout: Login complete
            Layout->>Layout: Navigate to /dashboard
        end
    end
```

## Diagram 2: Token Lifecycle & Auth Management (flowchart)

```mermaid
flowchart TD
    subgraph mount [App Mount]
        A[Layout mounts] --> B{Token in localStorage?}
        B -->|Yes| C[checkAuth]
        B -->|No| D[Auto-login demo]
    end

    subgraph auth [Authentication]
        C --> E{GET /users/:id}
        E -->|200 OK| F[user = data]
        E -->|401 Invalid| G[token invalid]
        E -->|Network error| H[user = null]
        
        D --> I[POST /auth/login xUserId]
        I -->|200 OK| J[Store token]
        I -->|Error| K[Show LoginForm]
        
        J --> L[refreshUser]
        L --> M[checkAuth]
        L --> N[fetchUser]
        L --> O[fetchParticipations]
    end

    subgraph valid [Token Valid]
        F --> P[isAuthenticated = true]
        P --> Q[Render Outlet]
        Q --> R[Start 30s polling]
        R --> S[fetchParticipations]
        S --> T{Tab visible?}
        T -->|Yes| U[Make request]
        T -->|No| V[Pause polling]
        U --> S
    end

    subgraph invalid [Token Invalid]
        G --> W[Clear user state]
        H --> W
        W --> X[Token stays in localStorage]
        X --> Y[App shows empty state]
        Y --> Z[All API calls fail 401]
        Z --> AA[User must logout manually]
    end

    subgraph logout [Logout Flow]
        AB[User clicks Logout] --> AC[UserContext.logout]
        AC --> AD[Remove token from localStorage]
        AC --> AE[Remove userId from localStorage]
        AC --> AF[refreshUser]
        AF --> AG[checkAuth returns false]
        AG --> AH[isAuthenticated = false]
        AH --> AI[Stop polling]
        AI --> AJ[Render LoginForm]
    end

    subgraph expired [Token Expiry Timeline]
        AK[JWT Generated] -->|Valid 24h| AL[Working requests]
        AL -->|After 24h| AM[401 responses start]
        AM --> AN[Silent failures]
        AN --> AO[Manual logout required]
    end

    style A fill:#3B82F6,color:#fff
    style G fill:#EF4444,color:#fff
    style K fill:#EF4444,color:#fff
    style AA fill:#F59E0B,color:#000
    style AK fill:#22C55E,color:#fff
    style AM fill:#F59E0B,color:#000
    style AO fill:#EF4444,color:#fff
```

## Key Files

| File | Role |
|------|------|
| `frontend/src/components/Layout.tsx` | Gatekeeper — renders LoginForm or Outlet |
| `frontend/src/components/LoginForm.tsx` | Email/password form only |
| `frontend/src/context/UserContext.tsx` | Login/logout, token storage, polling |
| `frontend/src/api/client.ts` | HTTP client, cache, 401 handling |
| `backend/src/infrastructure/middleware/auth.ts` | JWT verification (throws on missing/invalid) |
| `backend/src/application/use-cases/LoginUseCase.ts` | Auth logic (email or demo) |

## Notable Behaviors

1. **Demo auto-login:** No token → auto-logs in as director (demo mode)
2. **No auto-logout on 401:** Invalid tokens stay in localStorage; user must logout manually
3. **No token refresh:** 24h expiry with no refresh mechanism
4. **Polling pauses when tab hidden:** Prevents wasted requests
5. **Race condition:** Layout uses sync `localStorage` check, but user data is async — stale token shows app shell briefly before failing
