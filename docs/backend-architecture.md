# Architecture – Backend-Persistent PPL Planner

## Overview

The app now uses Supabase for persistent backend storage. All user data is synced to PostgreSQL, enabling multi-device access and data retention across sessions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Frontend)                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ app.js (UI & Mutations)                                    │ │
│  │ - Mutation functions update state                          │ │
│  │ - Call save() which triggers sync                          │ │
│  └──────────────────────┬─────────────────────────────────────┘ │
│                         │                                         │
│  ┌──────────────────────▼─────────────────────────────────────┐ │
│  │ auth.js (Authentication)                                  │ │
│  │ - Login/Signup modal                                       │ │
│  │ - JWT token management                                    │ │
│  │ - Token refresh on startup                                │ │
│  └──────────────────────┬─────────────────────────────────────┘ │
│                         │                                         │
│  ┌──────────────────────▼─────────────────────────────────────┐ │
│  │ sync.js (State Synchronization)                            │ │
│  │ - Debounced saves (2 sec)                                  │ │
│  │ - Retry logic on failure                                  │ │
│  │ - Offline queue (localStorage)                            │ │
│  │ - Online/offline detection                                │ │
│  └──────────────────────┬─────────────────────────────────────┘ │
│                         │                                         │
│  ┌──────────────────────▼─────────────────────────────────────┐ │
│  │ localStorage (Local Cache)                                │ │
│  │ - Access token, refresh token                             │ │
│  │ - Offline mutation queue                                  │ │
│  │ - Cached state (fallback)                                 │ │
│  └──────────────────────┬─────────────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────────────┘
                          │ HTTPS
         ┌────────────────▼─────────────────┐
         │     Supabase REST API             │
         │ ─────────────────────────────────│
         │ POST   /auth/v1/signup            │
         │ POST   /auth/v1/token             │
         │ POST   /auth/v1/logout            │
         │ GET/PATCH /rest/v1/user_states    │
         └────────────────┬──────────────────┘
                          │
         ┌────────────────▼──────────────────┐
         │    PostgreSQL Database             │
         │ ──────────────────────────────────│
         │ users (managed by auth)            │
         │ user_states (state JSONB)          │
         │  - Row-level security              │
         │  - User data isolation             │
         └───────────────────────────────────┘
```

## Data Flow

### 1. Page Load (Authentication & Session Init)

```
[Page  Load]
    │
    ├─> authInit()
    │   ├─> Check localStorage for tokens
    │   ├─> If token exists: Try refreshAuthToken()
    │   └─> If no token: Show login modal
    │
    ├─> If logged in: syncInit()
    │   ├─> Fetch state from backend
    │   ├─> If empty: Try migrate from localStorage
    │   └─> Return state
    │
    └─> load(backendState)
        └─> Render UI with state
```

### 2. User Action (Mutation & Sync)

```
[User Action: Add Exercise]
    │
    ├─> Mutation function (e.g., add())
    │   └─> Updates s.w (state.workouts)
    │
    ├─> save()
    │   ├─> localStorage.setItem() (local cache)
    │   └─> syncStateDebounced(s)  [ASYNC]
    │
    ├─> syncStateDebounced()
    │   ├─> Wait 2 seconds for inactivity
    │   └─> syncSaveState(s)  [if more changes, reset timer]
    │
    ├─> syncSaveState()
    │   ├─> Check if online
    │   ├─> POST UPSERT to /rest/v1/user_states?on_conflict=user_id
    │   ├─> On 401: Try refreshAuthToken()
    │   ├─> On failure: Queue in syncQueueOfflineChange()
    │   └─> Show toast: "Gemt" or "Kunne ikke gemme"
    │
    └─> [Re-render]
```

### 3. Offline Scenario

```
[User goes offline]  (no internet)
    │
    ├─> syncSaveState() tries, fails
    │   └─> syncQueueOfflineChange()
    │
    ├─> Offline queue stored in localStorage['_sync_queue']
    │
    ├─> Toast: "Offline - ændringer gemmes lokalt"
    │
    └─> [User continues editing, mutations queue locally]

