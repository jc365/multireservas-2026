# Login Flow — Frontend Web

```mermaid
flowchart TD
    A[App mounts - Layout] --> B{Token in localStorage?}
    
    B -->|No| C[Reset demo state]
    C --> D[Auto-login as demo director]
    D --> E["POST /auth/login {xUserId: 'director'}"]
    E --> F{Success?}
    F -->|Yes| G[Store token + userId]
    F -->|No| H[Show login form]
    G --> I[Navigate to /dashboard]
    
    B -->|Yes| J[Check auth status]
    J --> K[fetchUser from API]
    K --> L{API response?}
    L -->|200 OK| M[User loaded]
    L -->|401 Invalid| N[Token invalid/expired]
    L -->|Network error| O[Set user = null]
    
    N --> P[User stays on page]
    P --> Q[Subsequent requests fail 401]
    Q --> R[User must logout manually]
    
    O --> S[App shell visible]
    S --> T[No data loaded]
    
    M --> U[Load participations]
    U --> V[Start 30s polling]
    V --> W[Render Outlet]
    
    H --> X{Login type?}
    
    X -->|Email + Password| Y[User enters credentials]
    Y --> Z["POST /auth/login {email, password}"]
    Z --> AA{Backend validates}
    AA -->|Invalid credentials| AB[Show error message]
    AB --> Y
    AA -->|Valid| AC[Store token + userId]
    
    X -->|Demo mode| AD[User selects role]
    AD --> AE["POST /auth/login {xUserId: role}"]
    AE --> AF{DEMO_MODE enabled?}
    AF -->|No| AG[Backend throws error]
    AF -->|Yes| AH[Map role to demo email]
    AH --> AI[Find user by email]
    AI --> AJ[Generate JWT - no password check]
    AJ --> AC
    
    AC --> AK[refreshUser]
    AK --> AL[checkAuth - reads localStorage]
    AK --> AM[fetchUser - GET /users/:id]
    AK --> AN[fetchParticipations - GET /users/me/participations]
    AL --> AO[isAuthenticated = true]
    AM --> AP[Set user object]
    AN --> AQ[Set participations]
    AO --> AR[Layout re-renders]
    AR --> AS[Outlet shown instead of LoginForm]
    
    style A fill:#3B82F6,color:#fff
    style N fill:#EF4444,color:#fff
    style R fill:#F59E0B,color:#000
    style AG fill:#EF4444,color:#fff
    style AB fill:#EF4444,color:#fff
```

## Token Lifecycle

```mermaid
flowchart LR
    A[JWT Generated] -->|24h expiry| B[Valid Token]
    B -->|Time passes| C[Expired Token]
    C -->|API call| D[401 Response]
    D --> E[fetchUser fails]
    E --> F[user = null]
    F --> G[App still shows Outlet]
    G --> H[All requests fail]
    H --> I[Manual logout required]
    
    style A fill:#22C55E,color:#fff
    style C fill:#F59E0B,color:#000
    style D fill:#EF4444,color:#fff
    style I fill:#EF4444,color:#fff
```

## Key Files

| File | Role |
|------|------|
| `frontend/src/components/Layout.tsx` | Gatekeeper, renders LoginForm or Outlet |
| `frontend/src/components/LoginForm.tsx` | Email/password form only |
| `frontend/src/context/UserContext.tsx` | Login/logout logic, token storage |
| `frontend/src/api/client.ts` | HTTP client, cache, 401 handling |
| `backend/src/infrastructure/middleware/auth.ts` | JWT verification |
| `backend/src/application/use-cases/LoginUseCase.ts` | Auth logic (email or demo) |

## Notable Behaviors

1. **Demo auto-login:** If no token exists, Layout auto-logs in as director (demo mode)
2. **No auto-logout on 401:** Invalid tokens stay in localStorage; user must logout manually
3. **No token refresh:** 24h expiry with no refresh mechanism
4. **Polling pauses when tab hidden:** Prevents wasted requests
