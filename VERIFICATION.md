# HMS Upgrade Verification Record

## Protected access

On 26 August 2026, an unauthenticated browser session opened the HMS root page and rendered the signed-out **Protected clinical workspace** gate. The page displayed the **Secure sign in** action and did not expose the operational dashboard. A direct unauthenticated request to the protected `hms.overview` procedure also returned HTTP 401 with the expected `Please login (10001)` response.

## Booking logic

The automated scheduling tests verify that availability slots are labeled correctly, booking conflicts are rejected, and requests outside a clinician’s published hours are rejected. The live calendar refreshes its availability query every 15 seconds and invalidates both calendar and overview data after a confirmed booking.

## Persistent mutations

The self-cleaning `scripts/verify-hms-persistence.mjs` verifier executed successfully against the live project database. It confirmed that a newly created patient row persisted, a payment row persisted, and the related bill recalculated to `Partial`; the temporary verification data was then removed and the original bill status restored.

## Build and test status

The final validation passed TypeScript compilation, the production build, and all nine automated tests. The responsive workspace was visually checked at desktop and mobile dimensions, including the authenticated calendar view with real-time availability indicators.

## Account lifecycle and operational edits

On 26 August 2026, the Administrator demonstration account opened the Reports workspace and rendered the **Account lifecycle control** dashboard. The screen displayed account identity, role selection, clinician association, activation state, password-reset controls, and a protected add-account action. The browser-facing account query was then minimized to exclude password hashes, opaque authentication identifiers, and other credential secrets.

The self-cleaning `scripts/verify-account-lifecycle.mjs` verifier passed against the live database. It confirmed account creation, sign-in, deactivation rejection, reactivation, password reset, and cleanup. It also confirmed persistent patient-registration and appointment-detail edits with restoration of the original values. The automated suite passed 22 tests covering account lifecycle authorization and the Admin/Receptionist edit boundaries.

The live Administrator browser session also visibly presented patient-level edit actions and an **Edit patient record** dialog with registration fields, while preserving the separate clinical-record boundary.

### Session-transition regression check

A live Administrator-to-Receptionist transition initially exposed a stale client-cache display issue. This was corrected by clearing HMS-scoped query entries on both credential sign-in and sign-out, without clearing authentication state itself. The final browser check signed in as **Nusrat Jahan** and displayed `receptionist access`, patient and appointment edit controls, Billing, and no Reports or clinical-navigation entries.

### Narrow-screen operational workflows

At a 375 × 812 viewport, the Administrator Reports screen displayed the account lifecycle control without layout loss. Patient and appointment pages also retained their edit controls after a mobile refinement that pins the final action column within horizontally scrollable tables. This keeps the authorized edit actions visible alongside the operational rows on narrow screens.

The final check explicitly signed in as **Amelia Rahman** using the Administrator credential, opened Reports, and then captured the narrow Reports view. The account lifecycle heading, add-account action, managed account entries, and per-account Save controls all remained visible and usable at 375 × 812.

## Appointment naming and safe operational deletion

The appointment calendar now accepts an optional **Appointment name** alongside its required reason. The field is persisted through the booking and edit APIs. The self-cleaning `scripts/verify-safe-deletion.mjs` script passed against the live database: it confirmed appointment-name persistence, deletion of an unlinked temporary appointment and patient registration, and rejected deletion of seeded records with linked financial or clinical history.

Administrator browser verification showed the appointment editor’s optional name field and deletion control, as well as the patient editor’s deletion control. Each action requires explicit confirmation and relies on server-side eligibility checks. At 375 × 812, the booking card retained the appointment-name input while the pinned action columns kept patient and appointment editing controls reachable.

The operational dialogs use a mobile-first stacked action layout (`flex-col-reverse`) that switches to a horizontal arrangement only from the small-screen breakpoint upward. The narrow appointment screen retained the optional name field and edit trigger; the patient editor confirmed the deletion control with the same stacked action treatment. This keeps destructive and save actions within the dialog width rather than relying on the desktop table layout.

The final 375 × 812 interaction opened the appointment editor and confirmed the **Appointment name (optional)** input and **Delete appointment** control inside the dialog. Together with the matching patient-editor check, this completes the narrow-screen review of both operational deletion flows.

## Recoverable archive and Vercel deployment update

