import { z } from 'zod'

// ── Primitives ─────────────────────────────────────────────────────────────────

export const PrioritySchema = z.enum(['low', 'medium', 'high'])
export const TimeBucketSchema = z.enum(['anytime', 'morning', 'afternoon', 'evening'])
export const TaskStatusSchema = z.enum(['pending', 'completed', 'cancelled'])
export const HabitStatusSchema = z.enum(['pending', 'done', 'skipped'])
export const RepeatFrequencySchema = z.enum([
  'none', 'daily', 'weekdays', 'weekends', 'monthly', 'custom',
])

// Normalize legacy "weekly" (removed in migration 014) to "custom" before enum validation
const normalizeWeekly = (val: unknown) => val === 'weekly' ? 'custom' : val

// Pre-unification schemas silently stripped `notes` as an unknown key, so a
// third-party payload with notes:null must keep parsing — accept and coalesce.
const NotesSchema = z.string().nullish().transform((v) => v ?? undefined)

// ── Shared recurrence fields ───────────────────────────────────────────────────

export const RecurrenceFieldsSchema = z.object({
  repeatFrequency: z.preprocess(normalizeWeekly, RepeatFrequencySchema).optional(),
  repeatDays: z.array(z.number()).optional(),
  repeatMonthDay: z.number().optional(),
  completedDates: z.array(z.string()).optional(),
  // Per-date "not this occurrence" — the skip twin of completedDates, and the
  // ONLY place a skip may live: 'skipped' is not in the task status vocabulary
  // and the OpenClaw plugin throws on drift there (see the habit branch, which
  // has carried this field since before unification). Optional and additive,
  // so a plugin built against the older TaskSchema still parses tasks[] — it
  // strips the key as unknown.
  skippedDates: z.array(z.string()).optional(),
})
export type RecurrenceFields = z.infer<typeof RecurrenceFieldsSchema>

// ── Shared pause fields ────────────────────────────────────────────────────────
// Suppression state for programs & routines (migration 024). It lives here and
// NEVER in `status`: task pending|completed|cancelled and habit
// pending|done|skipped are frozen external contracts — an unknown enum value
// makes the OpenClaw plugin's whole-context safeParse throw and bricks its
// cache. Same shape skippedDates took for per-date skips.
//
// Spread into BOTH taskShape and habitShape below. That is two edit sites, not
// one: habitShape declares its recurrence fields inline and does not consume
// RecurrenceFieldsSchema (compare skippedDates, which appears in both places),
// so a single shared-block edit would silently reach task + custom only.
//
// Additive-optional, so an already-deployed plugin build strips both keys
// rather than rejecting them.
const pauseFields = {
  /**
   * ISO timestamp the pause began. Load-bearing, not decorative: it is the
   * resolver's LOWER bound, without which a pause started in August would
   * retro-suppress every unmarked occurrence back through July.
   */
  pausedAt: z.string().optional(),
  /**
   * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
   * auto-resume needs no cron. A manual resume sets this to today rather than
   * clearing pausedAt, keeping the interval on the row for the auto-age
   * sweep's resume grace.
   */
  pausedUntil: z.string().optional(),
}

// ── Container id (Phase B) ─────────────────────────────────────────────────────
// The stable half of the container reference. `items.project` / `items."group"`
// hold container NAMES, which is exactly why renaming one has been parked since
// unification: a rename orphans every item pointing at the old string.
// `container_id` is the id of the row in `projects` or `habit_groups`; the name
// stays as a mirror for the whole dual-write window, and the legacy tasks[] /
// habits[] projections keep serving it.
//
// ONE field for both kinds, not projectId + groupId, because Project and Habit
// Group are ONE axis with two namespaces (lib/container-registry.ts) — an item
// answers with exactly one container, and which table it lives in is a question
// about the item's TYPE, not about the reference.
//
// Spread into BOTH taskShape and habitShape, which is two edit sites — see the
// pauseFields note above for why a single shared block would reach task + custom
// only.
//
// It has to be IN the shapes rather than beside them: `diffItem`
// (planner-store.ts) iterates `getItemTypeConfig(...).fields`, which is
// Object.keys(taskShape) / Object.keys(habitShape), so a field outside the shape
// never enters an undo patch. Undo would send the old NAME back and leave
// container_id pointing at the new container — success in the UI, a revert on
// the next reload.
//
// Additive-optional, like parentItemId/assignee/aiStatus before it: an
// already-deployed OpenClaw build strips the unknown key rather than rejecting
// the whole projection.
const containerIdField = {
  /** Row id in `projects` or `habit_groups` — which one is decided by the item's type. */
  containerId: z.string().optional(),
}

