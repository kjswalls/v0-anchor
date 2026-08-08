// Schemas (Zod) — use for runtime validation
export {
  PrioritySchema,
  TimeBucketSchema,
  TaskStatusSchema,
  HabitStatusSchema,
  RepeatFrequencySchema,
  RecurrenceFieldsSchema,
  ProjectSchema,
  HabitGroupSchema,
  ProgramStateSchema,
  RoutineSchema,
  ProgramSchema,
  TaskSchema,
  HabitSchema,
  TaskItemSchema,
  HabitItemSchema,
  CustomItemSchema,
  ItemSchema,
  ItemTypeDefSchema,
  TaskCreateSchema,
  HabitCreateSchema,
  TaskUpdateSchema,
  HabitUpdateSchema,
  AnchorContextResponseSchema,
  AnchorChangeEventSchema,
} from './schemas.js'

// Schema-derived field lists (values, not types)
export {
  TASK_FIELDS,
  HABIT_FIELDS,
  PROJECT_FIELDS,
  HABIT_GROUP_FIELDS,
  ROUTINE_FIELDS,
  PROGRAM_FIELDS,
} from './schemas.js'

// Types (inferred from schemas — no duplication)
import { z } from 'zod'
import {
  PrioritySchema,
  TimeBucketSchema,
  TaskStatusSchema,
  HabitStatusSchema,
  RepeatFrequencySchema,
  RecurrenceFieldsSchema,
  ProjectSchema,
  HabitGroupSchema,
  ProgramStateSchema,
  RoutineSchema,
  ProgramSchema,
  TaskSchema,
  HabitSchema,
  TaskItemSchema,
  HabitItemSchema,
  CustomItemSchema,
  ItemSchema,
  ItemTypeDefSchema,
  AnchorContextResponseSchema,
  AnchorChangeEventSchema,
} from './schemas.js'

export type Priority         = z.infer<typeof PrioritySchema>
export type TimeBucket       = z.infer<typeof TimeBucketSchema>
export type TaskStatus       = z.infer<typeof TaskStatusSchema>
export type HabitStatus      = z.infer<typeof HabitStatusSchema>
export type RepeatFrequency  = z.infer<typeof RepeatFrequencySchema>
export type RecurrenceFields = z.infer<typeof RecurrenceFieldsSchema>
export type Project          = z.infer<typeof ProjectSchema>
export type HabitGroupType   = z.infer<typeof HabitGroupSchema>
export type ProgramState     = z.infer<typeof ProgramStateSchema>
export type Routine          = z.infer<typeof RoutineSchema>
export type Program          = z.infer<typeof ProgramSchema>
export type Task             = z.infer<typeof TaskSchema>
export type Habit            = z.infer<typeof HabitSchema>
export type TaskItem         = z.infer<typeof TaskItemSchema>
export type HabitItem        = z.infer<typeof HabitItemSchema>
export type CustomItem       = z.infer<typeof CustomItemSchema>
export type Item             = z.infer<typeof ItemSchema>
/** Open — user-defined types widen this to arbitrary slugs (Phase 6). */
export type ItemType         = Item['type']
/** The built-in types with dedicated schema branches and static registry configs. */
export type KnownItemType    = TaskItem['type'] | HabitItem['type']
export type ItemTypeDef      = z.infer<typeof ItemTypeDefSchema>
export type AnchorContextResponse = z.infer<typeof AnchorContextResponseSchema>
export type AnchorChangeEvent     = z.infer<typeof AnchorChangeEventSchema>
