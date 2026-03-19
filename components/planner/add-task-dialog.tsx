'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlannerStore } from '@/lib/planner-store';
import type { Priority, HabitGroup } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddTaskDialog({ open, onOpenChange }: AddTaskDialogProps) {
  const { addTask, addHabit, projects } = usePlannerStore();
  const [activeTab, setActiveTab] = useState<'task' | 'habit'>('task');
  
  // Task state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<Priority | undefined>();
  const [taskProject, setTaskProject] = useState<string>('');
  const [taskDueDate, setTaskDueDate] = useState<Date | undefined>();
  const [taskDuration, setTaskDuration] = useState<string>('30');
  
  // Habit state
  const [habitTitle, setHabitTitle] = useState('');
  const [habitGroup, setHabitGroup] = useState<HabitGroup>('wellness');

  const resetForm = () => {
    setTaskTitle('');
    setTaskPriority(undefined);
    setTaskProject('');
    setTaskDueDate(undefined);
    setTaskDuration('30');
    setHabitTitle('');
    setHabitGroup('wellness');
  };

  const handleAddTask = () => {
    if (!taskTitle.trim()) return;
    
    addTask({
      title: taskTitle.trim(),
      priority: taskPriority,
      project: taskProject || undefined,
      dueDate: taskDueDate,
      duration: taskDuration ? parseInt(taskDuration) : undefined,
    });
    
    resetForm();
    onOpenChange(false);
  };

  const handleAddHabit = () => {
    if (!habitTitle.trim()) return;
    
    addHabit({
      title: habitTitle.trim(),
      group: habitGroup,
    });
    
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add New</DialogTitle>
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
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Priority</Label>
                <Select value={taskPriority} onValueChange={(v) => setTaskPriority(v as Priority)}>
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
                <Select value={taskProject} onValueChange={setTaskProject}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project} value={project}>
                        {project}
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
                        !taskDueDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {taskDueDate ? format(taskDueDate, 'MMM d') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={taskDueDate}
                      onSelect={setTaskDueDate}
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
            
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Group</Label>
              <Select value={habitGroup} onValueChange={(v) => setHabitGroup(v as HabitGroup)}>
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
            
            <Button onClick={handleAddHabit} className="w-full mt-4">
              Add Habit
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
