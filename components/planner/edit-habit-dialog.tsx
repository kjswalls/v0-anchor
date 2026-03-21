'use client';

import { useState, useEffect } from 'react';
import { Trash2, Flame, RotateCcw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { usePlannerStore } from '@/lib/planner-store';
import type { Habit, HabitGroup, TimeBucket, RepeatFrequency } from '@/lib/types'; // v4
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS, EMOJI_OPTIONS } from '@/lib/types'; // v4
import { cn } from '@/lib/utils';

interface EditHabitDialogProps {
  habit: Habit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditHabitDialog({ habit, open, onOpenChange }: EditHabitDialogProps) {
  const { updateHabit, deleteHabit, scheduleHabit, resetHabitStreak, habitGroups, addHabitGroup } = usePlannerStore();
  
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState<HabitGroup>('wellness');
  const [timeBucket, setTimeBucket] = useState<TimeBucket | 'none'>('none');
  const [startTime, setStartTime] = useState<string>('');
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('daily');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [timesPerDay, setTimesPerDay] = useState<string>('1');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // New group state
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState('');

  useEffect(() => {
    if (habit) {
      setTitle(habit.title);
      setGroup(habit.group);
      setTimeBucket(habit.timeBucket || 'none');
      setStartTime(habit.startTime || '');
      setRepeatFrequency(habit.repeatFrequency);
      setRepeatDays(habit.repeatDays || []);
      setTimesPerDay(habit.timesPerDay?.toString() || '1');
      setShowNewGroup(false);
      setNewGroupName('');
      setNewGroupEmoji('');
    }
  }, [habit]);

  const toggleDay = (day: number) => {
    if (repeatDays.includes(day)) {
      setRepeatDays(repeatDays.filter((d) => d !== day));
    } else {
      setRepeatDays([...repeatDays, day].sort());
    }
  };

  const handleAddNewGroup = () => {
    if (newGroupName.trim()) {
      addHabitGroup(newGroupName.trim(), newGroupEmoji || '');
      setGroup(newGroupName.trim());
      setShowNewGroup(false);
      setNewGroupName('');
      setNewGroupEmoji('');
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
      startTime: startTime || undefined,
    });

    // Handle scheduling
    if (timeBucket !== 'none') {
      scheduleHabit(habit.id, timeBucket, startTime || undefined);
    } else {
      updateHabit(habit.id, { timeBucket: undefined, startTime: undefined });
    }
    
    onOpenChange(false);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    if (!habit) return;
    deleteHabit(habit.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const handleResetStreak = () => {
    if (!habit) return;
    resetHabitStreak(habit.id);
    setShowResetConfirm(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] bg-card max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Habit</DialogTitle>
            <DialogDescription className="sr-only">
              Edit the details of your habit including title, group, and repeat schedule.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Streak Display */}
            {habit && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20">
                <div className="flex items-center gap-2">
                  <Flame className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Current Streak</p>
                    <p className="text-2xl font-bold text-orange-500">{habit.streak} days</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setShowResetConfirm(true)}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>
            )}

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
                {showNewGroup ? (
                  <div className="flex gap-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0">
                          <span>{newGroupEmoji || '+'}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2">
                        <div className="grid grid-cols-6 gap-1">
                          {EMOJI_OPTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              className={cn(
                                'w-8 h-8 rounded hover:bg-secondary flex items-center justify-center',
                                newGroupEmoji === emoji && 'bg-secondary ring-1 ring-primary'
                              )}
                              onClick={() => setNewGroupEmoji(emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Input
                      placeholder="Name"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="bg-background border-border flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddNewGroup()}
                    />
                    <Button size="icon" className="h-9 w-9" onClick={handleAddNewGroup}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Select value={group} onValueChange={(v) => {
                    if (v === '__new__') {
                      setShowNewGroup(true);
                    } else {
                      setGroup(v as HabitGroup);
                    }
                  }}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {habitGroups.map((g) => (
                        <SelectItem key={g.name} value={g.name}>
                          <span>{g.emoji} <span className="capitalize">{g.name}</span></span>
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__" className="text-primary">
                        <Plus className="h-3 w-3 inline mr-1" />
                        New Group
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
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
                  {Object.entries(REPEAT_FREQUENCY_LABELS)
                    .filter(([value]) => value !== 'none')
                    .map(([value, label]) => (
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
                <Label className="text-sm text-muted-foreground">Start Time</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
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

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Streak?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset your streak to 0 days and clear all completion history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetStreak} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reset Streak
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Habit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{habit?.title}" and all its history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