[User goes online]  (internet restored)
    │
    ├─> Window 'online' event fires
    │   └─> syncProcessOfflineQueue()
    │
    ├─> Sends last queued state to backend
    │
    ├─> If success: Clear queue
    │   └─> Toast: "Offline ændringer synkroniseret"
    │
    └─> [UI synced with backend]
```

### 4. Token Refresh

```
[Access token expires]  (after ~1 hour)
    │
    ├─> Next API call returns 401
    │
    ├─> authFetch() catches 401
    │   └─> refreshAuthToken()
    │
    ├─> POST /auth/v1/token?grant_type=refresh_token
    │   ├─> With refresh_token from localStorage
    │   └─> Returns new access_token
    │
    ├─> Store new token in localStorage
    │
    ├─> Retry original API call
    │
    └─> [Continue syncing]

[Or: Refresh token also expired/invalid]
    │
    ├─> refreshAuthToken() fails
    │   └─> authLogout()
    │
    ├─> Clear tokens from localStorage
    │
    ├─> Show login modal
    │
    └─> [User re-authenticates]
```

## Module Breakdown

### `auth.js` (Authentication)
- **Functions:**
  - `authInit()` – Check session, show login if needed
  - `authSignup(email, password)` – Create account
  - `authSignin(email, password)` – Login
  - `authLogout()` – Clear tokens, show login modal
  - `refreshAuthToken()` – Auto-refresh before expiry
  - `authIsLoggedIn()` – Check if authenticated
  - `authGetUserId()` – Get current user ID
  - `showAuthModal(mode)` – Show signup or login modal
  - `createAuthModals()` – Initialize modal DOM
  - `authFetch(endpoint, options)` – Make authenticated API calls

- **Storage:**
  - `auth_access_token` – JWT for API calls
  - `auth_refresh_token` – JWT for token refresh
  - `auth_user_id` – Current user's ID

### `sync.js` (State Synchronization)
- **Functions:**
  - `syncInit()` – Fetch state from backend on login
  - `syncFetchState()` – GET user's state from backend
  - `syncSaveState(state, retryCount)` – POST/PATCH state to backend
  - `syncStateDebounced(state)` – Debounced save (2 sec)
  - `syncQueueOfflineChange(state)` – Store for offline
  - `syncClearOfflineQueue()` – Clear after successful sync
  - `syncProcessOfflineQueue()` – Sync queued changes when online
  - `syncInitializeOfflineDetection()` – Listen for online/offline events
  - `syncExportState(state)` – Download JSON backup
  - `syncImportState(file)` – Upload JSON backup
  - `showSyncToast(message, type)` – Toast notifications

- **Storage:**
  - `_sync_cache` – Last synced state (fallback)
  - `_sync_queue` – Offline mutation queue (array of states)

### `app.js` (Application Logic)
- **Key Changes:**
  - `save()` now calls `syncStateDebounced()` after localStorage save
  - New `initApp()` function for initialization after auth
  - Updated `DOMContentLoaded` to check auth first
  - Replaced `exportJson()` with `syncExportState()`
  - Replaced `importJson()` with `syncImportState()`
  - Logout button event listener

## API Endpoints (Supabase)

### Authentication

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/auth/v1/signup` | `{email, password}` | `{user, session}` |
| POST | `/auth/v1/token?grant=password` | `{email, password}` | `{access_token, refresh_token}` |
| POST | `/auth/v1/token?grant=refresh_token` | `{refresh_token}` | `{access_token, refresh_token}` |
| POST | `/auth/v1/logout` | (auth header required) | `{ok: true}` |

### State Management

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| GET | `/rest/v1/user_states?select=state&user_id=eq.{id}&limit=1` | Bearer | — | `[{state: {...}}]` |
| POST | `/rest/v1/user_states?on_conflict=user_id` | Bearer | `{user_id, state, updated_at}` + `Prefer: resolution=merge-duplicates` | `[{id, user_id, state}]` |

All state endpoints require `Authorization: Bearer {access_token}` header.

## Data Model