Patient and appointment removal is now an archive operation rather than a hard delete. Active registry, calendar, and availability reads exclude archived records; the Archive workspace lists archived patients and appointments and provides role-protected recovery actions. The live `verify-safe-deletion.mjs` verifier passed against the production database, confirming archive visibility isolation, archive-list retrieval, patient and appointment restoration, appointment-name persistence, and protection of clinically or financially linked records.

The Administrator browser workflow displayed the detailed archive confirmation modal. It identifies the selected record, states that it is not permanently removed, explains Archive recovery, warns that clinical/billing history blocks archival, and notes scheduling validation on appointment restoration. The Archive workspace rendered correctly at 375 × 812 alongside the mobile patient registry.

The Vercel configuration was validated with `pnpm build:vercel`: it generates the static Vite output at `dist/public`, provides `api/index.ts` as the Express/tRPC function entrypoint, and declares SPA/API rewrites through `vercel.json`. Final validation passed TypeScript, the managed production build, the Vercel build, the real-database verifier, and 25 automated tests.

For the responsive recovery check, a self-cleaning temporary patient and appointment pair was archived. At 375 × 812, the Archive workspace displayed both records and their visible **Restore** controls. The live Administrator session restored the patient first and then the appointment; the UI confirmed that the patient returned to the active registry and that the appointment was restored after availability validation. The temporary data was then removed by the cleanup helper.

## Supabase PostgreSQL migration

Clinical Ledger was migrated from the MySQL/TiDB Drizzle adapter to Drizzle’s `postgres-js` adapter using a protected Supabase Shared Pooler Transaction mode connection. The runtime disables prepared statements and uses a bounded connection pool to support serverless request concurrency. A connection regression test and a live data-layer regression test both passed against the supplied Supabase project, confirming that role accounts and active HMS records are read from PostgreSQL.

The project now contains a fresh-project PostgreSQL schema at `supabase/migrations/0000_rainy_maelstrom.sql`, a non-destructive reconciliation migration for the populated supplied project at `supabase/migrations/0001_reconcile_existing_supabase.sql`, and idempotent population SQL at `supabase/seed.sql`. The reconciliation and seed scripts were run successfully against the supplied Supabase project without removing existing records.

The completed validation passed TypeScript, both managed and Vercel production builds, 28 automated tests, all three credential-role checks, account lifecycle and operational edit verification, and archive/restore integrity verification. The authenticated Administrator browser session loaded the Supabase-backed Archive workspace, retaining the protected role boundary and responsive recovery interface. The public `auth.me` response was additionally minimized so it omits password hashes and opaque open IDs.

## Streamlined sign-in entry

The signed-out Clinical Ledger page was visually checked after ending the Administrator session. It retains only the secure work-email and password fields with a single **Sign in securely** action. The Manus continuation button, external sign-in divider, demonstration-account role panel, demonstration emails, and demonstration-password guidance are absent. TypeScript, the complete 28-test suite, the managed production build, and the Vercel build all passed after this change.


## Protected account creation repair

The previously reported Administrator account-creation issue was traced through the live browser, tRPC request, and Supabase data layer. A fresh unique account could be inserted, but the pre-fix mutation returned the complete `users` row, including the opaque `openId` and stored `passwordHash`; duplicate email attempts also lacked a stable actionable conflict response. The creation form additionally allowed clinician linkage to remain selected after switching away from the Doctor role, producing a preventable validation error.

The repair now normalizes and pre-checks email uniqueness, maps PostgreSQL unique-violation races to a safe `CONFLICT` response, and returns only the account summary needed by the UI. The clinician selector is cleared and disabled for Administrator and Receptionist roles. No Supabase schema change was required, and the database remains PostgreSQL via the Shared Pooler.

| Check | Result |
| --- | --- |
| Fresh Administrator-created protected account in browser | Passed; the account appeared in the lifecycle table and the success notice was shown. |
| Duplicate email in corrected browser form | Passed; the request returned HTTP 409 with `An account with this email already exists.` and no duplicate account was created. |
| New account authentication, deactivation, reactivation, and password reset | Passed in `scripts/verify-account-lifecycle.mjs`. |
| Response secret minimization | Passed; created-account responses exclude `password`, `passwordHash`, and `openId`, while list responses remain projected. |
| Router regression coverage | Passed; `server/hms.router.test.ts` covers success, safe response fields, duplicate conflict mapping, and non-Admin authorization. |
| Full automated suite | Passed: 29 tests across 12 files. |
| Production/Vercel-compatible build | Passed: Vite client build and Express server bundle. |

The temporary QA account created during browser reproduction was removed from Supabase after verification.
