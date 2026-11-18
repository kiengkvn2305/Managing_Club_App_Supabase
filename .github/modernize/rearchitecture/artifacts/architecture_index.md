# Architecture implementation index

This index is not the full contract. Do not implement from this file alone; follow the artifact paths below.

## Global artifacts

- `unit_graph.yaml` — unit boundaries, source anchors, dependencies and shared references.
- `migration_boundary.yaml` — implementation scope. `must_rewrite` is authoritative; `source_anchors` are not blanket rewrite targets.
- `wire_contracts.yaml` — filter rows by `unit`; frozen contracts and target mappings.
- `shared_modules.yaml` — filter `used_by_units`; `shared_refs.used_fields` is a whitelist.
- `cross_unit_state.yaml` — filter flows by writer/reader unit; runtime-confirm unmatched flows.
- `seams.yaml` — the declared Laravel freeze and protocol bridge; do not refactor the frozen side.
- `project-structure.md`, `tech-stack.md`, `data-model.md` — global source facts and entity inventory.

## Implementation Guide

Every unit below must read its behavior, bindings and decomposition artifacts before code changes. Filter `wire_contracts.yaml` by `unit`, `shared_modules.yaml` by `used_by_units`, `cross_unit_state.yaml` by writer/reader, and `seams.yaml` by `cut_between`.

| Unit | External trigger | Per-unit artifacts | Completion evidence |
|---|---|---|---|
| auth | `/auth/*` | `units/auth/{behavior,bindings,unit_decomposition}.yaml` | Auth mapping, error states, session refresh and auth tests |
| club-access | club membership middleware/invitation | `units/club-access/{behavior,bindings,unit_decomposition}.yaml` | RLS membership and invitation replay/expiry tests |
| clubs | clubs/teams/dashboard API | `units/clubs/{behavior,bindings,unit_decomposition}.yaml` | Multi-club and soft archive evidence |
| membership | club membership API | `units/membership/{behavior,bindings,unit_decomposition}.yaml` | Owner-only title update evidence |
| board | board member/rate API | `units/board/{behavior,bindings,unit_decomposition}.yaml` | Board membership/dues isolation evidence |
| roster | player profile API | `units/roster/{behavior,bindings,unit_decomposition}.yaml` | CRUD, multi-team and IDOR tests |
| finance | ledger/planned expense API | `units/finance/{behavior,bindings,unit_decomposition}.yaml` | RPC transaction, replay and concurrent write tests |
| dues | dues/rate/correction API | `units/dues/{behavior,bindings,unit_decomposition}.yaml` | Atomic income/entry correction tests |
| activities | activities/training/award API | `units/activities/{behavior,bindings,unit_decomposition}.yaml` | Approval/attendance behavior tests |
| discovery | discovery/friendly API | `units/discovery/{behavior,bindings,unit_decomposition}.yaml` | Public-only data and cross-club invitation tests |
| matches | match API | `units/matches/{behavior,bindings,unit_decomposition}.yaml` | Calendar, score and tenant tests |
| lineups | lineup API | `units/lineups/{behavior,bindings,unit_decomposition}.yaml` | Team/player validation tests |
| attendance-stats | attendance/stats/cost API | `units/attendance-stats/{behavior,bindings,unit_decomposition}.yaml` | Match attendance/statistics tests |
| inventory | stock/assignment API | `units/inventory/{behavior,bindings,unit_decomposition}.yaml` | Row-lock stock and assignment tests |
| polls | poll/vote API | `units/polls/{behavior,bindings,unit_decomposition}.yaml` | One-vote and tenant tests |
| recruitment | recruitment API | `units/recruitment/{behavior,bindings,unit_decomposition}.yaml` | Post/application visibility tests |
| sponsorship | sponsors/receipts API | `units/sponsorship/{behavior,bindings,unit_decomposition}.yaml` | Informational receipt isolation tests |
| discipline | discipline/history API | `units/discipline/{behavior,bindings,unit_decomposition}.yaml` | Immutable history and tenant tests |
| profile-images | image/storage API | `units/profile-images/{behavior,bindings,unit_decomposition}.yaml` | Private storage policy tests |
| excel | import/export page operations | `units/excel/{behavior,bindings,unit_decomposition}.yaml` | Formula/date/phone and commit tests |
| pwa | browser/native shell | `units/pwa/{behavior,bindings,unit_decomposition}.yaml` | Build, service-worker exclusion and install checks |

Before DONE, report: `artifacts_read`, every implemented `must_preserve` item, unresolved/deferred contracts, and build/test/runtime evidence. Candidate splits are advisory only; every `unit_decomposition.yaml` has `commit: false`.
