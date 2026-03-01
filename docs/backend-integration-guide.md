# Backend Integration & Deployment Guide

## Quick Start (5 minutes)

### Step 1: Set Up Supabase Backend

See `backend-setup.md` for full details, but quickly:

1. Go to [supabase.com](https://supabase.com) → Create project
2. Copy **Project URL** and **Anon Key** from Settings → API
3. In SQL Editor, paste the schema SQL and run it:

```sql
CREATE TABLE IF NOT EXISTS user_states (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE(user_id)
);
ALTER TABLE user_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own state" ON user_states FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own state" ON user_states FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own state" ON user_states FOR INSERT WITH CHECK (auth.uid() = user_id);
```

4. Enable Email auth in Authentication → Providers

### Step 2: Configure Frontend

In `auth.js`, find this section at the top:

```javascript
const AUTH_CONFIG = {
  SUPABASE_URL: '', // Set to your Supabase Project URL
  SUPABASE_ANON_KEY: '', // Set to your Supabase Anon Key
};
```

Fill in your credentials:

```javascript
const AUTH_CONFIG = {
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ0eXAiOiJKV1QiLCJhbGc...',
};
```

Copy these from your Supabase project:
- **Project URL:** Settings → API → Project URL
- **Anon Key:** Settings → API → Anon Key (public, safe for frontend)

### Step 3: Test Locally

Open `index.html` in a browser:

1. Should see login modal
2. Click "Opret ny konto"
3. Enter email and password
4. Should sign up and load app
5. Add an exercise
6. Should see "Gemmer..." → "Gemt" toast
7. Refresh page—data should persist!

### Step 4: Deploy

**Frontend (GitHub Pages):**
```bash
git add auth.js sync.js
git commit -m "Add backend persistence"
git push origin main
```

Your app is now live at `https://martinchrbuur-byte.github.io/Fittracker/`

**Backend:** Nothing to deploy—Supabase is managed ✅

---

## File Structure

```
c:\Users\Martin\VSCODE\
├── index.html              (includes auth.js, sync.js, app.js)
├── app.js                  (updated: calls sync on save)
├── auth.js                 (NEW: authentication module)
├── sync.js                 (NEW: sync & offline support)
├── Stiles.css              (updated: logout-btn, sync-toast styles)
├── docs/
│   ├── backend-setup.md    (NEW: Supabase setup guide)
│   ├── backend-architecture.md (NEW: architecture & data flow)
│   ├── ui-uplift-implementation.md
│   └── ...
└── ...
```

---

## How It Works

### Authentication Flow

1. **User loads app** → `authInit()` checks for token
2. **No token?** → Show login modal
3. **User signs up/logs in** → Get JWT tokens
4. **Store tokens** in localStorage
5. **Load state** from backend via `syncInit()`
6. **Render app** with user's data

### Sync Flow

1. **User adds exercise** → Mutation updates `s`
2. **Call `save()`** → Also calls `syncStateDebounced(s)`
3. **Wait 2 seconds** → If no more changes, send to backend
4. **POST/PATCH to `/rest/v1/user_states`** with state JSONB
5. **Show toast** → "Gemmer..." → "Gemt" or error

### Offline Flow

1. **User goes offline** (no internet)
2. **Sync fails** → Queued in localStorage['_sync_queue']
3. **Toast:** "Offline - ændringer gemmes lokalt"
4. **User continues editing** → Mutations stack locally
5. **Internet restored** → Auto-sync queued changes
6. **Toast:** "Offline ændringer synkroniseret"

---

## Configuration

### Supabase Credentials

Edit `auth.js` top section:

```javascript
const AUTH_CONFIG = {
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ0eXAiOiJKV1QiLCJhbGci...',
};
```

### Sync Debounce Delay

Edit `sync.js` near top:

```javascript
const SYNC_CONFIG = {
  DEBOUNCE_MS: 2000,        // Wait 2 sec before syncing
  MAX_RETRIES: 3,            // Retry failed syncs 3 times
  RETRY_DELAY_MS: 1000,      // Start with 1 sec delay
};
```

---

## Features

✅ **Real-time sync** to PostgreSQL
✅ **Offline queue** – changes saved locally if no internet
✅ **Auto-retry** with exponential backoff
✅ **Token refresh** – auto-renew when expired
✅ **User isolation** – RLS enforces data privacy
✅ **Backup/restore** – Export/import JSON backups
✅ **Backward compatible** – Existing modals & UI unchanged
✅ **Mobile optimized** – All modals are responsive

---

## Debugging

### Check Auth Status
Open browser DevTools Console:
```javascript
authIsLoggedIn()           // true if logged in
authGetUserId()            // current user ID
localStorage.getItem('auth_access_token')  // JWT token
```

### Check Sync Status
```javascript
s                          // Current state object
localStorage.getItem('_sync_cache')  // Last synced state
JSON.parse(localStorage.getItem('_sync_queue') || '[]').length  // Queued changes
```

### Monitor Network Calls
- Open DevTools → Network tab
- Filter for `supabase.co` requests
- Watch POST/PATCH to `/rest/v1/user_states`
- Check response status (200 = success, 401 = auth error)

### Check Supabase Logs
- Go to Supabase dashboard
- Click project
- Go to **Logs** → Monitor API calls & errors

---

## Common Issues

### Q: "Invalid API Key" Error
**A:** Check you're using `Anon Key`, not `Service Role Key`. Anon Key is public (safe for frontend).

### Q: Login modal stuck or not appearing
**A:** Check browser console for JavaScript errors. Ensure `auth.js` is loaded before `app.js`.

### Q: State not syncing
**A:** 
1. Check internet connection
2. Verify Supabase credentials in `auth.js`
3. Check Network tab → see if request is being sent
4. Check Supabase dashboard Logs for API errors

### Q: "Offline" forever even though online
**A:** Browser might be stuck offline. Hard-refresh (Ctrl+Shift+R). Check if other sites work.

### Q: Logout doesn't work
**A:** Click  logout → Should clear tokens and show login modal. Check browser console.

### Q: Old localStorage data not migrating
**A:** On first login after backend setup, app checks for localStorage data and auto-migrates. If already logged in once, clear localStorage and try again.

---

## Security Notes

- **Anon Key in frontend code:** OK, it's public (frontend auth only)
- **Service Role Key:** NEVER put in frontend (backend only)
- **Tokens in localStorage:** Standard practice (alternative: session storage)
- **Row-Level Security:** Prevents users from accessing other users' data (database-level)
- **HTTPS only:** All production traffic encrypted

---

## Next Steps

1. ✅ Supabase project created
2. ✅ Schema set up
3. ✅ Frontend configured with credentials
4. ✅ Test locally
5. ✅ Deploy to GitHub Pages
6. ✅ Share app link: `https://martinchrbuur-byte.github.io/Fittracker/`

Users can now sign up and their data persists across sessions! 🎉

---

## Support

- **Supabase Docs:** https://supabase.com/docs
- **Frontend architecture:** See `backend-architecture.md`
- **UI improvements:** See `ui-uplift-implementation.md`
- **Supabase Dashboard:** Logs, SQL editor, database explorer, auth management
