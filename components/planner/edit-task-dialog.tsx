'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, Priority, TimeBucket, RepeatFrequency } from '@/lib/planner-types';
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS, EMOJI_OPTIONS } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

interface EditTaskDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTaskDialog({ task, open, onOpenChange }: EditTaskDialogProps) {
  const { updateTask, deleteTask, scheduleTask, unscheduleTask, projects, addProject } = usePlannerStore();
  
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority | 'none'>('none');
  const [project, setProject] = useState<string>('none');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [duration, setDuration] = useState<string>('30');
  const [timeBucket, setTimeBucket] = useState<TimeBucket | 'none'>('none');
  const [startTime, setStartTime] = useState<string>('');
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('none');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatMonthDay, setRepeatMonthDay] = useState<number>(1);
  
  // New project state
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectEmoji, setNewProjectEmoji] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setPriority(task.priority || 'none');
      setProject(task.project || 'none');
      // Parse date string as local date, not UTC
      // "2026-03-22" should be March 22 local time, not UTC midnight which shows as March 21
      if (task.startDate) {
        // startDate is always a string; handle legacy ISO format just in case
        const dateStr = task.startDate.includes('T')
          ? task.startDate.split('T')[0]
          : task.startDate;
        const [year, month, day] = dateStr.split('-').map(Number);
        setStartDate(new Date(year, month - 1, day)); // month is 0-indexed
      } else {
        setStartDate(undefined);
      }
      setDuration(task.duration?.toString() || '30');
      setTimeBucket(task.timeBucket || 'none');
      setStartTime(task.startTime || '');
      setRepeatFrequency(task.repeatFrequency || 'none');
      setRepeatDays(task.repeatDays || []);
      setRepeatMonthDay(task.repeatMonthDay || 1);
      setShowNewProject(false);
      setNewProjectName('');
      setNewProjectEmoji('');
    }
  }, [task]);

  const toggleDay = (day: number) => {
    if (repeatDays.includes(day)) {
      setRepeatDays(repeatDays.filter((d) => d !== day));
    } else {
      setRepeatDays([...repeatDays, day].sort());
    }
  };

  const handleAddNewProject = () => {
    if (newProjectName.trim()) {
      addProject(newProjectName.trim(), newProjectEmoji || '');
      setProject(newProjectName.trim());
      setShowNewProject(false);
      setNewProjectName('');
      setNewProjectEmoji('');
    }
  };

  const handleSave = () => {
    if (!task || !title.trim()) return;
    
    // Save date as yyyy-MM-dd string to avoid timezone issues
    const startDateStr = startDate ? format(startDate, 'yyyy-MM-dd') : undefined;
    
    updateTask(task.id, {
      title: title.trim(),
      priority: priority === 'none' ? undefined : priority,
      project: project === 'none' ? undefined : project,
      startDate: startDateStr,
      duration: duration ? parseInt(duration) : undefined,
      startTime: startTime || undefined,
      repeatFrequency: repeatFrequency !== 'none' ? repeatFrequency : undefined,
      repeatDays: (repeatFrequency === 'custom' || repeatFrequency === 'weekly') ? repeatDays : undefined,
      repeatMonthDay: repeatFrequency === 'monthly' ? repeatMonthDay : undefined,
    });

    // Handle scheduling
    if (timeBucket !== 'none' && timeBucket !== task.timeBucket) {
      scheduleTask(task.id, timeBucket, startTime || undefined);
    } else if (timeBucket === 'none' && task.isScheduled) {
      unscheduleTask(task.id);
    } else if (task.isScheduled && startTime !== task.startTime) {
      updateTask(task.id, { startTime: startTime || undefined });
    }
    
    onOpenChange(false);
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    if (!task) return;
    deleteTask(task.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px] bg-card max-h-[85vh] overflow-y-auto"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !(e.target as HTMLElement).closest('[data-sub-input]')) {
            e.preventDefault();
            handleSave();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Task</DialogTitle>
          <DialogDescription className="sr-only">
            Edit the details of your task including title, priority, project, and schedule.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-task-title" className="text-sm text-muted-foreground">Title</Label>
            <Input
              id="edit-task-title"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background border-border"
              autoFocus
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority | 'none')}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Project</Label>
              {showNewProject ? (
                <div className="flex gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0">
                        <span>{newProjectEmoji || '+'}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2">
                      <div className="grid grid-cols-6 gap-1">
                        {EMOJI_OPTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            className={cn(
                              'w-8 h-8 rounded hover:bg-secondary flex items-center justify-center',
                              newProjectEmoji === emoji && 'bg-secondary ring-1 ring-primary'
                            )}
                            onClick={() => setNewProjectEmoji(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input
                    placeholder="Name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="bg-background border-border flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNewProject()}
                  data-sub-input
                  />
                  <Button size="icon" className="h-9 w-9" onClick={handleAddNewProject}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Select value={project} onValueChange={(v) => {
                  if (v === '__new__') {
                    setShowNewProject(true);
                  } else {
                    setProject(v);
                  }
                }}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.emoji} {p.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__" className="text-primary">
                      <Plus className="h-3 w-3 inline mr-1" />
                      New Project
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-background border-border',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'MMM d') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Duration (min)</Label>
              <Input
                type="number"
                placeholder="30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Time Bucket</Label>
              <Select value={timeBucket} onValueChange={(v) => setTimeBucket(v as TimeBucket | 'none')}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Unscheduled" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unscheduled</SelectItem>
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

          {(repeatFrequency === 'weekly' || repeatFrequency === 'custom') && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                {repeatFrequency === 'weekly' ? 'Repeat on' : 'Select days'}
              </Label>
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

          {repeatFrequency === 'monthly' && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Day of month</Label>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setRepeatMonthDay(day)}
                    className={cn(
                      'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                      repeatMonthDay === day
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                For months with fewer days, it will occur on the last day.
              </p>
            </div>
          )}
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

    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Task?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete "{task?.title}". This action cannot be undone.
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