// custom frequency requires at least one repeat day — shared by every item shape
const requireCustomDays = (
  data: { repeatFrequency?: string | null; repeatDays?: number[] | null },
  ctx: z.RefinementCtx,
) => {
  if (data.repeatFrequency === 'custom' && (!data.repeatDays || data.repeatDays.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Must select at least one day when using custom repeat frequency',
      path: ['repeatDays'],
    });
  }
}

// ── Core entities ──────────────────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  /** CSS color, usually a var(--accent-N) token; unset → name-hash ramp. */
  color: z.string().optional(),
  repeatFrequency: RepeatFrequencySchema.optional(),
  repeatDays: z.array(z.number()).optional(),
  repeatMonthDay: z.number().optional(),
  timeBucket: TimeBucketSchema.optional(),
  startTime: z.string().optional(),
  duration: z.number().optional(),
})

export const HabitGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  color: z.string().optional(),
})

// ── Programs & routines (migration 024) ────────────────────────────────────────
// Collections that gate visibility rather than describe an item. A ROUTINE is a
// small reusable set (a morning routine); a PROGRAM is a period of life (summer,
// school year) holding items and/or routines. Membership is many-to-many and
// referenced BY ID — the older containers (items.project, items."group") hold
// container NAMES, which is exactly why renaming them is still parked.
//
// The member arrays are the app-side view of the join tables; the DB keeps them
// normalized in routine_items / program_items / program_routines.

export const ProgramStateSchema = z.enum(['auto', 'active', 'paused'])

export const RoutineSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** icon:<LucideName> token, matching the container convention. */
  icon: z.string().optional(),
  /** CSS color, usually a var(--accent-N) token; unset → name-hash ramp. */
  color: z.string().optional(),
  sortOrder: z.number().optional(),
  ...pauseFields,
  /** Member item ids (routine_items), in routine-internal order. */
  itemIds: z.array(z.string()),
})

export const ProgramSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  sortOrder: z.number().optional(),
  /**
   * 'auto' follows startsOn/endsOn (no range = always on); 'active'/'paused'
   * are manual overrides that always win, because flipping a program by hand
   * must never be second-guessed by a date. Several programs may be active at
   * once — the resolver unions their members.
   */
  state: ProgramStateSchema,
  /** Inclusive bounds, either end open (yyyy-MM-dd). Only read when state is 'auto'. */
  startsOn: z.string().optional(),
  endsOn: z.string().optional(),
  /** Directly-held item ids (program_items). */
  itemIds: z.array(z.string()),
  /** Held routine ids (program_routines) — their members ride along. */
  routineIds: z.array(z.string()),
  /**
   * Trigger-maintained, READ-ONLY app-side. It exists for one consumer: the
   * overdue sweep's grace (c). A manual `paused` → `active` flip has no
   * recorded date — the tri-state keeps no history — so this is the only
   * evidence that a program recently stopped hiding its members, and without it
   * the morning after someone turns a program back on the sweep unschedules
   * every member at once.
   *
   * Deliberately NOT in db.ts updateProgram's column allowlist: it appears in
   * PROGRAM_FIELDS (which is Object.keys of this shape) and therefore in undo's
   * container diff, where a stale value would otherwise be written back over
   * the trigger's.
   */
  updatedAt: z.string().optional(),
})

// Field shapes are shared between the legacy per-kind schemas (TaskSchema /
// HabitSchema — the pinned external contract the OpenClaw plugin validates
// against) and the unified ItemSchema branches. Task and Habit deliberately
// keep their own status vocabularies; unification happens via the `type`
// discriminator, never by merging enums.

