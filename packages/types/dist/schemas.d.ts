import { z } from 'zod';
export declare const PrioritySchema: z.ZodEnum<["low", "medium", "high"]>;
export declare const TimeBucketSchema: z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>;
export declare const TaskStatusSchema: z.ZodEnum<["pending", "completed", "cancelled"]>;
export declare const HabitStatusSchema: z.ZodEnum<["pending", "done", "skipped"]>;
export declare const RepeatFrequencySchema: z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>;
export declare const RecurrenceFieldsSchema: z.ZodObject<{
    repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
}, {
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
}>;
export type RecurrenceFields = z.infer<typeof RecurrenceFieldsSchema>;
export declare const ProjectSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    emoji: z.ZodString;
    /** CSS color, usually a var(--accent-N) token; unset → name-hash ramp. */
    color: z.ZodOptional<z.ZodString>;
    repeatFrequency: z.ZodOptional<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>>;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    emoji: string;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    color?: string | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
}, {
    id: string;
    name: string;
    emoji: string;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    color?: string | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
}>;
export declare const HabitGroupSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    emoji: z.ZodString;
    color: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    emoji: string;
    color?: string | undefined;
}, {
    id: string;
    name: string;
    emoji: string;
    color?: string | undefined;
}>;
export declare const ProgramStateSchema: z.ZodEnum<["auto", "active", "paused"]>;
export declare const RoutineSchema: z.ZodObject<{
    /** Member item ids (routine_items), in routine-internal order. */
    itemIds: z.ZodArray<z.ZodString, "many">;
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    name: z.ZodString;
    /** icon:<LucideName> token, matching the container convention. */
    icon: z.ZodOptional<z.ZodString>;
    /** CSS color, usually a var(--accent-N) token; unset → name-hash ramp. */
    color: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    itemIds: string[];
    color?: string | undefined;
    icon?: string | undefined;
    sortOrder?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
}, {
    id: string;
    name: string;
    itemIds: string[];
    color?: string | undefined;
    icon?: string | undefined;
    sortOrder?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
}>;
export declare const ProgramSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    icon: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    /**
     * 'auto' follows startsOn/endsOn (no range = always on); 'active'/'paused'
     * are manual overrides that always win, because flipping a program by hand
     * must never be second-guessed by a date. Several programs may be active at
     * once — the resolver unions their members.
     */
    state: z.ZodEnum<["auto", "active", "paused"]>;
    /** Inclusive bounds, either end open (yyyy-MM-dd). Only read when state is 'auto'. */
    startsOn: z.ZodOptional<z.ZodString>;
    endsOn: z.ZodOptional<z.ZodString>;
    /** Directly-held item ids (program_items). */
    itemIds: z.ZodArray<z.ZodString, "many">;
    /** Held routine ids (program_routines) — their members ride along. */
    routineIds: z.ZodArray<z.ZodString, "many">;
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
    updatedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    itemIds: string[];
    state: "auto" | "active" | "paused";
    routineIds: string[];
    color?: string | undefined;
    icon?: string | undefined;
    sortOrder?: number | undefined;
    startsOn?: string | undefined;
    endsOn?: string | undefined;
    updatedAt?: string | undefined;
}, {
    id: string;
    name: string;
    itemIds: string[];
    state: "auto" | "active" | "paused";
    routineIds: string[];
    color?: string | undefined;
    icon?: string | undefined;
    sortOrder?: number | undefined;
    startsOn?: string | undefined;
    endsOn?: string | undefined;
    updatedAt?: string | undefined;
}>;
export declare const TaskSchema: z.ZodEffects<z.ZodObject<{
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    id: z.ZodString;
    title: z.ZodString;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    project: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["pending", "completed", "cancelled"]>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    isScheduled: z.ZodBoolean;
    order: z.ZodNumber;
    inProjectBlock: z.ZodOptional<z.ZodBoolean>;
    previousStartTime: z.ZodOptional<z.ZodString>;
    previousStartDate: z.ZodOptional<z.ZodString>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    /** Parent item id — this item is a subtask when set (items.parent_item_id). */
    parentItemId: z.ZodOptional<z.ZodString>;
    /** Who's working this item: 'openclaw' | 'beacon' | free text. */
    assignee: z.ZodOptional<z.ZodString>;
    /** Agent progress state — write vocabulary: queued|working|blocked|done|failed. */
    aiStatus: z.ZodOptional<z.ZodString>;
    /** Agent's latest result/summary for this item. */
    aiResult: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}, {
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}>, {
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}, {
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}>;
export declare const HabitSchema: z.ZodEffects<z.ZodObject<{
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    title: z.ZodString;
    group: z.ZodString;
    streak: z.ZodNumber;
    status: z.ZodEnum<["pending", "done", "skipped"]>;
    completedDates: z.ZodArray<z.ZodString, "many">;
    skippedDates: z.ZodArray<z.ZodString, "many">;
    dailyCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    repeatFrequency: z.ZodEffects<z.ZodUnion<[z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, z.ZodLiteral<"weekly">]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly">;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    timesPerDay: z.ZodOptional<z.ZodNumber>;
    currentDayCount: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}, {
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | null | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}>, {
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}, {
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | null | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}>;
export declare const TASK_FIELDS: (keyof z.infer<typeof TaskSchema>)[];
export declare const HABIT_FIELDS: (keyof z.infer<typeof HabitSchema>)[];
export declare const PROJECT_FIELDS: (keyof z.infer<typeof ProjectSchema>)[];
export declare const HABIT_GROUP_FIELDS: (keyof z.infer<typeof HabitGroupSchema>)[];
export declare const ROUTINE_FIELDS: (keyof z.infer<typeof RoutineSchema>)[];
export declare const PROGRAM_FIELDS: (keyof z.infer<typeof ProgramSchema>)[];
export declare const TaskItemSchema: z.ZodEffects<z.ZodObject<{
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    id: z.ZodString;
    title: z.ZodString;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    project: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["pending", "completed", "cancelled"]>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    isScheduled: z.ZodBoolean;
    order: z.ZodNumber;
    inProjectBlock: z.ZodOptional<z.ZodBoolean>;
    previousStartTime: z.ZodOptional<z.ZodString>;
    previousStartDate: z.ZodOptional<z.ZodString>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    /** Parent item id — this item is a subtask when set (items.parent_item_id). */
    parentItemId: z.ZodOptional<z.ZodString>;
    /** Who's working this item: 'openclaw' | 'beacon' | free text. */
    assignee: z.ZodOptional<z.ZodString>;
    /** Agent progress state — write vocabulary: queued|working|blocked|done|failed. */
    aiStatus: z.ZodOptional<z.ZodString>;
    /** Agent's latest result/summary for this item. */
    aiResult: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"task">;
}, "strip", z.ZodTypeAny, {
    type: "task";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}, {
    type: "task";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}>, {
    type: "task";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}, {
    type: "task";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}>;
