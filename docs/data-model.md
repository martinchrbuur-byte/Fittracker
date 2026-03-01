# Data model
state={splitOrder:6-string[],workouts:{day:ex[]},notes:{day:str},lastPlannedDate:iso|null,currentDayIndex:0-5,completedDays:{iso:{day,ex[],notes}},templates:{name:ex[]},appliedTemplates:{day:name}}

localStorage keys mirror these names. Import/export dumps entire state; `validate` checks types and 6-day invariants.

## `localStorage` keys
- **`splitOrder`**: JSON array of strings (length 6). Determines the six-day cycle order.
- **`workouts`**: JSON object mapping dayName to array of exercise names.
- **`notes`**: JSON object mapping dayName to free-text notes.
- **`lastPlannedDate`**: string storing the date when the user last marked "today"; empty string if none.
- **`currentDayIndex`**: stringified number (0–5) referring into `splitOrder` for the Today tab.
- **`completedDays`**: JSON object of snapshots keyed by ISO date.

### Relationships & Invariants
- Every day name listed in `splitOrder` must have corresponding entries (possibly empty) in both `workouts` and `notes`.
- `workouts` keys change when days are renamed; migration occurs in `renameSplitDay`.
- `currentDayIndex` always points to the index of a entry within `splitOrder`; preserved when reordering.
- `completedDays` entries include a `dayName` matching the name at the time of marking. When a day is renamed, existing snapshots are updated to keep consistency.

## Six-day cycle logic
- `lastPlannedDate` and `currentDayIndex` together act as a reference point for mapping arbitrary calendar dates to a split day.
- The helper `getSplitDayNameForDate` computes the offset in days modulo six and returns `splitOrder[(refIndex + delta) % 6]`.

## Import/export
- Data export simply serialises the entire `state` object (including `completedDays`).
- Imported JSON must match the above structure; `validateImportedState` enforces it.

## Notes
- No date objects are stored directly; ISO strings are used for portability.
- All keys are optional when first created; `loadState` uses default values when missing or malformed.