const taskShape = {
  id: z.string(),
  title: z.string(),
  priority: PrioritySchema.optional(),
  project: z.string().optional(),
  ...containerIdField,
  startDate: z.string().optional(),   // yyyy-MM-dd
  status: TaskStatusSchema,
  timeBucket: TimeBucketSchema.optional(),
  startTime: z.string().optional(),   // HH:mm
  duration: z.number().optional(),    // minutes
  isScheduled: z.boolean(),
  order: z.number(),
  inProjectBlock: z.boolean().optional(),
  previousStartTime: z.string().optional(),
  previousStartDate: z.string().optional(),
  notes: NotesSchema,
  // ── Item-surface growth (memory/plans/item-surface-growth.md) ────────────
  // Waking the migration-007/019 future-proofing columns. All four are
  // additive-optional: old plugin builds strip unknown keys, so the pinned
  // legacy projections keep parsing. Reads are deliberately LOOSE strings —
  // constraining aiStatus to an enum here would let a future vocabulary
  // addition brick an old plugin's safeParse; the write-side schemas
  // (TaskUpdateSchema) carry the strict enum instead.
  /** Parent item id — this item is a subtask when set (items.parent_item_id). */
  parentItemId: z.string().optional(),
  /** Who's working this item: 'openclaw' | 'beacon' | free text. */
  assignee: z.string().optional(),
  /** Agent progress state — write vocabulary: queued|working|blocked|done|failed. */
  aiStatus: z.string().optional(),
  /** Agent's latest result/summary for this item. */
  aiResult: z.string().optional(),
  ...RecurrenceFieldsSchema.shape,
  ...pauseFields,
}

const habitShape = {
  id: z.string(),
  title: z.string(),
  group: z.string(),
  ...containerIdField,
  streak: z.number(),
  status: HabitStatusSchema,
  completedDates: z.array(z.string()),
  skippedDates: z.array(z.string()),
  dailyCounts: z.record(z.string(), z.number()),
  timeBucket: TimeBucketSchema.optional(),
  startTime: z.string().optional(),
  // Minutes. Habits carry a length for the same reason tasks do — "30 minutes
  // of reading" is the habit, not a 30-minute default someone has to accept —
  // which is also what makes a habit block resizable on the schedule grid
  // (registry `schedule.resizable`). Optional: a habit with no duration falls
  // back to the type's defaultBlockMinutes, and the column already existed as
  // nullable in `items` (migration 019), so nothing needed backfilling.
  duration: z.number().optional(),    // minutes
  // Required (a habit is recurring by definition); .or().transform() rather
  // than z.preprocess so z.input keeps the field required and enum-typed.
  repeatFrequency: RepeatFrequencySchema
    .or(z.literal('weekly'))
    .transform((v) => v === 'weekly' ? 'custom' as const : v),
  repeatDays: z.array(z.number()).optional(),
  repeatMonthDay: z.number().optional(),
  timesPerDay: z.number().optional(),
  currentDayCount: z.number().optional(),
  notes: NotesSchema,
  ...pauseFields,
}

export const TaskSchema = z.object(taskShape).superRefine(requireCustomDays)
export const HabitSchema = z.object(habitShape).superRefine(requireCustomDays)

// Canonical field lists (schema-derived, so they can never drift from the
// shapes) — used for per-type diffing/patching, e.g. undo/redo sync.
export const TASK_FIELDS = Object.keys(taskShape) as (keyof z.infer<typeof TaskSchema>)[]
export const HABIT_FIELDS = Object.keys(habitShape) as (keyof z.infer<typeof HabitSchema>)[]
export const PROJECT_FIELDS = Object.keys(ProjectSchema.shape) as (keyof z.infer<typeof ProjectSchema>)[]
export const HABIT_GROUP_FIELDS = Object.keys(HabitGroupSchema.shape) as (keyof z.infer<typeof HabitGroupSchema>)[]
export const ROUTINE_FIELDS = Object.keys(RoutineSchema.shape) as (keyof z.infer<typeof RoutineSchema>)[]
export const PROGRAM_FIELDS = Object.keys(ProgramSchema.shape) as (keyof z.infer<typeof ProgramSchema>)[]

// ── Unified Item ───────────────────────────────────────────────────────────────
// One entity, discriminated by `type`. The task/habit branches are structurally
// identical to Task/Habit so projections (item → legacy shape) are plain field
// subsets. User-defined types (goal, …) travel under a CLOSED 'custom'
// envelope with the type's machine name in `customType` — an open type: string
// branch would destroy TypeScript's discriminated narrowing at every
// `item.type === '…'` site in the app. The DB stores the slug itself in
// items.type; the app maps slug ↔ envelope at the row boundary.

