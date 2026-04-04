import { z } from 'zod';
// ── Primitives ─────────────────────────────────────────────────────────────────
export const PrioritySchema = z.enum(['low', 'medium', 'high']);
export const TimeBucketSchema = z.enum(['anytime', 'morning', 'afternoon', 'evening']);
export const TaskStatusSchema = z.enum(['pending', 'completed', 'cancelled']);
export const HabitStatusSchema = z.enum(['pending', 'done', 'skipped']);
export const RepeatFrequencySchema = z.enum([
    'none', 'daily', 'weekly', 'weekdays', 'weekends', 'monthly', 'custom',
]);
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
export const TaskSchema = z.object({
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
    repeatFrequency: RepeatFrequencySchema.optional(),
    repeatDays: z.array(z.number()).optional(),
    repeatMonthDay: z.number().optional(),
    order: z.number(),
    inProjectBlock: z.boolean().optional(),
    previousStartTime: z.string().optional(),
    previousStartDate: z.string().optional(),
});
export const HabitSchema = z.object({
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
    repeatFrequency: RepeatFrequencySchema,
    repeatDays: z.array(z.number()).optional(),
    repeatMonthDay: z.number().optional(),
    timesPerDay: z.number().optional(),
    currentDayCount: z.number().optional(),
});
// ── API response schemas ───────────────────────────────────────────────────────
export const AnchorContextResponseSchema = z.object({
    userId: z.string(),
    userTimezone: z.string().optional(),
    fetchedAt: z.string(),
    tasks: z.array(TaskSchema),
    habits: z.array(HabitSchema),
    projects: z.array(ProjectSchema),
    habitGroups: z.array(HabitGroupSchema),
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