### State Object
```javascript
{
  split: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"],  // 6-day cycle
  workouts: {
    "Push A": ["Bench press", "Overhead press"],
    "Pull A": ["Pull-up", "Barbell row"],
    // ...
  },
  notes: {
    "Push A": "Focus on form",
    // ...
  },
  templates: {
    "Push": ["Bench press", "Overhead press", "Tricep dips"],
    // ...
  },
  appliedTemplates: {
    "Push A": "Push",  // Which template applied to each day
    // ...
  },
  lastPlannedDate: "2026-03-01",
  currentDayIndex: 0,
  completedDays: {
    "2026-03-01": {
      dayName: "Push A",
      exercises: ["Bench press", "Overhead press"],
      notes: "Good session"
    },
    // ...
  }
}
```

### Database Schemas

**user_states (PostgreSQL)**
```sql
TABLE user_states {
  id: bigint (PK, auto)
  user_id: uuid (FK → auth.users.id)
  state: jsonb (entire state object)
  updated_at: timestamp (auto)
  UNIQUE(user_id)
}
```

## Security

- **Row-Level Security (RLS):** Users can only access their own state
- **JWT Tokens:** OAuth2-style authentication
- **Access Token:** 1 hour expiry, used for API calls
- **Refresh Token:** Long-lived, never expires (unless revoked)
- **HTTPS Only:** All communication encrypted
- **No Password Storage:** Handled by Supabase Auth
- **CORS:** Restricted to specific domains (localhost, github.io, etc.)
- **Localhost Test Mode:** Auth bypass only on `127.0.0.1` / `localhost` for local QA; production still requires login

### RLS SQL (Reference)

```sql
ALTER TABLE user_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own state" ON user_states
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own state" ON user_states
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own state" ON user_states
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own state" ON user_states
  FOR DELETE USING (auth.uid() = user_id);
```

## Error Handling

### Network Failures
- **Automatic Retry:** Up to 3 retries with exponential backoff
- **Offline Queue:** Mutations stored locally while offline
- **Toast Feedback:** User notified of sync status

### Authentication Failures
- **401 Unauthorized:** Token expired → Try refresh → If fail, logout
- **403 Forbidden:** RLS violation (shouldn't happen)
- **Invalid Credentials:** Show error in login modal

### Data Conflicts
- **Last-Write-Wins:** Backend version always takes precedence
- **Migration on First Login:** Old localStorage data migrated to backend

## Performance Considerations

- **Debounced Saves:** 2-second delay prevents excessive API calls
- **localStorage Cache:** Fast fallback if network is slow
- **Token Caching:** Tokens kept in localStorage, not re-fetched
- **Lazy Modal Initialization:** Auth/sync modals created on-demand
- **No Breaking Changes:** Existing mutations and render logic unchanged

## Deployment

### Frontend (GitHub Pages)
1. Configure `AUTH_CONFIG` in `auth.js` with your Supabase credentials
2. Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY`
3. Push to GitHub → GitHub Actions auto-deploys to Pages

### Backend (Supabase)
1. Create free Supabase project
2. Run SQL schema setup (see `backend-setup.md`)
3. Enable email auth provider
4. Copy `Project URL` and `Anon Key` to `auth.js`
5. No backend code needed—just manage database UI

## Future Enhancements

- Real-time collaboration (WebSockets)
- Data versioning/history
- Undo/redo with backend snapshots
- Team workouts (shared templates)
- Export to PDF/CSV
- Mobile app (React Native)
- Offline-first sync with conflict resolution (CRDT)

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Not logged in" toast | No valid token | Clear cookies, re-login |
| "Offline" forever | Browser thinks offline | Check Network tab in DevTools |
| State not syncing | Network error | Check Supabase dashboard for logs |
| Login modal stuck | Auth modal creation failed | Check browser console |
| Toast not showing | CSS missing | Ensure Stiles.css includes sync-toast |

See `backend-setup.md` for Supabase setup details.

## Verification Checklist

- [ ] Login as User A, create workouts/notes, refresh browser: data is still present.
- [ ] Close browser and reopen, login as User A: previous data loads from backend.
- [ ] Login as User B in a clean session: User A data is not visible.
- [ ] Modify data while offline, reconnect: queued changes sync and persist.
- [ ] Trigger token refresh path (or wait expiry): app refreshes token and continues syncing.
- [ ] Open/close modals and switch tabs after re-render: buttons and handlers still work.