const taskItemObject = z.object({ type: z.literal('task'), ...taskShape })
const habitItemObject = z.object({ type: z.literal('habit'), ...habitShape })
const customItemObject = z.object({
  type: z.literal('custom'),
  /** The user-defined type's machine name (item_types.name), e.g. 'goal'. */
  customType: z.string(),
  ...taskShape,
})

export const TaskItemSchema = taskItemObject.superRefine(requireCustomDays)
export const HabitItemSchema = habitItemObject.superRefine(requireCustomDays)
export const CustomItemSchema = customItemObject.superRefine(requireCustomDays)

export const ItemSchema = z
  .discriminatedUnion('type', [taskItemObject, habitItemObject, customItemObject])
  .superRefine(requireCustomDays)

// ── Item type definitions (user-defined types, migration 021) ─────────────────

export const ItemTypeDefSchema = z.object({
  id: z.string(),
  /** Machine name used as items.type — lowercase slug; 'task'/'habit'/'custom' reserved. */
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,31}$/)
    .refine((n) => !['task', 'habit', 'custom'].includes(n), {
      message: 'reserved type name',
    }),
  label: z.string().min(1),
  labelPlural: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  /** Capability overrides of the app-side custom-type template. */
  config: z.record(z.string(), z.unknown()).optional(),
})

// ── Agent API write-body schemas ───────────────────────────────────────────────
// Validate POST/PATCH bodies at the route boundary so bad payloads get a 400
// instead of surfacing as Postgres CHECK-constraint 500s. Unknown keys are
// stripped (Zod default — matches the old field-pick/allowlist behavior).
//
// Update schemas: `null` is accepted only on fields whose DB column is
// nullable, where it means "clear the field" (the db-layer allowlists pass it
// through as a NULL write). Fields with legacy NOT-NULL semantics (title,
// status, habit group/streak/arrays/repeatFrequency) reject null — the old
// routes let those reach Postgres and 500.

const clearable = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional()

// id: null falls through to a server-generated UUID (legacy route behavior).
const OptionalIdSchema = z
  .string()
  .uuid()
  .nullish()
  .transform((v) => v ?? undefined)

/**
 * yyyy-MM-dd, enforced.
 *
 * Deliberately NOT retrofitted onto the older loose fields (`startDate` and
 * friends stay `z.string()`) — tightening those could 400 a deployed agent that
 * has been sending something sloppy-but-workable for months. New fields carry
 * the constraint from birth, and pause/range dates in particular need it: they
 * are compared LEXICALLY against `toDateStr` output, so "Sep 1" or an ISO
 * timestamp does not error, it silently resolves to the wrong side of every
 * boundary.
 */
const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a yyyy-MM-dd date')

/**
 * Pausing, expressed as the VERB the UI offers rather than the two columns it
 * writes.
 *
 * `pausedAt` is absent on purpose and is derived server-side. It is the
 * resolver's lower bound, and a value an agent picks is wrong in both
 * directions: backdated, it retro-suppresses history that actually happened;
 * postdated, the item stays visible and the pause looks like it silently
 * failed. `paused: true/false` cannot be incoherent, so the API only accepts
 * that. See resolvePauseWrite in lib/active.ts for the translation.
 */
const pauseVerbShape = {
  /** true → pause from now; false → resume today. Omit to leave pause state alone. */
  paused: z.boolean().optional(),
  /**
   * Resume date (EXCLUSIVE — live again ON this date). Sent with `paused: true`
   * it sets the end of the pause; sent alone it moves the resume date of a
   * pause already running. `null` means "paused with no end date".
   */
  pausedUntil: clearable(DateOnlySchema),
}

/**
 * `paused: false` says "resume now", which leaves no resume date to set — so a
 * body carrying both is not a partially-honoured request, it is two
 * instructions that contradict. Rejecting beats picking one, because the
 * plausible reading ("resume ON this date") is the one thing it does NOT do.
 */
