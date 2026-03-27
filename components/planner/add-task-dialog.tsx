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
  const [taskStartDate, setTaskStartDate] = useState<Date | undefined>(undefined);
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
      setTaskStartDate(undefined);
    }
  }, [open, defaultTab, defaultBucket]);

  const resetForm = () => {
    setTaskTitle('');
    setTaskPriority(undefined);
    setTaskProject('');
    setTaskStartDate(undefined);
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
    
const effectiveTimeBucket = taskStartDate ? (taskTimeBucket || 'anytime') : undefined;
  
  addTask({
    title: taskTitle.trim(),
    priority: taskPriority,
    project: taskProject || undefined,
    startDate: taskStartDate ? format(taskStartDate, 'yyyy-MM-dd') : undefined,
    duration: taskDuration ? parseInt(taskDuration) : undefined,
    timeBucket: effectiveTimeBucket,
    startTime: taskStartTime || undefined,
    repeatFrequency: taskRepeatFrequency !== 'none' ? taskRepeatFrequency : undefined,
    repeatDays: (taskRepeatFrequency === 'custom' || taskRepeatFrequency === 'weekly') ? taskRepeatDays : undefined,
    repeatMonthDay: taskRepeatFrequency === 'monthly' ? taskRepeatMonthDay : undefined,
  });
  
  // If a date was selected, schedule the task
  if (taskStartDate && effectiveTimeBucket) {
    const newTaskId = usePlannerStore.getState().tasks[usePlannerStore.getState().tasks.length - 1]?.id;
    if (newTaskId) {
      scheduleTask(newTaskId, effectiveTimeBucket, taskStartTime || undefined);
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
<DialogContent
  className="w-[calc(100vw-2rem)] max-w-[425px] bg-card max-h-[85vh] overflow-y-auto overflow-x-hidden"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !(e.target as HTMLElement).closest('[data-sub-input]')) {
              e.preventDefault();
              activeTab === 'task' ? handleAddTask() : handleAddHabit();
            }
          }}
        >
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
            
            <TabsContent value="task" className="mt-4">
              {/* Title */}
              <div className="space-y-1.5 mb-5">
                <Label htmlFor="task-title" className="text-xs text-muted-foreground">Title</Label>
                <Input
                  id="task-title"
                  placeholder="What needs to be done?"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="bg-background border-border text-base h-11"
                  autoFocus
                />
              </div>

              {/* Organization Section */}
              <div className="space-y-3 pb-4 mb-4 border-b border-border/50">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Organization</p>
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Priority</Label>
                    <Select value={taskPriority || ''} onValueChange={(v) => setTaskPriority(v as Priority || undefined)}>
                      <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
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
                          className="bg-background border-border flex-1 h-9 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddNewProject()}
                          data-sub-input
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
                        <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.name} value={project.name}>
                              <span>{project.emoji} {project.name}</span>
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
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal bg-background border-border h-9 text-sm px-2.5',
                            !taskStartDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                          {taskStartDate ? format(taskStartDate, 'MMM d') : 'None'}
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
                  
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Time</Label>
                    <Select 
                      value={taskStartDate ? (taskTimeBucket || 'anytime') : ''} 
                      onValueChange={(v) => setTaskTimeBucket(v as TimeBucket)}
                      disabled={!taskStartDate}
                    >
                      <SelectTrigger className={cn(
                        "w-full bg-background border-border h-9 text-sm",
                        !taskStartDate && "opacity-50"
                      )}>
                        <SelectValue placeholder={taskStartDate ? "Anytime" : "Select date first"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anytime">Anytime</SelectItem>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="afternoon">Afternoon</SelectItem>
                        <SelectItem value="evening">Evening</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Duration</Label>
                    <Select value={taskDuration} onValueChange={setTaskDuration}>
                      <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
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
                
                {taskStartDate && taskTimeBucket && taskTimeBucket !== 'anytime' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Specific Time (optional)</Label>
                    <Input
                      type="time"
                      value={taskStartTime}
                      onChange={(e) => setTaskStartTime(e.target.value)}
                      className="bg-background border-border h-9 text-sm w-32"
                    />
                  </div>
                )}
              </div>

              {/* Repeat Section */}
              <div className="space-y-3">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Repeat</p>
                <Select value={taskRepeatFrequency} onValueChange={(v) => setTaskRepeatFrequency(v as RepeatFrequency)}>
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

                {(taskRepeatFrequency === 'weekly' || taskRepeatFrequency === 'custom') && (
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleTaskDay(index)}
                        className={cn(
                          'w-8 h-8 rounded-md text-xs font-medium transition-colors',
                          taskRepeatDays.includes(index)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}

                {taskRepeatFrequency === 'monthly' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setTaskRepeatMonthDay(day)}
                          className={cn(
                            'w-7 h-7 rounded text-xs font-medium transition-colors',
                            taskRepeatMonthDay === day
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
              
<Button onClick={handleAddTask} className="w-full h-10 mt-6">
  Add Task
  </Button>
  </TabsContent>
            
            <TabsContent value="habit" className="mt-4">
              {/* Title */}
              <div className="space-y-1.5 mb-5">
                <Label htmlFor="habit-title" className="text-xs text-muted-foreground">Title</Label>
                <Input
                  id="habit-title"
                  placeholder="What habit to track?"
                  value={habitTitle}
                  onChange={(e) => setHabitTitle(e.target.value)}
                  className="bg-background border-border text-base h-11"
                />
              </div>

              {/* Organization Section */}
              <div className="space-y-3 pb-4 mb-4 border-b border-border/50">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Organization</p>
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Group</Label>
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
                          className="bg-background border-border flex-1 h-9 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddNewGroup()}
                          data-sub-input
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
                        <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
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

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Times per day</Label>
                    <Select value={habitTimesPerDay} onValueChange={setHabitTimesPerDay}>
                      <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Scheduling Section */}
              <div className="space-y-3 pb-4 mb-4 border-b border-border/50">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Scheduling</p>
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Time</Label>
                    <Select value={habitTimeBucket} onValueChange={(v) => setHabitTimeBucket(v as TimeBucket)}>
                      <SelectTrigger className="w-full bg-background border-border h-9 text-sm">
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

                  {habitTimeBucket !== 'anytime' && (
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Specific Time</Label>
                      <Input
                        type="time"
                        value={habitStartTime}
                        onChange={(e) => setHabitStartTime(e.target.value)}
                        className="bg-background border-border h-9 text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Repeat Section */}
              <div className="space-y-3">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Repeat</p>
                <Select value={habitRepeatFrequency} onValueChange={(v) => setHabitRepeatFrequency(v as RepeatFrequency)}>
                  <SelectTrigger className="bg-background border-border h-9 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REPEAT_FREQUENCY_LABELS)
                      .filter(([value]) => value !== 'none' && value !== 'weekly')
                      .map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                {(habitRepeatFrequency === 'weekly' || habitRepeatFrequency === 'custom') && (
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleHabitDay(index)}
                        className={cn(
                          'w-8 h-8 rounded-md text-xs font-medium transition-colors',
                          habitRepeatDays.includes(index)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}

                {habitRepeatFrequency === 'monthly' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setHabitRepeatMonthDay(day)}
                          className={cn(
                            'w-7 h-7 rounded text-xs font-medium transition-colors',
                            habitRepeatMonthDay === day
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
              
<Button onClick={handleAddHabit} className="w-full h-10 mt-6">
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
