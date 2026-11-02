# B3-07 — Local Draft Identity Isolation Design

## Status of this document

The findings and requirements below are the original pre-implementation design baseline. The status section at the end records the subsequently authorized remediation, independent verification, and follow-up closure work; historical findings are retained for traceability.

## Static finding

**VERIFIED defect in tracked production call sites:**

- `apps/web/src/features/intake/lib/intake-storage.ts` accepts optional `orgId` and `userId`; key construction omits missing components. Load tries user-scoped key, then organization-only, then generic `otp_active_intake_draft`. Clear removes all three scopes for the supplied organization.
- `use-intake-draft.ts` invokes load/save/clear with `orgId` only.
- `RequirementIntakePage.tsx` also invokes load/save/clear with `context.organizationId` only, despite having authenticated `user` and role context.
- Storage payload may contain original text, description, delivery address/location, site notes, quality/commercial details, attributes, and parser output.
- `AuthProvider.tsx` updates auth session and signs out but does not clear TELL local storage. A protected-route sign-out path directly calls Supabase sign-out.
- `draft-isolation.test.ts` passes user IDs explicitly to storage helpers. It does not test the actual production callers, missing identity behavior, logout, persona switch, or generic fallback.

This proves an unsafe fallback design, not that a specific cross-account recovery event has been observed. Server-side draft authorization remains authoritative and must be independently validated.

## Required key boundary

For any local cache read/write, require a fully resolved identity tuple:

```text
authenticated profile ID
+ owner scope discriminator (organization ID OR personal profile ID)
+ persona/buyer scope where it changes access semantics
+ TELL data namespace and schema version
```

Use an unambiguous canonical encoding/hash rather than delimiter concatenation with ambiguous user-controlled values. If any identity component is absent/unknown, perform no local storage I/O and show an explicit save/recovery status. The server remains the source of truth for persisted drafts and validates owner/role on every fetch/update.

## Account and context transitions

- Keep identity key as a parameter to the storage adapter; do not retrieve current identity from stale closures or infer from organization alone.
- Do not read generic or org-only fallback keys.
- On auth sign-out, session user change, profile change, persona change, or organization switch: cancel in-flight recovery, clear previous account data from component state, and reinitialize only after the new context is authenticated and resolved.
- Do not necessarily delete a still-valid server draft on logout. Local cache cleanup should be narrowly scoped to the prior authenticated identity; do not erase another account's data.
- Multi-tab behavior must not broadcast draft contents. If coordination is required, broadcast only an invalidation/version event.
- Cache expiry/encryption and local-device threat model require privacy/security review. Do not describe browser local storage as secure against same-device access.

## Legacy-key migration/invalidation

The old key may contain valid drafts, so silently discarding it is not acceptable. Do not automatically expose an unscoped legacy payload to the current user.

Recommended safe handling:

1. On upgraded client, never use legacy org-only/generic key for recovery.
2. If a legacy key exists, present a generic notice that an older unsafely scoped local draft may be available, without showing its contents.
3. Offer the user an explicit, authenticated recovery flow that verifies ownership from a server-side draft identity or asks the user to select/claim only after a safe verification path exists. If ownership cannot be proven, do not reveal content; give a clear option to discard it.
4. Delete/expire that exact legacy key after successful verified migration or explicit discard; do not call `localStorage.clear()`.
5. Record no sensitive draft text in logs/telemetry.

Whether an offline-only local draft can be safely claimed after account change is unresolved; do not build a “claim draft” feature without an explicit product/security decision.

## Test acceptance

- Same authenticated profile and same persona/owner scope reloads its own local draft.
- Different profiles in the same organization cannot read, overwrite, or clear each other's cache.
- Same profile switching organization/persona gets a distinct cache and cannot see stale active state.
- Individual (`organization_id = NULL`) keys are distinct by profile.
- Logout followed by another login does not reveal prior memory or storage.
- Missing profile/owner context performs no fallback read/write.
- Legacy generic/org keys are never auto-restored and are not silently destroyed.
- Server API denies unauthorized draft IDs despite guessed IDs/local cache.
- Account switch while fetch is in flight cannot commit old response into new session UI.

## Original design status (pre-implementation)

Design is specified; remediation is not implemented. DEP-04 is not closed until the bounded code package and identity-transition tests are separately authorized and evidenced.

## Implementation and verification update — 2026-11-01

### Authorized remediation implemented

The bounded local implementation now scopes cache keys to authenticated user ID, profile ID, organization ID (nullable), persona, namespace, and key version. Production intake storage callers pass the resolved buyer scope. Missing identity fails closed. Legacy keys are detected but never restored or imported.

The legacy notice now explains that old keys contain no ownership metadata and cannot be attributed reliably. Removal requires browser confirmation and removes all matching legacy intake keys in this browser profile; correctly scoped v2 drafts are preserved. If checking/removal fails, the page displays an unavailable/retry notice rather than silently reporting that no legacy draft exists.

Fetch/create/save async results use a shared production scope guard before applying results, so an operation started for one scope cannot populate the current scope after the key changes.

### Independent verification and follow-up

The independent read-only review found the scoped storage boundary and stale-result guard in source, and confirmed the previously recorded targeted run of two test files and 13 tests. It also identified the need for explicit global-discard confirmation and focused tests for persona-only switches, pending requests, malformed scoped JSON, storage exceptions, and legacy-detection UI behavior. Those follow-ups are the subject of the 2026-11-01 DEP-04 closure update and focused tests.

This remains local browser-cache isolation, not encryption or server authorization. Real-browser logout/login, multi-tab, and server-side ownership/RLS behavior remain outside this package and require separate evidence.