const rejectResumeWithDate = (
  data: { paused?: boolean | null; pausedUntil?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (data.paused === false && data.pausedUntil !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'pausedUntil cannot accompany paused: false — resuming happens now. ' +
        'To schedule a later resume, send paused: true with pausedUntil.',
      path: ['pausedUntil'],
    })
  }
}

export const TaskCreateSchema = z
  .object({
    ...taskShape,
    id: OptionalIdSchema,
    title: z.string().min(1),
    status: TaskStatusSchema.optional(),
    isScheduled: z.boolean().optional(),
    order: z.number().int().optional(),
    duration: z.number().int().optional(),
    repeatDays: z.array(z.number().int()).optional(),
    repeatMonthDay: z.number().int().optional(),
    // Growth fields are strict at the create boundary too (taskShape's reads
    // stay loose) — a bad uuid or status must 400 here, not 500 at Postgres.
    parentItemId: z.string().uuid().optional(),
    aiStatus: z.enum(['queued', 'working', 'blocked', 'done', 'failed']).optional(),
  })
  // Create schemas SPREAD the shapes, so anything added to taskShape becomes an
  // accepted create-body field automatically (that propagation is how habit
  // `duration` reached the agent API for free). Pause is different: an agent
  // could otherwise POST a born-paused item — invisible on every surface the
  // moment it exists — and the 201 echo would report pause state back. Agent
  // write access to pausing is a deliberate Phase 4 decision, so strip it here.
  // PATCH needs no equivalent: TaskUpdateSchema/HabitUpdateSchema are
  // hand-enumerated and drop unknown keys.
  //
  // containerId is stripped for a different reason than pause, and a firmer one:
  // during dual-write the id and the name are two spellings of one fact, and a
  // body carrying both is a body that can contradict itself. Worse, an id is
  // guessable in a way a name is not — accepting one would let a caller point an
  // item at a container row it has no claim to, and RLS covers `items` rather
  // than the value in that column. Agents send the NAME; the route resolves the
  // id, so there is exactly one writer.
  .omit({ pausedAt: true, pausedUntil: true, containerId: true })
  .superRefine(requireCustomDays)

export const HabitCreateSchema = z
  .object({
    ...habitShape,
    id: OptionalIdSchema,
    title: z.string().min(1),
    group: z.string().optional(),
    streak: z.number().int().optional(),
    // int, like the task side: items.duration is an integer column, so a
    // fractional body should 400 at the boundary rather than 500 on the insert.
    duration: z.number().int().optional(),
    status: HabitStatusSchema.optional(),
    completedDates: z.array(z.string()).optional(),
    skippedDates: z.array(z.string()).optional(),
    dailyCounts: z.record(z.string(), z.number()).optional(),
    repeatFrequency: RepeatFrequencySchema
      .or(z.literal('weekly'))
      .transform((v) => (v === 'weekly' ? ('custom' as const) : v))
      .optional(),
    repeatDays: z.array(z.number().int()).optional(),
    repeatMonthDay: z.number().int().optional(),
    timesPerDay: z.number().int().optional(),
    currentDayCount: z.number().int().optional(),
  })
  // See TaskCreateSchema — neither pause nor containerId is agent-writable.
  .omit({ pausedAt: true, pausedUntil: true, containerId: true })
  .superRefine(requireCustomDays)

// Update schemas keep requireCustomDays too: a PATCH that sets
// repeatFrequency 'custom' (or legacy 'weekly') without non-empty repeatDays
// would store an item the plugin's context safeParse rejects — one bad item
// bricks the WHOLE cached context. The refine can't see stored state, so a
// "switch back to custom, days already stored" patch must resend repeatDays.

