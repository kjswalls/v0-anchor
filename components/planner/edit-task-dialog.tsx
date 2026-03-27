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
        className="w-[calc(100vw-2rem)] max-w-[425px] bg-card max-h-[85vh] overflow-y-auto overflow-x-hidden"
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
        
        <div className="py-4 w-full overflow-hidden">
          {/* Title */}
          <div className="space-y-1.5 mb-5">
            <Label htmlFor="edit-task-title" className="text-xs text-muted-foreground">Title</Label>
            <Input
              id="edit-task-title"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background border-border text-base h-11"
              autoFocus
            />
          </div>

          {/* Organization Section */}
          <div className="space-y-3 pb-4 mb-4 border-b border-border/50">
            <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Organization</p>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority | 'none')}>
                  <SelectTrigger className="w-full bg-background border-border h-9 text-sm truncate">
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
              
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Project</Label>
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
                      className="bg-background border-border flex-1 h-9 text-sm"
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
                    <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
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
          </div>

          {/* Scheduling Section */}
          <div className="space-y-3 pb-4 mb-4 border-b border-border/50">
            <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Scheduling</p>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal bg-background border-border h-9 text-sm px-2',
                        !startDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{startDate ? format(startDate, 'MMM d') : 'None'}</span>
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
              
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Select value={timeBucket} onValueChange={(v) => setTimeBucket(v as TimeBucket | 'none')}>
                  <SelectTrigger className="w-full bg-background border-border h-9 text-sm truncate">
                    <SelectValue placeholder="None" />
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

              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="w-full bg-background border-border h-9 text-sm truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="90">1.5 hours</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {timeBucket !== 'none' && timeBucket !== 'anytime' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Specific Time (optional)</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="bg-background border-border h-9 text-sm w-32"
                />
              </div>
            )}
          </div>

          {/* Repeat Section */}
          <div className="space-y-3">
            <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Repeat</p>
            <Select value={repeatFrequency} onValueChange={(v) => setRepeatFrequency(v as RepeatFrequency)}>
              <SelectTrigger className="bg-background border-border h-9 text-sm w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REPEAT_FREQUENCY_LABELS)
                  .filter(([value]) => value !== 'weekly')
                  .map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(repeatFrequency === 'weekly' || repeatFrequency === 'custom') && (
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(index)}
                    className={cn(
                      'w-8 h-8 rounded-md text-xs font-medium transition-colors',
                      repeatDays.includes(index)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}

            {repeatFrequency === 'monthly' && (
              <div className="space-y-2">
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setRepeatMonthDay(day)}
                      className={cn(
                        'w-7 h-7 rounded text-xs font-medium transition-colors',
                        repeatMonthDay === day
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
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
        </div>
        
        <DialogFooter className="flex flex-row justify-between items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete task</span>
          </Button>
          <Button onClick={handleSave} className="flex-1 min-w-0">
            Save Changes
          </Button>
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
