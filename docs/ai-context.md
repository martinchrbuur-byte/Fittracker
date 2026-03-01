# AI notes
- Vanilla SPA with Supabase auth/sync and ExerciseDB integration.
- State is cached in localStorage and synced to backend when logged in.
- Most UI is rendered from `app.js`; mutations call `save()` and rerender.
- Follow existing patterns when extending state/load/validate logic.

## Deployment runbook (Windows PowerShell)

### 0) One-time prerequisites
- Install Git for Windows: https://git-scm.com/download/win
- Close/reopen VS Code so `git` is available in terminal PATH.
- Verify tools:

```powershell
git --version
node --version
npm --version
```

### 1) Local validation before deploy

```powershell
npm install
npm start
```

- Verify the changed flow in app UI (for catalog work: open “Tilføj øvelse fra katalog” and confirm `Muskler` + `Udstyr` filters are selectable).

### 2) Deploy frontend (GitHub Pages via main branch)

```powershell
git status
git add .
git commit -m "Fix exercise catalog filter metadata fallback"
git push origin main
```

- GitHub Pages publishes from repo settings configuration (main/docs or gh-pages depending on repository setup).
- Live URL used in this project docs: `https://martinchrbuur-byte.github.io/Fittracker/`

### 3) If Supabase Edge Function changed (only when editing `supabase/functions/**`)

```powershell
npm install -g supabase
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy exercisedb-proxy
```

### 4) Post-deploy smoke test
- Hard refresh the live site (`Ctrl+F5`).
- Open add-exercise modal and confirm filters populate.
- Confirm search/add still works.
- If backend-related changes were included, validate auth + sync still save state.