export const TaskUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    status: TaskStatusSchema.optional(),
    priority: clearable(PrioritySchema),
    project: clearable(z.string()),
    startDate: clearable(z.string()),
    timeBucket: clearable(TimeBucketSchema),
    startTime: clearable(z.string()),
    duration: clearable(z.number().int()),
    isScheduled: z.boolean().optional(),
    order: z.number().int().optional(),
    inProjectBlock: clearable(z.boolean()),
    previousStartTime: clearable(z.string()),
    previousStartDate: clearable(z.string()),
    notes: clearable(z.string()),
    repeatFrequency: clearable(z.preprocess(normalizeWeekly, RepeatFrequencySchema)),
    repeatDays: clearable(z.array(z.number().int())),
    repeatMonthDay: clearable(z.number().int()),
    completedDates: clearable(z.array(z.string())),
    skippedDates: clearable(z.array(z.string())),
    // Item-surface growth fields — strict on the write side (see taskShape
    // note): agents may only set the pinned aiStatus vocabulary.
    parentItemId: clearable(z.string().uuid()),
    assignee: clearable(z.string()),
    // 'blocked' means the agent is waiting on a decision from the user — added
    // BEFORE anything real writes this vocabulary, because the moment an
    // independently-deployed agent does, renaming a value costs a coordinated
    // release (the plugin safeParses and throws on drift). Growing the set
    // stays cheap forever; the read side is deliberately loose.
    aiStatus: clearable(z.enum(['queued', 'working', 'blocked', 'done', 'failed'])),
    aiResult: clearable(z.string()),
    ...pauseVerbShape,
  })
  .superRefine(requireCustomDays)
  .superRefine(rejectResumeWithDate)

export const HabitUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    status: HabitStatusSchema.optional(),
    group: z.string().optional(),
    streak: z.number().int().optional(),
    completedDates: z.array(z.string()).optional(),
    skippedDates: z.array(z.string()).optional(),
    dailyCounts: z.record(z.string(), z.number()).optional(),
    timeBucket: clearable(TimeBucketSchema),
    startTime: clearable(z.string()),
    // Clearable: items.duration is nullable, so null means "back to the type's
    // default block length" rather than being rejected.
    duration: clearable(z.number().int()),
    repeatFrequency: z.preprocess(normalizeWeekly, RepeatFrequencySchema).optional(),
    repeatDays: clearable(z.array(z.number().int())),
    repeatMonthDay: clearable(z.number().int()),
    timesPerDay: clearable(z.number().int()),
    currentDayCount: clearable(z.number().int()),
    notes: clearable(z.string()),
    ...pauseVerbShape,
  })
  .superRefine(requireCustomDays)
  .superRefine(rejectResumeWithDate)

// ── Agent API: routines & programs ─────────────────────────────────────────────
// Containers are agent-writable from schemaVersion 4. v1 deliberately shipped no
// write surface here (same posture custom types took); the call is that an agent
// acting for the user should reach what the user reaches, and hiding/unhiding a
// block of work is squarely that.
//
// Membership arrives as whole id ARRAYS, not add/remove deltas, matching
// db.ts reconcileMembership and the store. It costs a read-before-write on the
// caller, and buys idempotence: a retried PATCH cannot double-add, and two
// agents converge on the last full state rather than interleaving into a set
// neither asked for.
//
// The composite (id, user_id) foreign keys on the join tables make a
// cross-user member reference impossible at the DB level, so the route's own
// membership checks are about the rules Postgres CANNOT state: a subtask is not
// collectible (plan decision 7), and a 23503 should read as a 400 naming the
// offending id rather than a 500.

const containerIdentityShape = {
  name: z.string().min(1),
  /** icon:<LucideName> token, matching the container convention. */
  icon: clearable(z.string()),
  color: clearable(z.string()),
  sortOrder: clearable(z.number().int()),
}

export const RoutineCreateSchema = z
  .object({
    ...containerIdentityShape,
    id: OptionalIdSchema,
    itemIds: z.array(z.string().uuid()).optional(),
    ...pauseVerbShape,
  })
  .superRefine(rejectResumeWithDate)

export const RoutineUpdateSchema = z
  .object({
    ...containerIdentityShape,
    name: z.string().min(1).optional(),
    itemIds: z.array(z.string().uuid()).optional(),
    ...pauseVerbShape,
  })
  .superRefine(rejectResumeWithDate)

/**
 * An `auto` program whose range starts after it ends is live on no date at all,
 * so it hides every member permanently while reading as "seasonal, currently
 * out of season" — indistinguishable from a program that will come back. The
 * pickers bound each other in the UI; the API has to say so itself.
 */
const rejectInvertedRange = (
  data: { startsOn?: string | null; endsOn?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (data.startsOn && data.endsOn && data.startsOn > data.endsOn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'startsOn must not be after endsOn — that range is active on no date',
      path: ['endsOn'],
    })
  }
}

