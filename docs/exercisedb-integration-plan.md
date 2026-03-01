# ExerciseDB Integration – Technical Spec & Use Cases

## Goals
- Integrate ExerciseDB as an external exercise catalog for search and selection.
- Persist selected exercises (with stable IDs + metadata) in user state.
- Keep existing progression tracking (`done`, `reps`, `kilos`) and cross-device sync behavior.

## Implemented Use Cases
1. Search exercises by free-text in “Tilføj øvelse” modal.
2. Filter exercises by body part, muscle, and equipment.
3. Add selected ExerciseDB exercise to a specific day in plan.
4. Add manual fallback exercise when catalog is unavailable.
5. Persist selected exercise metadata in app state and sync payload.
6. Track per-exercise completion and reps/kg in Today tab using stable exercise keys.
7. Store completed day snapshots with exercise logs and display in calendar modal.
8. Maintain backward compatibility for legacy string-only exercises.

## Data Model (App State)
- `workouts[day]` now supports structured entries (`ExerciseRef`) and legacy strings.
- Canonical runtime normalization converts entries to:
  - `id`
  - `exerciseId`
  - `name`
  - `bodyParts[]`
  - `targetMuscles[]`
  - `equipments[]`
  - `gifUrl`
  - `source`
- `workoutDayLogs[date].exercises` keyed by stable exercise key (`id`, fallback legacy name key).
- `completedDays[date].exerciseLogs[]` includes per-exercise done/reps/kilos plus metadata fields.

## Frontend Architecture
- New module: `exercise-catalog.js`
  - `exerciseCatalogSearch(options)`
  - `exerciseCatalogMeta()`
- Fetch strategy:
  - Primary: Supabase Edge Function proxy `/functions/v1/exercisedb-proxy`
  - Fallback: direct `https://www.exercisedb.dev/api/v1`
- Add modal in `app.js` now uses catalog search + filters and renders selectable results.

## Backend Proxy (Supabase Edge Function)
- New function: `supabase/functions/exercisedb-proxy/index.ts`
- Routes:
  - `GET /meta` → aggregated body parts, muscles, equipments.
  - `GET /exercises` → search/filter/pagination endpoint.
  - `GET /exercises/:exerciseId` → details endpoint.
- Input query params supported:
  - `search`, `bodyPart`, `muscle`, `equipment`, `limit`, `offset`
- Behavior:
  - Clamps `limit` to max `25` per ExerciseDB v1 docs.
  - Returns passthrough JSON payload shape (`success`, `metadata`, `data`).

## Migration & Compatibility
- Legacy workouts stored as string arrays are normalized at load/save.
- Existing import/export remains compatible and now validates both:
  - string entries
  - object entries with at least `name`
- Templates remain string-based and are converted to structured entries when applied.

## Operational Notes
- If proxy is not deployed, app falls back to direct API calls.
- For production, deploy and prefer proxy for better control over rate-limits/caching.
- Existing sync/RLS model remains unchanged for user state isolation.

## Suggested Next Enhancements
1. Add pagination controls in add modal (next/previous).
2. Add exercise detail preview (GIF, instructions) before add.
3. Cache recent catalog queries client-side for faster UX.
4. Add optional dedupe guard when adding same exercise repeatedly to a day.
