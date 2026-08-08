'use client';

import { Clock, Sunrise, Sun, Sunset, ArrowLeftToLine, SkipForward, Trash2, Undo2, ListChecks } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import { useScheduleSheet } from '@/lib/schedule-sheet-store';
import { useSelectionStore } from '@/lib/selection-store';
import { getItemTypeConfig } from '@/lib/item-registry';
import { BUCKET_ORDER } from '@/lib/day-items';
import { isRecurring, isSkippedOnDate, toDateStr } from '@/lib/recurrence';
import type { TimeBucket, Task } from '@/lib/planner-types';

const BUCKET_META: Record<TimeBucket, { label: string; icon: typeof Clock }> = {
  anytime: { label: 'Anytime', icon: Clock },
  morning: { label: 'Morning', icon: Sunrise },
  afternoon: { label: 'Afternoon', icon: Sun },
  evening: { label: 'Evening', icon: Sunset },
};

/**
 * Mobile tap-to-schedule sheet. A row's ellipsis opens it; picking a bucket
 * schedules the item for the currently selected day (tasks) or assigns its
 * bucket (habits) — the same store commands a drop emits, so undo works. Also
 * offers skip/unskip (recurring items of a skippable type), unschedule
 * (scheduled tasks) and delete.
 */
export function ScheduleSheet() {
  const row = useScheduleSheet((s) => s.row);
  const close = useScheduleSheet((s) => s.close);
  const {
    scheduleTask,
    assignHabitToBucket,
    unscheduleTask,
    setItemSkipped,
    deleteTask,
    deleteHabit,
    selectedDate,
    userTimezone,
  } = usePlannerStore();
  const confirm = useUIStore((s) => s.confirm);
  // Mobile multi-select entry: no long-press (that gesture belongs to dnd-kit's
  // TouchSensor drag), so selection is toggled here from the action sheet. Two+
  // selected raises the same bulk bar as desktop.
  const isMultiSelected = useSelectionStore((s) => (row ? s.selectedIds.has(row.item.id) : false));

  const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const task = row?.itemType === 'task' ? (row.item as Task) : null;
  const taskScheduled = !!task && (task.isScheduled || !!task.timeBucket);

  // Skip/unskip lives here because touch has no hover: the row's control
  // cluster is desktop-only, so without this the capability simply does not
  // exist on mobile (#195). Same registry gate the row uses.
  const dateStr = toDateStr(selectedDate, tz);
  const projected = row?.item as { type?: string; customType?: string } | undefined;
  const typeName = projected?.type === 'custom' ? projected.customType! : row?.itemType;
  const canSkip =
    !!row && !!typeName && getItemTypeConfig(typeName).skippable && isRecurring(row.item);
  const isSkipped = canSkip && isSkippedOnDate(row.item, dateStr);

  const schedule = (bucket: TimeBucket) => {
    if (!row) return;
    if (row.itemType === 'task') scheduleTask(row.item.id, bucket, undefined, toDateStr(selectedDate, tz));
    else assignHabitToBucket(row.item.id, bucket);
    close();
  };

  const onDelete = () => {
    if (!row) return;
    const { id, title } = row.item;
    const isTask = row.itemType === 'task';
    close();
    confirm({
      title: `Delete ${isTask ? 'Task' : 'Habit'}?`,
      description: `This will permanently delete "${title}".`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => (isTask ? deleteTask(id) : deleteHabit(id)),
    });
  };

  return (
    <Drawer open={!!row} onOpenChange={(o) => !o && close()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="truncate text-left">{row?.item.title}</DrawerTitle>
        </DrawerHeader>

        <div className="grid grid-cols-2 gap-2 px-4">
          {BUCKET_ORDER.map((b) => {
            const { label, icon: Icon } = BUCKET_META[b];
            return (
              <Button
                key={b}
                variant="outline"
                className="h-16 flex-col gap-1.5"
                onClick={() => schedule(b)}
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">{label}</span>
              </Button>
            );
          })}
        </div>

        <DrawerFooter>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => {
              if (row) useSelectionStore.getState().toggle(row.item.id);
              close();
            }}
          >
            <ListChecks className="mr-2 h-4 w-4" /> {isMultiSelected ? 'Deselect' : 'Select'}
          </Button>
          {canSkip && (
            <Button
              variant="ghost"
              className="justify-start"
              data-testid={isSkipped ? 'sheet-unskip-button' : 'sheet-skip-button'}
              onClick={() => {
                if (row) setItemSkipped(row.item.id, !isSkipped, selectedDate);
                close();
              }}
            >
              {isSkipped ? (
                <>
                  <Undo2 className="mr-2 h-4 w-4" /> Unskip today
                </>
              ) : (
                <>
                  <SkipForward className="mr-2 h-4 w-4" /> Skip today
                </>
              )}
            </Button>
          )}
          {taskScheduled && (
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                if (row) unscheduleTask(row.item.id);
                close();
              }}
            >
              <ArrowLeftToLine className="mr-2 h-4 w-4" /> Move to Braindump
            </Button>
          )}
          <Button variant="ghost" className="justify-start text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
