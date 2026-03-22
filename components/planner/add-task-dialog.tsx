'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlannerStore } from '@/lib/planner-store';
import type { Priority, TimeBucket, RepeatFrequency } from '@/lib/planner-types';
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS, EMOJI_OPTIONS } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'task' | 'habit';
  defaultBucket?: TimeBucket;
}

export function AddTaskDialog({ open, onOpenChange, defaultTab = 'task', defaultBucket }: AddTaskDialogProps) {
  const { 
    addTask, addHabit, projects, habitGroups, scheduleTask, 
    addProject, removeProject, addHabitGroup, removeHabitGroup,
    selectedDate
  } = usePlannerStore();
  const [activeTab, setActiveTab] = useState<'task' | 'habit'>(defaultTab);
  
  // Task state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<Priority | undefined>();
  const [taskProject, setTaskProject] = useState<string>('');
  const [taskStartDate, setTaskStartDate] = useState<Date | undefined>(selectedDate);
  const [taskDuration, setTaskDuration] = useState<string>('30');
  const [taskTimeBucket, setTaskTimeBucket] = useState<TimeBucket | undefined>(defaultBucket);
  const [taskStartTime, setTaskStartTime] = useState<string>('');
  const [taskRepeatFrequency, setTaskRepeatFrequency] = useState<RepeatFrequency>('none');
  const [taskRepeatDays, setTaskRepeatDays] = useState<number[]>([]);
  const [taskRepeatMonthDay, setTaskRepeatMonthDay] = useState<number>(1);
  
  // Habit state
  const [habitTitle, setHabitTitle] = useState('');
  const [habitGroup, setHabitGroup] = useState<string>(habitGroups[0]?.name || 'personal');
  const [habitTimeBucket, setHabitTimeBucket] = useState<TimeBucket>(defaultBucket || 'anytime');
  const [habitStartTime, setHabitStartTime] = useState<string>('');
  const [habitRepeatFrequency, setHabitRepeatFrequency] = useState<RepeatFrequency>('daily');
  const [habitRepeatDays, setHabitRepeatDays] = useState<number[]>([]);
  const [habitRepeatMonthDay, setHabitRepeatMonthDay] = useState<number>(1);
  const [habitTimesPerDay, setHabitTimesPerDay] = useState<string>('1');
  
  // New category state
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectEmoji, setNewProjectEmoji] = useState('📋');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState('⭐');
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'project' | 'group'; name: string } | null>(null);

  // Reset form when dialog opens or defaults change
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      setTaskTimeBucket(defaultBucket);
      setHabitTimeBucket(defaultBucket || 'anytime');
      setTaskStartDate(selectedDate);
    }
  }, [open, defaultTab, defaultBucket, selectedDate]);

  const resetForm = () => {
    setTaskTitle('');
    setTaskPriority(undefined);
    setTaskProject('');
    setTaskStartDate(selectedDate);
    setTaskDuration('30');
    setTaskTimeBucket(defaultBucket);
    setTaskStartTime('');
    setTaskRepeatFrequency('none');
    setTaskRepeatDays([]);
    setTaskRepeatMonthDay(1);
    setHabitTitle('');
    setHabitGroup(habitGroups[0]?.name || 'personal');
    setHabitTimeBucket(defaultBucket || 'anytime');
    setHabitStartTime('');
    setHabitRepeatFrequency('daily');
    setHabitRepeatDays([]);
    setHabitRepeatMonthDay(1);
    setHabitTimesPerDay('1');
    setShowNewProject(false);
    setShowNewGroup(false);
    setNewProjectName('');
    setNewGroupName('');
  };

  const toggleTaskDay = (day: number) => {
    if (taskRepeatDays.includes(day)) {
      setTaskRepeatDays(taskRepeatDays.filter((d) => d !== day));
    } else {
      setTaskRepeatDays([...taskRepeatDays, day].sort());
    }
  };

  const toggleHabitDay = (day: number) => {
    if (habitRepeatDays.includes(day)) {
      setHabitRepeatDays(habitRepeatDays.filter((d) => d !== day));
    } else {
      setHabitRepeatDays([...habitRepeatDays, day].sort());
    }
  };

  const handleAddNewProject = () => {
    if (newProjectName.trim()) {
      addProject(newProjectName.trim(), newProjectEmoji);
      setTaskProject(newProjectName.trim());
      setShowNewProject(false);
      setNewProjectName('');
      setNewProjectEmoji('📋');
    }
  };

  const handleAddNewGroup = () => {
    if (newGroupName.trim()) {
      addHabitGroup(newGroupName.trim(), newGroupEmoji);
      setHabitGroup(newGroupName.trim());
      setShowNewGroup(false);
      setNewGroupName('');
      setNewGroupEmoji('⭐');
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      if (deleteConfirm.type === 'project') {
        removeProject(deleteConfirm.name);
        if (taskProject === deleteConfirm.name) {
          setTaskProject('');
        }
      } else {
        removeHabitGroup(deleteConfirm.name);
        if (habitGroup === deleteConfirm.name) {
          setHabitGroup(habitGroups[0]?.name || 'personal');
        }
      }
      setDeleteConfirm(null);
    }
  };

  const handleAddTask = () => {
    if (!taskTitle.trim()) return;
    
    addTask({
      title: taskTitle.trim(),
      priority: taskPriority,
      project: taskProject || undefined,
      startDate: taskStartDate,
      duration: taskDuration ? parseInt(taskDuration) : undefined,
      timeBucket: taskTimeBucket,
      startTime: taskStartTime || undefined,
      repeatFrequency: taskRepeatFrequency !== 'none' ? taskRepeatFrequency : undefined,
      repeatDays: (taskRepeatFrequency === 'custom' || taskRepeatFrequency === 'weekly') ? taskRepeatDays : undefined,
      repeatMonthDay: taskRepeatFrequency === 'monthly' ? taskRepeatMonthDay : undefined,
    });

    // If a bucket was provided, schedule the task
    if (taskTimeBucket) {
      const newTaskId = usePlannerStore.getState().tasks[usePlannerStore.getState().tasks.length - 1]?.id;
      if (newTaskId) {
        scheduleTask(newTaskId, taskTimeBucket, taskStartTime || undefined);
      }
    }
    
    resetForm();
    onOpenChange(false);
  };

  const handleAddHabit = () => {
    if (!habitTitle.trim()) return;
    
    addHabit({
      title: habitTitle.trim(),
      group: habitGroup,
      timeBucket: habitTimeBucket,
      startTime: habitStartTime || undefined,
      repeatFrequency: habitRepeatFrequency,
      repeatDays: (habitRepeatFrequency === 'custom' || habitRepeatFrequency === 'weekly') ? habitRepeatDays : undefined,
      repeatMonthDay: habitRepeatFrequency === 'monthly' ? habitRepeatMonthDay : undefined,
      timesPerDay: parseInt(habitTimesPerDay) || 1,
    });
    
    resetForm();
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] bg-card max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add New</DialogTitle>
            <DialogDescription className="sr-only">
              Add a new task or habit to your daily planner.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'task' | 'habit')}>
            <TabsList className="grid w-full grid-cols-2 bg-secondary">
              <TabsTrigger value="task" className="data-[state=active]:bg-card">Task</TabsTrigger>
              <TabsTrigger value="habit" className="data-[state=active]:bg-card">Habit</TabsTrigger>
            </TabsList>
            
            <TabsContent value="task" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="task-title" className="text-sm text-muted-foreground">Title</Label>
                <Input
                  id="task-title"
                  placeholder="What needs to be done?"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="bg-background border-border"
                  autoFocus
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Priority</Label>
                  <Select value={taskPriority || ''} onValueChange={(v) => setTaskPriority(v as Priority || undefined)}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
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
                            <span>{newProjectEmoji}</span>
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
                      />
                      <Button size="icon" className="h-9 w-9" onClick={handleAddNewProject}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Select value={taskProject} onValueChange={(v) => {
                      if (v === '__new__') {
                        setShowNewProject(true);
                      } else {
                        setTaskProject(v);
                      }
                    }}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.name} value={project.name}>
                            <div className="flex items-center justify-between w-full">
                              <span>{project.emoji} {project.name}</span>
                            </div>
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
                          !taskStartDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {taskStartDate ? format(taskStartDate, 'MMM d') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={taskStartDate}
                        onSelect={setTaskStartDate}
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
                    value={taskDuration}
                    onChange={(e) => setTaskDuration(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Time Bucket</Label>
                  <Select value={taskTimeBucket || ''} onValueChange={(v) => setTaskTimeBucket(v as TimeBucket || undefined)}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Unscheduled" />
                    </SelectTrigger>
                    <SelectContent>
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
                    value={taskStartTime}
                    onChange={(e) => setTaskStartTime(e.target.value)}
                    className="bg-background border-border"
                    disabled={!taskTimeBucket || taskTimeBucket === 'anytime'}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Repeat</Label>
                <Select value={taskRepeatFrequency} onValueChange={(v) => setTaskRepeatFrequency(v as RepeatFrequency)}>
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

              {(taskRepeatFrequency === 'weekly' || taskRepeatFrequency === 'custom') && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    {taskRepeatFrequency === 'weekly' ? 'Repeat on' : 'Select days'}
                  </Label>
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleTaskDay(index)}
                        className={cn(
                          'w-9 h-9 rounded-lg text-xs font-medium transition-colors',
                          taskRepeatDays.includes(index)
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

              {taskRepeatFrequency === 'monthly' && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Day of month</Label>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setTaskRepeatMonthDay(day)}
                        className={cn(
                          'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                          taskRepeatMonthDay === day
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
              
              <Button onClick={handleAddTask} className="w-full mt-4">
                Add Task
              </Button>
            </TabsContent>
            
            <TabsContent value="habit" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="habit-title" className="text-sm text-muted-foreground">Title</Label>
                <Input
                  id="habit-title"
                  placeholder="What habit to track?"
                  value={habitTitle}
                  onChange={(e) => setHabitTitle(e.target.value)}
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
                            <span>{newGroupEmoji}</span>
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
                    <Select value={habitGroup} onValueChange={(v) => {
                      if (v === '__new__') {
                        setShowNewGroup(true);
                      } else {
                        setHabitGroup(v);
                      }
                    }}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {habitGroups.map((group) => (
                          <SelectItem key={group.name} value={group.name}>
                            <span>{group.emoji} <span className="capitalize">{group.name}</span></span>
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
                    value={habitTimesPerDay}
                    onChange={(e) => setHabitTimesPerDay(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Repeat</Label>
                <Select value={habitRepeatFrequency} onValueChange={(v) => setHabitRepeatFrequency(v as RepeatFrequency)}>
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

              {(habitRepeatFrequency === 'weekly' || habitRepeatFrequency === 'custom') && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    {habitRepeatFrequency === 'weekly' ? 'Repeat on' : 'Select days'}
                  </Label>
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleHabitDay(index)}
                        className={cn(
                          'w-9 h-9 rounded-lg text-xs font-medium transition-colors',
                          habitRepeatDays.includes(index)
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

              {habitRepeatFrequency === 'monthly' && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Day of month</Label>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setHabitRepeatMonthDay(day)}
                        className={cn(
                          'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                          habitRepeatMonthDay === day
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Time Bucket</Label>
                  <Select value={habitTimeBucket} onValueChange={(v) => setHabitTimeBucket(v as TimeBucket)}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                    value={habitStartTime}
                    onChange={(e) => setHabitStartTime(e.target.value)}
                    className="bg-background border-border"
                    disabled={habitTimeBucket === 'anytime'}
                  />
                </div>
              </div>
              
              <Button onClick={handleAddHabit} className="w-full mt-4">
                Add Habit
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.type === 'project' ? 'Project' : 'Group'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &quot;{deleteConfirm?.name}&quot; and unassign it from all {deleteConfirm?.type === 'project' ? 'tasks' : 'habits'}. This action cannot be undone.
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