export declare const HabitItemSchema: z.ZodEffects<z.ZodObject<{
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    title: z.ZodString;
    group: z.ZodString;
    streak: z.ZodNumber;
    status: z.ZodEnum<["pending", "done", "skipped"]>;
    completedDates: z.ZodArray<z.ZodString, "many">;
    skippedDates: z.ZodArray<z.ZodString, "many">;
    dailyCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    repeatFrequency: z.ZodEffects<z.ZodUnion<[z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, z.ZodLiteral<"weekly">]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly">;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    timesPerDay: z.ZodOptional<z.ZodNumber>;
    currentDayCount: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    type: z.ZodLiteral<"habit">;
}, "strip", z.ZodTypeAny, {
    type: "habit";
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}, {
    type: "habit";
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | null | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}>, {
    type: "habit";
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}, {
    type: "habit";
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | null | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}>;
export declare const CustomItemSchema: z.ZodEffects<z.ZodObject<{
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    id: z.ZodString;
    title: z.ZodString;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    project: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["pending", "completed", "cancelled"]>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    isScheduled: z.ZodBoolean;
    order: z.ZodNumber;
    inProjectBlock: z.ZodOptional<z.ZodBoolean>;
    previousStartTime: z.ZodOptional<z.ZodString>;
    previousStartDate: z.ZodOptional<z.ZodString>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    /** Parent item id — this item is a subtask when set (items.parent_item_id). */
    parentItemId: z.ZodOptional<z.ZodString>;
    /** Who's working this item: 'openclaw' | 'beacon' | free text. */
    assignee: z.ZodOptional<z.ZodString>;
    /** Agent progress state — write vocabulary: queued|working|blocked|done|failed. */
    aiStatus: z.ZodOptional<z.ZodString>;
    /** Agent's latest result/summary for this item. */
    aiResult: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"custom">;
    /** The user-defined type's machine name (item_types.name), e.g. 'goal'. */
    customType: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "custom";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    customType: string;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}, {
    type: "custom";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    customType: string;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}>, {
    type: "custom";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    customType: string;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}, {
    type: "custom";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    customType: string;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}>;
