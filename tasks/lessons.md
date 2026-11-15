# LoneStar — Engineering Lessons & Invariants

1. **Non-Bluish Warm Neutral Palette**: All background surfaces in both Light (`#f6f4ef`, `#fdfcf9`, `#eeeae0`) and Dark (`#161614`, `#1f1e1b`, `#282723`) modes maintain `R >= G >= B` to strictly avoid any cool/bluish tint.
2. **Clean Architecture Dependency Rule**: `lonestar-core::domain` has zero external UI/DB/framework dependencies. `application` depends only on `domain` traits (`ports`). `infrastructure` and `src-tauri` adapt external formats (piStar JSON, filesystem, Tauri IPC) to `application` use cases.
3. **iStar 2.0 Metamodel Fidelity**:
   - Actors (`Actor`, `Agent`, `Role`) cannot form `IsA` or `ParticipatesIn` cycles, and `IsA` only connects matching non-Agent actor types (`Actor->Actor` or `Role->Role`).
   - Internal intentional elements (`Goal`, `Quality`, `Task`, `Resource`) belong to an Actor's Strategic Rationale boundary; `NeededBy` strictly maps `Resource -> Task`, `Contribution` maps `* -> Quality` (`make`, `help`, `hurt`, `break`), `Qualification` maps `Quality -> Goal/Task/Resource`, and `AndRefinement`/`OrRefinement` map `Goal/Task -> Goal/Task` without cycles.
   - Social `Dependency` links span two distinct actors (`depender` and `dependee`) through a `dependum` (`Goal`, `Quality`, `Task`, `Resource`), optionally anchored to internal elements belonging to those respective actors.
4. **piStar Compatibility**: Import must gracefully accommodate legacy piStar v2 JSON files (including minor warnings) and preserve visual coordinates and IDs round-trip.