/**
 * A program does not pause; it switches. Say so instead of dropping the keys.
 *
 * Zod strips unknown keys, which is the right default for a field that means
 * nothing — but `paused` means something everywhere else in this API, so an
 * agent that learned it on routines will reasonably try it here and get
 * 200 {success:true} with the program still live. That is precisely the failure
 * a bare `pausedUntil` on a live item is rejected for: a write with no effect
 * that reports success is how an agent concludes the job is done and moves on.
 * The keys are in the shape ONLY so this refine can see them.
 */
const rejectProgramPauseVerb = (
  data: { paused?: unknown; pausedUntil?: unknown; state?: unknown },
  ctx: z.RefinementCtx,
) => {
  if (data.paused === undefined && data.pausedUntil === undefined) return
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message:
      'programs switch through `state`, not paused/pausedUntil — use ' +
      "state: 'paused' to turn one off, 'active' to force it on, or 'auto' to " +
      'hand it back to its date range.',
    path: ['state'],
  })
}

const programRangeShape = {
  // Present only to be refused with a pointer to `state` — see
  // rejectProgramPauseVerb. z.unknown() rather than the real types so a
  // malformed value still produces THAT message rather than a type error that
  // reads as though the field were supported.
  paused: z.unknown().optional(),
  pausedUntil: z.unknown().optional(),
  /**
   * 'auto' follows the range; 'active'/'paused' are manual overrides that win
   * over it. Omitted on create → 'auto', which with no range means "always on".
   */
  state: ProgramStateSchema.optional(),
  /** Inclusive bounds, either end open. Only read while state is 'auto'. */
  startsOn: clearable(DateOnlySchema),
  endsOn: clearable(DateOnlySchema),
  itemIds: z.array(z.string().uuid()).optional(),
  /** Held routines — their members ride along. */
  routineIds: z.array(z.string().uuid()).optional(),
}

export const ProgramCreateSchema = z
  .object({
    ...containerIdentityShape,
    id: OptionalIdSchema,
    ...programRangeShape,
  })
  .superRefine(rejectInvertedRange)
  .superRefine(rejectProgramPauseVerb)

export const ProgramUpdateSchema = z
  .object({
    ...containerIdentityShape,
    name: z.string().min(1).optional(),
    ...programRangeShape,
  })
  // Sees only what the PATCH carries, so it catches a body that INTRODUCES an
  // inverted range. Half a range patched against a stored other half still
  // reaches the store unchecked — the same limitation requireCustomDays has,
  // and for the same reason: a refine cannot read the row.
  .superRefine(rejectInvertedRange)
  .superRefine(rejectProgramPauseVerb)

// ── API response schemas ───────────────────────────────────────────────────────

export const AnchorContextResponseSchema = z.object({
  userId: z.string(),
  userTimezone: z.string().optional(),
  fetchedAt: z.string(),
  tasks: z.array(TaskSchema),
  habits: z.array(HabitSchema),
  projects: z.array(ProjectSchema),
  habitGroups: z.array(HabitGroupSchema),
  // Unified items (schemaVersion 3+). MUST stay optional: plugin builds parse
  // the whole response with one safeParse and would brick the cache against an
  // older server if this were required. Old builds strip it as an unknown key.
  items: z.array(ItemSchema).optional(),
  // The containers that decide whether an item is suppressed (schemaVersion 4+).
  // Same optionality rule as items[], and for a second reason here: the route
  // OMITS these keys when the tables are unreachable, because `[]` would assert
  // "you have no programs" to a consumer that might helpfully offer to create
  // one. Absent means "this server did not say".
  routines: z.array(RoutineSchema).optional(),
  programs: z.array(ProgramSchema).optional(),
  // Additive (old clients strip unknown keys). 2 = tasks/habits are
  // projections of the unified items table; 3 = items[] present; 4 = routines[]
  // and programs[] present, so a consumer can explain WHY an item it remembers
  // is missing from tasks[] instead of concluding it was deleted.
  schemaVersion: z.number().optional(),
})

export const AnchorChangeEventSchema = z.object({
  event: z.enum([
    'tasks.updated',
    'habits.updated',
    'projects.updated',
    'habitGroups.updated',
  ]),
  userId: z.string(),
  data: z.unknown(),
  timestamp: z.string(),
})
