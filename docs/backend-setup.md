# Backend Setup Guide – Supabase

## Overview

This guide walks you through setting up a Supabase backend for persistent data storage. Supabase provides PostgreSQL + instant REST API + authentication, requiring zero backend code.

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click **"Start your project"** (sign up for free)
3. Create a new organization and project:
   - **Project name:** `fittracker` (or similar)
   - **Database password:** Generate a strong password (save it)
   - **Region:** Choose closest to you
   - Click **Create new project** (wait ~2 minutes for setup)

4. Once ready, you'll see the **Supabase Dashboard**

## Step 2: Get Your API Credentials

1. Go to **Project Settings** (gear icon, bottom left)
2. Click **API** tab
3. Copy these values and save them:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Anon Key** (public, safe for frontend)
   - **Service Role Key** (secret, never expose—keep on backend only)

You'll need these for frontend integration.

## Step 3: Create Database Schema

1. Go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Paste this entire SQL script:

```sql
-- Create user_states table to store user workout data
CREATE TABLE IF NOT EXISTS user_states (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create an index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_user_states_user_id ON user_states(user_id);

-- Enable Row Level Security (RLS) for data isolation
ALTER TABLE user_states ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own state
CREATE POLICY "Users can read own state" ON user_states
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only UPDATE their own state
CREATE POLICY "Users can update own state" ON user_states
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only INSERT their own state
CREATE POLICY "Users can insert own state" ON user_states
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can DELETE their own state
CREATE POLICY "Users can delete own state" ON user_states
  FOR DELETE
  USING (auth.uid() = user_id);
```

4. Click **RUN** to execute
5. Verify: Go to **Table Editor** → you should see `user_states` table

## Step 4: Enable Email Auth

1. Go to **Authentication** (left sidebar)
2. Click **Providers**
3. Ensure **Email** is enabled (should be by default)
4. Settings:
   - Confirm email: OFF (for testing; enable for production)
   - Auto confirm: ON (users don't need email verification)

## Step 5: Configure CORS (if needed)

Supabase CORS is already configured for localhost and GitHub Pages domains.

If deploying elsewhere, go to **Project Settings** → **API** → **CORS configuration** and add your domain.

## Step 6: Test the Setup

1. Go to **SQL Editor** and run:
```sql
SELECT * FROM user_states;
```
You should see an empty table.

2. Go to **Authentication** → **Users** → You should see an empty user list.

✅ **Setup complete!** You now have:
- PostgreSQL database with `user_states` table
- Row-level security (users can only access their own data)
- Email authentication
- REST API endpoints (auto-generated)

---

## API Endpoints Reference

All endpoints require the `Authorization: Bearer {token}` header (except auth endpoints).

### Authentication

**Sign Up**
- **POST** `/auth/v1/signup`
- Body: `{ "email": "user@example.com", "password": "password123" }`
- Returns: `{ "user": {...}, "session": { "access_token": "...", "refresh_token": "..." } }`

**Sign In**
- **POST** `/auth/v1/token?grant_type=password`
- Body: `{ "email": "user@example.com", "password": "password123" }`
- Returns: `{ "access_token": "...", "refresh_token": "..." }`

**Refresh Token**
- **POST** `/auth/v1/token?grant_type=refresh_token`
- Body: `{ "refresh_token": "..." }`
- Returns: `{ "access_token": "...", "refresh_token": "..." }`

**Sign Out**
- **POST** `/auth/v1/logout`
- Authorization: Bearer token required
- Returns: `{ "ok": true }`

### State Management

**Fetch State (GET)**
- **GET** `/rest/v1/user_states?select=state&user_id=eq.{userId}&limit=1`
- Authorization: Bearer token required
- Returns: `[{ "id": 1, "user_id": "...", "state": {...}, "updated_at": "..." }]`

**Create/Update User State (UPSERT)**
- **POST** `/rest/v1/user_states?on_conflict=user_id`
- Headers: `Prefer: resolution=merge-duplicates,return=representation`
- Body: `{ "user_id": "{userId}", "state": {...}, "updated_at": "2026-03-01T12:00:00Z" }`
- Authorization: Bearer token required
- Returns: `[{ "id": 1, "user_id": "...", "state": {...} }]`

---

## Frontend Integration

Once this setup is complete, proceed to:
1. Create `src/auth.js` – Handle authentication
2. Create `src/sync.js` – Handle state synchronization
3. Update `app.js` – Replace localStorage with backend calls

See `docs/architecture.md` for the complete data flow.

---

## Troubleshooting

**Q: "Invalid API Key" error**
- Check you're using the correct Anon Key (not Service Role Key)
- Verify the Project URL is correct

**Q: "User not found" when fetching state**
- Ensure user is authenticated first
- Check that auth token is valid

**Q: "Permission denied" (403 error)**
- Verify RLS policies are correctly created
- Check that `user_id` matches the authenticated user

**Q: "Table does not exist"**
- Run the SQL schema creation script again
- Verify in Table Editor that `user_states` exists

---

## Next Steps

1. Copy your Project URL and Anon Key
2. Create `src/auth.js` and `src/sync.js` modules
3. Update `app.js` to call auth/sync functions
4. Test signup and data persistence
5. Deploy frontend to GitHub Pages
6. Supabase dashboard remains accessible for monitoring/debugging

---

## Security Notes

- **Anon Key:** Safe to expose in frontend code (use in browser)
- **Service Role Key:** NEVER expose in frontend (backend only)
- **Row-Level Security (RLS):** Enforces data isolation via database—users cannot access other users' data
- **Tokens:** Store in localStorage, refresh before expiry
- **HTTPS only:** Always use HTTPS in production

Your data is encrypted at rest and in transit. Supabase handles compliance (GDPR, SOC2, etc.).

---

For detailed Supabase docs, see: https://supabase.com/docs