export declare const ItemSchema: z.ZodEffects<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    id: z.ZodString;
    title: z.ZodString;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    project: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["pending", "completed", "cancelled"]>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    isScheduled: z.ZodBoolean;
    order: z.ZodNumber;
    inProjectBlock: z.ZodOptional<z.ZodBoolean>;
    previousStartTime: z.ZodOptional<z.ZodString>;
    previousStartDate: z.ZodOptional<z.ZodString>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    /** Parent item id — this item is a subtask when set (items.parent_item_id). */
    parentItemId: z.ZodOptional<z.ZodString>;
    /** Who's working this item: 'openclaw' | 'beacon' | free text. */
    assignee: z.ZodOptional<z.ZodString>;
    /** Agent progress state — write vocabulary: queued|working|blocked|done|failed. */
    aiStatus: z.ZodOptional<z.ZodString>;
    /** Agent's latest result/summary for this item. */
    aiResult: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"task">;
}, "strip", z.ZodTypeAny, {
    type: "task";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}, {
    type: "task";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}>, z.ZodObject<{
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    title: z.ZodString;
    group: z.ZodString;
    streak: z.ZodNumber;
    status: z.ZodEnum<["pending", "done", "skipped"]>;
    completedDates: z.ZodArray<z.ZodString, "many">;
    skippedDates: z.ZodArray<z.ZodString, "many">;
    dailyCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    repeatFrequency: z.ZodEffects<z.ZodUnion<[z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, z.ZodLiteral<"weekly">]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly">;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    timesPerDay: z.ZodOptional<z.ZodNumber>;
    currentDayCount: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    type: z.ZodLiteral<"habit">;
}, "strip", z.ZodTypeAny, {
    type: "habit";
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}, {
    type: "habit";
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | null | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}>, z.ZodObject<{
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    id: z.ZodString;
    title: z.ZodString;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    project: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["pending", "completed", "cancelled"]>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    isScheduled: z.ZodBoolean;
    order: z.ZodNumber;
    inProjectBlock: z.ZodOptional<z.ZodBoolean>;
    previousStartTime: z.ZodOptional<z.ZodString>;
    previousStartDate: z.ZodOptional<z.ZodString>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    /** Parent item id — this item is a subtask when set (items.parent_item_id). */
    parentItemId: z.ZodOptional<z.ZodString>;
    /** Who's working this item: 'openclaw' | 'beacon' | free text. */
    assignee: z.ZodOptional<z.ZodString>;
    /** Agent progress state — write vocabulary: queued|working|blocked|done|failed. */
    aiStatus: z.ZodOptional<z.ZodString>;
    /** Agent's latest result/summary for this item. */
    aiResult: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"custom">;
    /** The user-defined type's machine name (item_types.name), e.g. 'goal'. */
    customType: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "custom";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    customType: string;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}, {
    type: "custom";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    customType: string;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}>]>, {
    type: "task";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
} | {
    type: "habit";
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
} | {
    type: "custom";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    customType: string;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}, {
    type: "task";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
} | {
    type: "habit";
    status: "pending" | "done" | "skipped";
    repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
    completedDates: string[];
    skippedDates: string[];
    id: string;
    title: string;
    group: string;
    streak: number;
    dailyCounts: Record<string, number>;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    notes?: string | null | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
} | {
    type: "custom";
    status: "pending" | "completed" | "cancelled";
    id: string;
    title: string;
    isScheduled: boolean;
    order: number;
    customType: string;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    pausedAt?: string | undefined;
    pausedUntil?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: string | undefined;
    aiResult?: string | undefined;
}>;
export declare const ItemTypeDefSchema: z.ZodObject<{
    id: z.ZodString;
    /** Machine name used as items.type — lowercase slug; 'task'/'habit'/'custom' reserved. */
    name: z.ZodEffects<z.ZodString, string, string>;
    label: z.ZodString;
    labelPlural: z.ZodString;
    icon: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    /** Capability overrides of the app-side custom-type template. */
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    label: string;
    labelPlural: string;
    color?: string | undefined;
    icon?: string | undefined;
    config?: Record<string, unknown> | undefined;
}, {
    id: string;
    name: string;
    label: string;
    labelPlural: string;
    color?: string | undefined;
    icon?: string | undefined;
    config?: Record<string, unknown> | undefined;
}>;
export declare const TaskCreateSchema: z.ZodEffects<z.ZodObject<Omit<{
    id: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    title: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<["pending", "completed", "cancelled"]>>;
    isScheduled: z.ZodOptional<z.ZodBoolean>;
    order: z.ZodOptional<z.ZodNumber>;
    duration: z.ZodOptional<z.ZodNumber>;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    parentItemId: z.ZodOptional<z.ZodString>;
    aiStatus: z.ZodOptional<z.ZodEnum<["queued", "working", "blocked", "done", "failed"]>>;
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
    completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    project: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    inProjectBlock: z.ZodOptional<z.ZodBoolean>;
    previousStartTime: z.ZodOptional<z.ZodString>;
    previousStartDate: z.ZodOptional<z.ZodString>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    /** Who's working this item: 'openclaw' | 'beacon' | free text. */
    assignee: z.ZodOptional<z.ZodString>;
    /** Agent's latest result/summary for this item. */
    aiResult: z.ZodOptional<z.ZodString>;
}, "pausedAt" | "pausedUntil">, "strip", z.ZodTypeAny, {
    title: string;
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    id?: string | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | undefined;
    aiResult?: string | undefined;
}, {
    title: string;
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    id?: string | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | undefined;
    aiResult?: string | undefined;
}>, {
    title: string;
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    id?: string | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | undefined;
    aiResult?: string | undefined;
}, {
    title: string;
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: unknown;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    id?: string | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    project?: string | undefined;
    startDate?: string | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | undefined;
    previousStartTime?: string | undefined;
    previousStartDate?: string | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | undefined;
    assignee?: string | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | undefined;
    aiResult?: string | undefined;
}>;
export declare const HabitCreateSchema: z.ZodEffects<z.ZodObject<Omit<{
    id: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    title: z.ZodString;
    group: z.ZodOptional<z.ZodString>;
    streak: z.ZodOptional<z.ZodNumber>;
    duration: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["pending", "done", "skipped"]>>;
    completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    dailyCounts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodUnion<[z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, z.ZodLiteral<"weekly">]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly">>;
    repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    repeatMonthDay: z.ZodOptional<z.ZodNumber>;
    timesPerDay: z.ZodOptional<z.ZodNumber>;
    currentDayCount: z.ZodOptional<z.ZodNumber>;
    /**
     * ISO timestamp the pause began. Load-bearing, not decorative: it is the
     * resolver's LOWER bound, without which a pause started in August would
     * retro-suppress every unmarked occurrence back through July.
     */
    pausedAt: z.ZodOptional<z.ZodString>;
    /**
     * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
     * auto-resume needs no cron. A manual resume sets this to today rather than
     * clearing pausedAt, keeping the interval on the row for the auto-age
     * sweep's resume grace.
     */
    pausedUntil: z.ZodOptional<z.ZodString>;
    timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
    startTime: z.ZodOptional<z.ZodString>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
}, "pausedAt" | "pausedUntil">, "strip", z.ZodTypeAny, {
    title: string;
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    id?: string | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    notes?: string | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}, {
    title: string;
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    id?: string | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    notes?: string | null | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}>, {
    title: string;
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    id?: string | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    notes?: string | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}, {
    title: string;
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly" | undefined;
    repeatDays?: number[] | undefined;
    repeatMonthDay?: number | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    id?: string | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
    startTime?: string | undefined;
    duration?: number | undefined;
    notes?: string | null | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | undefined;
    currentDayCount?: number | undefined;
}>;
export declare const TaskUpdateSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    /** true → pause from now; false → resume today. Omit to leave pause state alone. */
    paused: z.ZodOptional<z.ZodBoolean>;
    /**
     * Resume date (EXCLUSIVE — live again ON this date). Sent with `paused: true`
     * it sets the end of the pause; sent alone it moves the resume date of a
     * pause already running. `null` means "paused with no end date".
     */
    pausedUntil: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["pending", "completed", "cancelled"]>>;
    priority: z.ZodOptional<z.ZodNullable<z.ZodEnum<["low", "medium", "high"]>>>;
    project: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    startDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    timeBucket: z.ZodOptional<z.ZodNullable<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>>;
    startTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    duration: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    isScheduled: z.ZodOptional<z.ZodBoolean>;
    order: z.ZodOptional<z.ZodNumber>;
    inProjectBlock: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    previousStartTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    previousStartDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    repeatFrequency: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>>;
    repeatDays: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodNumber, "many">>>;
    repeatMonthDay: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    completedDates: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    skippedDates: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    parentItemId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    assignee: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    aiStatus: z.ZodOptional<z.ZodNullable<z.ZodEnum<["queued", "working", "blocked", "done", "failed"]>>>;
    aiResult: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | null | undefined;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | null | undefined;
    skippedDates?: string[] | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    priority?: "low" | "medium" | "high" | null | undefined;
    project?: string | null | undefined;
    startDate?: string | null | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | null | undefined;
    previousStartTime?: string | null | undefined;
    previousStartDate?: string | null | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | null | undefined;
    assignee?: string | null | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | null | undefined;
    aiResult?: string | null | undefined;
}, {
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: unknown;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | null | undefined;
    skippedDates?: string[] | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    priority?: "low" | "medium" | "high" | null | undefined;
    project?: string | null | undefined;
    startDate?: string | null | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | null | undefined;
    previousStartTime?: string | null | undefined;
    previousStartDate?: string | null | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | null | undefined;
    assignee?: string | null | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | null | undefined;
    aiResult?: string | null | undefined;
}>, {
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | null | undefined;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | null | undefined;
    skippedDates?: string[] | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    priority?: "low" | "medium" | "high" | null | undefined;
    project?: string | null | undefined;
    startDate?: string | null | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | null | undefined;
    previousStartTime?: string | null | undefined;
    previousStartDate?: string | null | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | null | undefined;
    assignee?: string | null | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | null | undefined;
    aiResult?: string | null | undefined;
}, {
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: unknown;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | null | undefined;
    skippedDates?: string[] | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    priority?: "low" | "medium" | "high" | null | undefined;
    project?: string | null | undefined;
    startDate?: string | null | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | null | undefined;
    previousStartTime?: string | null | undefined;
    previousStartDate?: string | null | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | null | undefined;
    assignee?: string | null | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | null | undefined;
    aiResult?: string | null | undefined;
}>, {
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | null | undefined;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | null | undefined;
    skippedDates?: string[] | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    priority?: "low" | "medium" | "high" | null | undefined;
    project?: string | null | undefined;
    startDate?: string | null | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | null | undefined;
    previousStartTime?: string | null | undefined;
    previousStartDate?: string | null | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | null | undefined;
    assignee?: string | null | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | null | undefined;
    aiResult?: string | null | undefined;
}, {
    status?: "pending" | "completed" | "cancelled" | undefined;
    repeatFrequency?: unknown;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | null | undefined;
    skippedDates?: string[] | null | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    priority?: "low" | "medium" | "high" | null | undefined;
    project?: string | null | undefined;
    startDate?: string | null | undefined;
    isScheduled?: boolean | undefined;
    order?: number | undefined;
    inProjectBlock?: boolean | null | undefined;
    previousStartTime?: string | null | undefined;
    previousStartDate?: string | null | undefined;
    notes?: string | null | undefined;
    parentItemId?: string | null | undefined;
    assignee?: string | null | undefined;
    aiStatus?: "done" | "queued" | "working" | "blocked" | "failed" | null | undefined;
    aiResult?: string | null | undefined;
}>;
export declare const HabitUpdateSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    /** true → pause from now; false → resume today. Omit to leave pause state alone. */
    paused: z.ZodOptional<z.ZodBoolean>;
    /**
     * Resume date (EXCLUSIVE — live again ON this date). Sent with `paused: true`
     * it sets the end of the pause; sent alone it moves the resume date of a
     * pause already running. `null` means "paused with no end date".
     */
    pausedUntil: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["pending", "done", "skipped"]>>;
    group: z.ZodOptional<z.ZodString>;
    streak: z.ZodOptional<z.ZodNumber>;
    completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    dailyCounts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    timeBucket: z.ZodOptional<z.ZodNullable<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>>;
    startTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    duration: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
    repeatDays: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodNumber, "many">>>;
    repeatMonthDay: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    timesPerDay: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    currentDayCount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    notes?: string | null | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | null | undefined;
    currentDayCount?: number | null | undefined;
}, {
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: unknown;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    notes?: string | null | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | null | undefined;
    currentDayCount?: number | null | undefined;
}>, {
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    notes?: string | null | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | null | undefined;
    currentDayCount?: number | null | undefined;
}, {
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: unknown;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    notes?: string | null | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | null | undefined;
    currentDayCount?: number | null | undefined;
}>, {
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    notes?: string | null | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | null | undefined;
    currentDayCount?: number | null | undefined;
}, {
    status?: "pending" | "done" | "skipped" | undefined;
    repeatFrequency?: unknown;
    repeatDays?: number[] | null | undefined;
    repeatMonthDay?: number | null | undefined;
    completedDates?: string[] | undefined;
    skippedDates?: string[] | undefined;
    timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | null | undefined;
    startTime?: string | null | undefined;
    duration?: number | null | undefined;
    paused?: boolean | undefined;
    pausedUntil?: string | null | undefined;
    title?: string | undefined;
    notes?: string | null | undefined;
    group?: string | undefined;
    streak?: number | undefined;
    dailyCounts?: Record<string, number> | undefined;
    timesPerDay?: number | null | undefined;
    currentDayCount?: number | null | undefined;
}>;
export declare const RoutineCreateSchema: z.ZodEffects<z.ZodObject<{
    /** true → pause from now; false → resume today. Omit to leave pause state alone. */
    paused: z.ZodOptional<z.ZodBoolean>;
    /**
     * Resume date (EXCLUSIVE — live again ON this date). Sent with `paused: true`
     * it sets the end of the pause; sent alone it moves the resume date of a
     * pause already running. `null` means "paused with no end date".
     */
    pausedUntil: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    id: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    itemIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    name: z.ZodString;
    /** icon:<LucideName> token, matching the container convention. */
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    id?: string | undefined;
    color?: string | null | undefined;
    paused?: boolean | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: string | null | undefined;
}, {
    name: string;
    id?: string | null | undefined;
    color?: string | null | undefined;
    paused?: boolean | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: string | null | undefined;
}>, {
    name: string;
    id?: string | undefined;
    color?: string | null | undefined;
    paused?: boolean | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: string | null | undefined;
}, {
    name: string;
    id?: string | null | undefined;
    color?: string | null | undefined;
    paused?: boolean | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: string | null | undefined;
}>;
export declare const RoutineUpdateSchema: z.ZodEffects<z.ZodObject<{
    /** true → pause from now; false → resume today. Omit to leave pause state alone. */
    paused: z.ZodOptional<z.ZodBoolean>;
    /**
     * Resume date (EXCLUSIVE — live again ON this date). Sent with `paused: true`
     * it sets the end of the pause; sent alone it moves the resume date of a
     * pause already running. `null` means "paused with no end date".
     */
    pausedUntil: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodOptional<z.ZodString>;
    itemIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** icon:<LucideName> token, matching the container convention. */
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: boolean | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: string | null | undefined;
}, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: boolean | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: string | null | undefined;
}>, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: boolean | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: string | null | undefined;
}, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: boolean | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: string | null | undefined;
}>;
export declare const ProgramCreateSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    paused: z.ZodOptional<z.ZodUnknown>;
    pausedUntil: z.ZodOptional<z.ZodUnknown>;
    /**
     * 'auto' follows the range; 'active'/'paused' are manual overrides that win
     * over it. Omitted on create → 'auto', which with no range means "always on".
     */
    state: z.ZodOptional<z.ZodEnum<["auto", "active", "paused"]>>;
    /** Inclusive bounds, either end open. Only read while state is 'auto'. */
    startsOn: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    endsOn: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    itemIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Held routines — their members ride along. */
    routineIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    id: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    name: z.ZodString;
    /** icon:<LucideName> token, matching the container convention. */
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    id?: string | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}, {
    name: string;
    id?: string | null | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}>, {
    name: string;
    id?: string | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}, {
    name: string;
    id?: string | null | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}>, {
    name: string;
    id?: string | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}, {
    name: string;
    id?: string | null | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}>;
