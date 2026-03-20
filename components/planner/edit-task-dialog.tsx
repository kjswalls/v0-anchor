'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

interface EditTaskDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTaskDialog({ task, open, onOpenChange }: EditTaskDialogProps) {
  const { updateTask, deleteTask, scheduleTask, unscheduleTask, projects } = usePlannerStore();
  
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority | 'none'>('none');
  const [project, setProject] = useState<string>('none');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [duration, setDuration] = useState<string>('30');
  const [timeBucket, setTimeBucket] = useState<TimeBucket | 'none'>('none');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('none');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setPriority(task.priority || 'none');
      setProject(task.project || 'none');
      setDueDate(task.dueDate ? new Date(task.dueDate) : undefined);
      setDuration(task.duration?.toString() || '30');
      setTimeBucket(task.timeBucket || 'none');
      setScheduledTime(task.scheduledTime || '');
      setRepeatFrequency(task.repeatFrequency || 'none');
      setRepeatDays(task.repeatDays || []);
    }
  }, [task]);

  const toggleDay = (day: number) => {
    if (repeatDays.includes(day)) {
      setRepeatDays(repeatDays.filter((d) => d !== day));
    } else {
      setRepeatDays([...repeatDays, day].sort());
    }
  };

  const handleSave = () => {
    if (!task || !title.trim()) return;
    
    updateTask(task.id, {
      title: title.trim(),
      priority: priority === 'none' ? undefined : priority,
      project: project === 'none' ? undefined : project,
      dueDate,
      duration: duration ? parseInt(duration) : undefined,
      scheduledTime: scheduledTime || undefined,
      repeatFrequency: repeatFrequency !== 'none' ? repeatFrequency : undefined,
      repeatDays: repeatFrequency === 'custom' ? repeatDays : undefined,
    });

    // Handle scheduling
    if (timeBucket !== 'none' && timeBucket !== task.timeBucket) {
      scheduleTask(task.id, timeBucket, scheduledTime || undefined);
    } else if (timeBucket === 'none' && task.isScheduled) {
      unscheduleTask(task.id);
    } else if (task.isScheduled && scheduledTime !== task.scheduledTime) {
      updateTask(task.id, { scheduledTime: scheduledTime || undefined });
    }
    
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!task) return;
    deleteTask(task.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card">
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
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-background border-border',
                      !dueDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'MMM d') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
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
