# PPL AB Planner

Browser SPA using localStorage; optional Electron wrapper for a Windows exe.

## Current UI
- I dag
- Plan
- Kalender

## Setup
```powershell
npm install
```

## Dev
```powershell
npm start
```

## Build
```powershell
npm run package-win
```

Output in dist/PPL AB Planner-win32-x64/.

## Deploy (GitHub Pages)

### Local preflight + push
```powershell
npm run deploy
```

What this does:
- Runs deployment preflight checks (clean working tree, `main` branch, `origin` remote, not behind `origin/main`)
- Builds a deterministic Pages artifact in `.site/`
- Pushes `main` to trigger GitHub Actions deployment

If preflight says Git is unavailable:
- Install Git for Windows
- Restart terminal/VS Code
- Or set `GIT_BIN` to your git executable path before running deploy

### CI deploy
On every push to `main` (or manual workflow dispatch), GitHub Actions:
1. Builds `.site/` using `npm run build:pages`
2. Uploads `.site/` as Pages artifact
3. Deploys artifact to GitHub Pages

This ensures only required static web assets are published every time.
