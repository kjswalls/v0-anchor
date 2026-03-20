'use client';

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePlannerStore } from '@/lib/planner-store';
import type { Habit, HabitGroup, TimeBucket, RepeatFrequency } from '@/lib/planner-types';
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

interface EditHabitDialogProps {
  habit: Habit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditHabitDialog({ habit, open, onOpenChange }: EditHabitDialogProps) {
  const { updateHabit, deleteHabit, scheduleHabit } = usePlannerStore();
  
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState<HabitGroup>('wellness');
  const [timeBucket, setTimeBucket] = useState<TimeBucket | 'none'>('none');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('daily');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [timesPerDay, setTimesPerDay] = useState<string>('1');

  useEffect(() => {
    if (habit) {
      setTitle(habit.title);
      setGroup(habit.group);
      setTimeBucket(habit.timeBucket || 'none');
      setScheduledTime(habit.scheduledTime || '');
      setRepeatFrequency(habit.repeatFrequency);
      setRepeatDays(habit.repeatDays || []);
      setTimesPerDay(habit.timesPerDay?.toString() || '1');
    }
  }, [habit]);

  const toggleDay = (day: number) => {
    if (repeatDays.includes(day)) {
      setRepeatDays(repeatDays.filter((d) => d !== day));
    } else {
      setRepeatDays([...repeatDays, day].sort());
    }
  };

  const handleSave = () => {
    if (!habit || !title.trim()) return;
    
    updateHabit(habit.id, {
      title: title.trim(),
      group,
      repeatFrequency,
      repeatDays: repeatFrequency === 'custom' ? repeatDays : undefined,
      timesPerDay: parseInt(timesPerDay) || 1,
      scheduledTime: scheduledTime || undefined,
    });

    // Handle scheduling
    if (timeBucket !== 'none') {
      scheduleHabit(habit.id, timeBucket, scheduledTime || undefined);
    } else {
      updateHabit(habit.id, { timeBucket: undefined, scheduledTime: undefined });
    }
    
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!habit) return;
    deleteHabit(habit.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Habit</DialogTitle>
          <DialogDescription className="sr-only">
            Edit the details of your habit including title, group, and repeat schedule.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-habit-title" className="text-sm text-muted-foreground">Title</Label>
            <Input
              id="edit-habit-title"
              placeholder="What habit to track?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background border-border"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Group</Label>
              <Select value={group} onValueChange={(v) => setGroup(v as HabitGroup)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wellness">Wellness</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Times per day</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={timesPerDay}
                onChange={(e) => setTimesPerDay(e.target.value)}
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Repeat</Label>
            <Select value={repeatFrequency} onValueChange={(v) => setRepeatFrequency(v as RepeatFrequency)}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REPEAT_FREQUENCY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {repeatFrequency === 'custom' && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Select days</Label>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(index)}
                    className={cn(
                      'w-9 h-9 rounded-lg text-xs font-medium transition-colors',
                      repeatDays.includes(index)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Time Bucket</Label>
              <Select value={timeBucket} onValueChange={(v) => setTimeBucket(v as TimeBucket | 'none')}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Anytime" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific bucket</SelectItem>
                  <SelectItem value="anytime">Anytime</SelectItem>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Specific Time</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="bg-background border-border"
                disabled={timeBucket === 'none' || timeBucket === 'anytime'}
              />
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