export declare const ProgramUpdateSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    paused: z.ZodOptional<z.ZodUnknown>;
    pausedUntil: z.ZodOptional<z.ZodUnknown>;
    /**
     * 'auto' follows the range; 'active'/'paused' are manual overrides that win
     * over it. Omitted on create → 'auto', which with no range means "always on".
     */
    state: z.ZodOptional<z.ZodEnum<["auto", "active", "paused"]>>;
    /** Inclusive bounds, either end open. Only read while state is 'auto'. */
    startsOn: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    endsOn: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    itemIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Held routines — their members ride along. */
    routineIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    name: z.ZodOptional<z.ZodString>;
    /** icon:<LucideName> token, matching the container convention. */
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}>, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}>, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}, {
    name?: string | undefined;
    color?: string | null | undefined;
    paused?: unknown;
    icon?: string | null | undefined;
    sortOrder?: number | null | undefined;
    itemIds?: string[] | undefined;
    pausedUntil?: unknown;
    state?: "auto" | "active" | "paused" | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    routineIds?: string[] | undefined;
}>;
export declare const AnchorContextResponseSchema: z.ZodObject<{
    userId: z.ZodString;
    userTimezone: z.ZodOptional<z.ZodString>;
    fetchedAt: z.ZodString;
    tasks: z.ZodArray<z.ZodEffects<z.ZodObject<{
        /**
         * ISO timestamp the pause began. Load-bearing, not decorative: it is the
         * resolver's LOWER bound, without which a pause started in August would
         * retro-suppress every unmarked occurrence back through July.
         */
        pausedAt: z.ZodOptional<z.ZodString>;
        /**
         * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
         * auto-resume needs no cron. A manual resume sets this to today rather than
         * clearing pausedAt, keeping the interval on the row for the auto-age
         * sweep's resume grace.
         */
        pausedUntil: z.ZodOptional<z.ZodString>;
        repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
        repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        repeatMonthDay: z.ZodOptional<z.ZodNumber>;
        completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        id: z.ZodString;
        title: z.ZodString;
        priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        project: z.ZodOptional<z.ZodString>;
        startDate: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<["pending", "completed", "cancelled"]>;
        timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
        startTime: z.ZodOptional<z.ZodString>;
        duration: z.ZodOptional<z.ZodNumber>;
        isScheduled: z.ZodBoolean;
        order: z.ZodNumber;
        inProjectBlock: z.ZodOptional<z.ZodBoolean>;
        previousStartTime: z.ZodOptional<z.ZodString>;
        previousStartDate: z.ZodOptional<z.ZodString>;
        notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
        /** Parent item id — this item is a subtask when set (items.parent_item_id). */
        parentItemId: z.ZodOptional<z.ZodString>;
        /** Who's working this item: 'openclaw' | 'beacon' | free text. */
        assignee: z.ZodOptional<z.ZodString>;
        /** Agent progress state — write vocabulary: queued|working|blocked|done|failed. */
        aiStatus: z.ZodOptional<z.ZodString>;
        /** Agent's latest result/summary for this item. */
        aiResult: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }, {
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: unknown;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | null | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }>, {
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }, {
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: unknown;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | null | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }>, "many">;
    habits: z.ZodArray<z.ZodEffects<z.ZodObject<{
        /**
         * ISO timestamp the pause began. Load-bearing, not decorative: it is the
         * resolver's LOWER bound, without which a pause started in August would
         * retro-suppress every unmarked occurrence back through July.
         */
        pausedAt: z.ZodOptional<z.ZodString>;
        /**
         * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
         * auto-resume needs no cron. A manual resume sets this to today rather than
         * clearing pausedAt, keeping the interval on the row for the auto-age
         * sweep's resume grace.
         */
        pausedUntil: z.ZodOptional<z.ZodString>;
        id: z.ZodString;
        title: z.ZodString;
        group: z.ZodString;
        streak: z.ZodNumber;
        status: z.ZodEnum<["pending", "done", "skipped"]>;
        completedDates: z.ZodArray<z.ZodString, "many">;
        skippedDates: z.ZodArray<z.ZodString, "many">;
        dailyCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
        timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
        startTime: z.ZodOptional<z.ZodString>;
        duration: z.ZodOptional<z.ZodNumber>;
        repeatFrequency: z.ZodEffects<z.ZodUnion<[z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, z.ZodLiteral<"weekly">]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly">;
        repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        repeatMonthDay: z.ZodOptional<z.ZodNumber>;
        timesPerDay: z.ZodOptional<z.ZodNumber>;
        currentDayCount: z.ZodOptional<z.ZodNumber>;
        notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    }, {
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | null | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    }>, {
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    }, {
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | null | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    }>, "many">;
    projects: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        emoji: z.ZodString;
        /** CSS color, usually a var(--accent-N) token; unset → name-hash ramp. */
        color: z.ZodOptional<z.ZodString>;
        repeatFrequency: z.ZodOptional<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>>;
        repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        repeatMonthDay: z.ZodOptional<z.ZodNumber>;
        timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
        startTime: z.ZodOptional<z.ZodString>;
        duration: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        emoji: string;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        color?: string | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
    }, {
        id: string;
        name: string;
        emoji: string;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        color?: string | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
    }>, "many">;
    habitGroups: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        emoji: z.ZodString;
        color: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        emoji: string;
        color?: string | undefined;
    }, {
        id: string;
        name: string;
        emoji: string;
        color?: string | undefined;
    }>, "many">;
    items: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        /**
         * ISO timestamp the pause began. Load-bearing, not decorative: it is the
         * resolver's LOWER bound, without which a pause started in August would
         * retro-suppress every unmarked occurrence back through July.
         */
        pausedAt: z.ZodOptional<z.ZodString>;
        /**
         * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
         * auto-resume needs no cron. A manual resume sets this to today rather than
         * clearing pausedAt, keeping the interval on the row for the auto-age
         * sweep's resume grace.
         */
        pausedUntil: z.ZodOptional<z.ZodString>;
        repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
        repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        repeatMonthDay: z.ZodOptional<z.ZodNumber>;
        completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        id: z.ZodString;
        title: z.ZodString;
        priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        project: z.ZodOptional<z.ZodString>;
        startDate: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<["pending", "completed", "cancelled"]>;
        timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
        startTime: z.ZodOptional<z.ZodString>;
        duration: z.ZodOptional<z.ZodNumber>;
        isScheduled: z.ZodBoolean;
        order: z.ZodNumber;
        inProjectBlock: z.ZodOptional<z.ZodBoolean>;
        previousStartTime: z.ZodOptional<z.ZodString>;
        previousStartDate: z.ZodOptional<z.ZodString>;
        notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
        /** Parent item id — this item is a subtask when set (items.parent_item_id). */
        parentItemId: z.ZodOptional<z.ZodString>;
        /** Who's working this item: 'openclaw' | 'beacon' | free text. */
        assignee: z.ZodOptional<z.ZodString>;
        /** Agent progress state — write vocabulary: queued|working|blocked|done|failed. */
        aiStatus: z.ZodOptional<z.ZodString>;
        /** Agent's latest result/summary for this item. */
        aiResult: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"task">;
    }, "strip", z.ZodTypeAny, {
        type: "task";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }, {
        type: "task";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: unknown;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | null | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }>, z.ZodObject<{
        /**
         * ISO timestamp the pause began. Load-bearing, not decorative: it is the
         * resolver's LOWER bound, without which a pause started in August would
         * retro-suppress every unmarked occurrence back through July.
         */
        pausedAt: z.ZodOptional<z.ZodString>;
        /**
         * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
         * auto-resume needs no cron. A manual resume sets this to today rather than
         * clearing pausedAt, keeping the interval on the row for the auto-age
         * sweep's resume grace.
         */
        pausedUntil: z.ZodOptional<z.ZodString>;
        id: z.ZodString;
        title: z.ZodString;
        group: z.ZodString;
        streak: z.ZodNumber;
        status: z.ZodEnum<["pending", "done", "skipped"]>;
        completedDates: z.ZodArray<z.ZodString, "many">;
        skippedDates: z.ZodArray<z.ZodString, "many">;
        dailyCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
        timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
        startTime: z.ZodOptional<z.ZodString>;
        duration: z.ZodOptional<z.ZodNumber>;
        repeatFrequency: z.ZodEffects<z.ZodUnion<[z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, z.ZodLiteral<"weekly">]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly">;
        repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        repeatMonthDay: z.ZodOptional<z.ZodNumber>;
        timesPerDay: z.ZodOptional<z.ZodNumber>;
        currentDayCount: z.ZodOptional<z.ZodNumber>;
        notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
        type: z.ZodLiteral<"habit">;
    }, "strip", z.ZodTypeAny, {
        type: "habit";
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    }, {
        type: "habit";
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | null | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    }>, z.ZodObject<{
        /**
         * ISO timestamp the pause began. Load-bearing, not decorative: it is the
         * resolver's LOWER bound, without which a pause started in August would
         * retro-suppress every unmarked occurrence back through July.
         */
        pausedAt: z.ZodOptional<z.ZodString>;
        /**
         * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
         * auto-resume needs no cron. A manual resume sets this to today rather than
         * clearing pausedAt, keeping the interval on the row for the auto-age
         * sweep's resume grace.
         */
        pausedUntil: z.ZodOptional<z.ZodString>;
        repeatFrequency: z.ZodOptional<z.ZodEffects<z.ZodEnum<["none", "daily", "weekdays", "weekends", "monthly", "custom"]>, "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom", unknown>>;
        repeatDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        repeatMonthDay: z.ZodOptional<z.ZodNumber>;
        completedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skippedDates: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        id: z.ZodString;
        title: z.ZodString;
        priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        project: z.ZodOptional<z.ZodString>;
        startDate: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<["pending", "completed", "cancelled"]>;
        timeBucket: z.ZodOptional<z.ZodEnum<["anytime", "morning", "afternoon", "evening"]>>;
        startTime: z.ZodOptional<z.ZodString>;
        duration: z.ZodOptional<z.ZodNumber>;
        isScheduled: z.ZodBoolean;
        order: z.ZodNumber;
        inProjectBlock: z.ZodOptional<z.ZodBoolean>;
        previousStartTime: z.ZodOptional<z.ZodString>;
        previousStartDate: z.ZodOptional<z.ZodString>;
        notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | undefined, string | null | undefined>;
        /** Parent item id — this item is a subtask when set (items.parent_item_id). */
        parentItemId: z.ZodOptional<z.ZodString>;
        /** Who's working this item: 'openclaw' | 'beacon' | free text. */
        assignee: z.ZodOptional<z.ZodString>;
        /** Agent progress state — write vocabulary: queued|working|blocked|done|failed. */
        aiStatus: z.ZodOptional<z.ZodString>;
        /** Agent's latest result/summary for this item. */
        aiResult: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"custom">;
        /** The user-defined type's machine name (item_types.name), e.g. 'goal'. */
        customType: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "custom";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        customType: string;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }, {
        type: "custom";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        customType: string;
        repeatFrequency?: unknown;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | null | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }>]>, {
        type: "task";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    } | {
        type: "habit";
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    } | {
        type: "custom";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        customType: string;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }, {
        type: "task";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: unknown;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | null | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    } | {
        type: "habit";
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | null | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    } | {
        type: "custom";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        customType: string;
        repeatFrequency?: unknown;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | null | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }>, "many">>;
    routines: z.ZodOptional<z.ZodArray<z.ZodObject<{
        /** Member item ids (routine_items), in routine-internal order. */
        itemIds: z.ZodArray<z.ZodString, "many">;
        /**
         * ISO timestamp the pause began. Load-bearing, not decorative: it is the
         * resolver's LOWER bound, without which a pause started in August would
         * retro-suppress every unmarked occurrence back through July.
         */
        pausedAt: z.ZodOptional<z.ZodString>;
        /**
         * Resume date (yyyy-MM-dd), EXCLUSIVE — live again ON this date, so
         * auto-resume needs no cron. A manual resume sets this to today rather than
         * clearing pausedAt, keeping the interval on the row for the auto-age
         * sweep's resume grace.
         */
        pausedUntil: z.ZodOptional<z.ZodString>;
        id: z.ZodString;
        name: z.ZodString;
        /** icon:<LucideName> token, matching the container convention. */
        icon: z.ZodOptional<z.ZodString>;
        /** CSS color, usually a var(--accent-N) token; unset → name-hash ramp. */
        color: z.ZodOptional<z.ZodString>;
        sortOrder: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        itemIds: string[];
        color?: string | undefined;
        icon?: string | undefined;
        sortOrder?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
    }, {
        id: string;
        name: string;
        itemIds: string[];
        color?: string | undefined;
        icon?: string | undefined;
        sortOrder?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
    }>, "many">>;
    programs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        icon: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        sortOrder: z.ZodOptional<z.ZodNumber>;
        /**
         * 'auto' follows startsOn/endsOn (no range = always on); 'active'/'paused'
         * are manual overrides that always win, because flipping a program by hand
         * must never be second-guessed by a date. Several programs may be active at
         * once — the resolver unions their members.
         */
        state: z.ZodEnum<["auto", "active", "paused"]>;
        /** Inclusive bounds, either end open (yyyy-MM-dd). Only read when state is 'auto'. */
        startsOn: z.ZodOptional<z.ZodString>;
        endsOn: z.ZodOptional<z.ZodString>;
        /** Directly-held item ids (program_items). */
        itemIds: z.ZodArray<z.ZodString, "many">;
        /** Held routine ids (program_routines) — their members ride along. */
        routineIds: z.ZodArray<z.ZodString, "many">;
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
        updatedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        itemIds: string[];
        state: "auto" | "active" | "paused";
        routineIds: string[];
        color?: string | undefined;
        icon?: string | undefined;
        sortOrder?: number | undefined;
        startsOn?: string | undefined;
        endsOn?: string | undefined;
        updatedAt?: string | undefined;
    }, {
        id: string;
        name: string;
        itemIds: string[];
        state: "auto" | "active" | "paused";
        routineIds: string[];
        color?: string | undefined;
        icon?: string | undefined;
        sortOrder?: number | undefined;
        startsOn?: string | undefined;
        endsOn?: string | undefined;
        updatedAt?: string | undefined;
    }>, "many">>;
    schemaVersion: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    fetchedAt: string;
    tasks: {
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }[];
    habits: {
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    }[];
    projects: {
        id: string;
        name: string;
        emoji: string;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        color?: string | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
    }[];
    habitGroups: {
        id: string;
        name: string;
        emoji: string;
        color?: string | undefined;
    }[];
    userTimezone?: string | undefined;
    items?: ({
        type: "task";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    } | {
        type: "habit";
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    } | {
        type: "custom";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        customType: string;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    })[] | undefined;
    routines?: {
        id: string;
        name: string;
        itemIds: string[];
        color?: string | undefined;
        icon?: string | undefined;
        sortOrder?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
    }[] | undefined;
    programs?: {
        id: string;
        name: string;
        itemIds: string[];
        state: "auto" | "active" | "paused";
        routineIds: string[];
        color?: string | undefined;
        icon?: string | undefined;
        sortOrder?: number | undefined;
        startsOn?: string | undefined;
        endsOn?: string | undefined;
        updatedAt?: string | undefined;
    }[] | undefined;
    schemaVersion?: number | undefined;
}, {
    userId: string;
    fetchedAt: string;
    tasks: {
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: unknown;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | null | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    }[];
    habits: {
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | null | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    }[];
    projects: {
        id: string;
        name: string;
        emoji: string;
        repeatFrequency?: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | undefined;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        color?: string | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
    }[];
    habitGroups: {
        id: string;
        name: string;
        emoji: string;
        color?: string | undefined;
    }[];
    userTimezone?: string | undefined;
    items?: ({
        type: "task";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        repeatFrequency?: unknown;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | null | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    } | {
        type: "habit";
        status: "pending" | "done" | "skipped";
        repeatFrequency: "none" | "daily" | "weekdays" | "weekends" | "monthly" | "custom" | "weekly";
        completedDates: string[];
        skippedDates: string[];
        id: string;
        title: string;
        group: string;
        streak: number;
        dailyCounts: Record<string, number>;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        notes?: string | null | undefined;
        timesPerDay?: number | undefined;
        currentDayCount?: number | undefined;
    } | {
        type: "custom";
        status: "pending" | "completed" | "cancelled";
        id: string;
        title: string;
        isScheduled: boolean;
        order: number;
        customType: string;
        repeatFrequency?: unknown;
        repeatDays?: number[] | undefined;
        repeatMonthDay?: number | undefined;
        completedDates?: string[] | undefined;
        skippedDates?: string[] | undefined;
        timeBucket?: "anytime" | "morning" | "afternoon" | "evening" | undefined;
        startTime?: string | undefined;
        duration?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        project?: string | undefined;
        startDate?: string | undefined;
        inProjectBlock?: boolean | undefined;
        previousStartTime?: string | undefined;
        previousStartDate?: string | undefined;
        notes?: string | null | undefined;
        parentItemId?: string | undefined;
        assignee?: string | undefined;
        aiStatus?: string | undefined;
        aiResult?: string | undefined;
    })[] | undefined;
    routines?: {
        id: string;
        name: string;
        itemIds: string[];
        color?: string | undefined;
        icon?: string | undefined;
        sortOrder?: number | undefined;
        pausedAt?: string | undefined;
        pausedUntil?: string | undefined;
    }[] | undefined;
    programs?: {
        id: string;
        name: string;
        itemIds: string[];
        state: "auto" | "active" | "paused";
        routineIds: string[];
        color?: string | undefined;
        icon?: string | undefined;
        sortOrder?: number | undefined;
        startsOn?: string | undefined;
        endsOn?: string | undefined;
        updatedAt?: string | undefined;
    }[] | undefined;
    schemaVersion?: number | undefined;
}>;
export declare const AnchorChangeEventSchema: z.ZodObject<{
    event: z.ZodEnum<["tasks.updated", "habits.updated", "projects.updated", "habitGroups.updated"]>;
    userId: z.ZodString;
    data: z.ZodUnknown;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    userId: string;
    event: "tasks.updated" | "habits.updated" | "projects.updated" | "habitGroups.updated";
    timestamp: string;
    data?: unknown;
}, {
    userId: string;
    event: "tasks.updated" | "habits.updated" | "projects.updated" | "habitGroups.updated";
    timestamp: string;
    data?: unknown;
}>;
//# sourceMappingURL=schemas.d.ts.map