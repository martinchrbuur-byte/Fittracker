# Roadmap
1. Templates
2. Drag-copy day
3. CSV/print export
4. Notifications
5. Color coding
6. Progress charts
7. Backend sync
8. ExerciseDB proxy deployment (deferred)

## Deferred Item: ExerciseDB proxy deployment
- Status: Deferred for now (direct ExerciseDB calls + fallback are active).
- Scope: Deploy `supabase/functions/exercisedb-proxy` and enable production proxy routing.
- Trigger to revisit:
	- CORS issues in production,
	- API reliability/rate-limit concerns,
	- Need for centralized caching/monitoring.
- Done criteria:
	- Function deployed and reachable at `/functions/v1/exercisedb-proxy`.
	- Production config points to proxy and `EXERCISEDB_FORCE_PROXY = true`.
	- Network verification confirms catalog requests route through Supabase.


