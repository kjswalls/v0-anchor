import { z } from 'zod';
// ── Primitives ─────────────────────────────────────────────────────────────────
export const PrioritySchema = z.enum(['low', 'medium', 'high']);
export const TimeBucketSchema = z.enum(['anytime', 'morning', 'afternoon', 'evening']);
export const TaskStatusSchema = z.enum(['pending', 'completed', 'cancelled']);
export const HabitStatusSchema = z.enum(['pending', 'done', 'skipped']);
export const RepeatFrequencySchema = z.enum([
    'none', 'daily', 'weekdays', 'weekends', 'monthly', 'custom',
]);
// Normalize legacy "weekly" (removed in migration 014) to "custom" before enum validation
const normalizeWeekly = (val) => val === 'weekly' ? 'custom' : val;
// Pre-unification schemas silently stripped `notes` as an unknown key, so a
// third-party payload with notes:null must keep parsing — accept and coalesce.
const NotesSchema = z.string().nullish().transform((v) => v ?? undefined);
// ── Shared recurrence fields ───────────────────────────────────────────────────
export const RecurrenceFieldsSchema = z.object({
    repeatFrequency: z.preprocess(normalizeWeekly, RepeatFrequencySchema).optional(),
    repeatDays: z.array(z.number()).optional(),
    repeatMonthDay: z.number().optional(),
    completedDates: z.array(z.string()).optional(),
});
// custom frequency requires at least one repeat day — shared by every item shape
const requireCustomDays = (data, ctx) => {
    if (data.repeatFrequency === 'custom' && (!data.repeatDays || data.repeatDays.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Must select at least one day when using custom repeat frequency',
            path: ['repeatDays'],
        });
    }
};
// ── Core entities ──────────────────────────────────────────────────────────────
export const ProjectSchema = z.object({
    id: z.string(),
    name: z.string(),
    emoji: z.string(),
    repeatFrequency: RepeatFrequencySchema.optional(),
    repeatDays: z.array(z.number()).optional(),
    repeatMonthDay: z.number().optional(),
    timeBucket: TimeBucketSchema.optional(),
    startTime: z.string().optional(),
    duration: z.number().optional(),
});
export const HabitGroupSchema = z.object({
    id: z.string(),
    name: z.string(),
    emoji: z.string(),
    color: z.string().optional(),
});
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
    startDate: z.string().optional(), // yyyy-MM-dd
    status: TaskStatusSchema,
    timeBucket: TimeBucketSchema.optional(),
    startTime: z.string().optional(), // HH:mm
    duration: z.number().optional(), // minutes
    isScheduled: z.boolean(),
    order: z.number(),
    inProjectBlock: z.boolean().optional(),
    previousStartTime: z.string().optional(),
    previousStartDate: z.string().optional(),
    notes: NotesSchema,
    ...RecurrenceFieldsSchema.shape,
};
const habitShape = {
    id: z.string(),
    title: z.string(),
    group: z.string(),
    streak: z.number(),
    status: HabitStatusSchema,
    completedDates: z.array(z.string()),
    skippedDates: z.array(z.string()),
    dailyCounts: z.record(z.string(), z.number()),
    timeBucket: TimeBucketSchema.optional(),
    startTime: z.string().optional(),
    // Required (a habit is recurring by definition); .or().transform() rather
    // than z.preprocess so z.input keeps the field required and enum-typed.
    repeatFrequency: RepeatFrequencySchema
        .or(z.literal('weekly'))
        .transform((v) => v === 'weekly' ? 'custom' : v),
    repeatDays: z.array(z.number()).optional(),
    repeatMonthDay: z.number().optional(),
    timesPerDay: z.number().optional(),
    currentDayCount: z.number().optional(),
    notes: NotesSchema,
};
export const TaskSchema = z.object(taskShape).superRefine(requireCustomDays);
export const HabitSchema = z.object(habitShape).superRefine(requireCustomDays);
// Canonical field lists (schema-derived, so they can never drift from the
// shapes) — used for per-type diffing/patching, e.g. undo/redo sync.
export const TASK_FIELDS = Object.keys(taskShape);
export const HABIT_FIELDS = Object.keys(habitShape);
export const PROJECT_FIELDS = Object.keys(ProjectSchema.shape);
export const HABIT_GROUP_FIELDS = Object.keys(HabitGroupSchema.shape);
// ── Unified Item ───────────────────────────────────────────────────────────────
// One entity, discriminated by `type`. Branches are structurally identical to
// Task/Habit so projections (item → legacy shape) are plain field subsets.
// Future user-defined types (goal, …) will widen this union once the item_types
// registry table lands.
const taskItemObject = z.object({ type: z.literal('task'), ...taskShape });
const habitItemObject = z.object({ type: z.literal('habit'), ...habitShape });
export const TaskItemSchema = taskItemObject.superRefine(requireCustomDays);
export const HabitItemSchema = habitItemObject.superRefine(requireCustomDays);
export const ItemSchema = z
    .discriminatedUnion('type', [taskItemObject, habitItemObject])
    .superRefine(requireCustomDays);
// ── API response schemas ───────────────────────────────────────────────────────
export const AnchorContextResponseSchema = z.object({
    userId: z.string(),
    userTimezone: z.string().optional(),
    fetchedAt: z.string(),
    tasks: z.array(TaskSchema),
    habits: z.array(HabitSchema),
    projects: z.array(ProjectSchema),
    habitGroups: z.array(HabitGroupSchema),
    // Additive (old clients strip unknown keys): bump when the response gains
    // shapes beyond the legacy arrays, e.g. the unified items[] in a later phase.
    schemaVersion: z.number().optional(),
});
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
});
//# sourceMappingURL=schemas.js.map