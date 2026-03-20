'use client';

import { useState } from 'react';
import { Plus, Trash2, FolderKanban, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlannerStore } from '@/lib/planner-store';
import { EMOJI_OPTIONS } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCategoriesDialog({ open, onOpenChange }: ManageCategoriesDialogProps) {
  const { projects, habitGroups, addProject, removeProject, addHabitGroup, removeHabitGroup } = usePlannerStore();
  const [newProject, setNewProject] = useState('');
  const [newProjectEmoji, setNewProjectEmoji] = useState('📋');
  const [newGroup, setNewGroup] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState('⭐');
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'project' | 'group'; name: string } | null>(null);

  const handleAddProject = () => {
    if (newProject.trim()) {
      addProject(newProject.trim(), newProjectEmoji);
      setNewProject('');
      setNewProjectEmoji('📋');
    }
  };

  const handleAddGroup = () => {
    if (newGroup.trim()) {
      addHabitGroup(newGroup.trim(), newGroupEmoji);
      setNewGroup('');
      setNewGroupEmoji('⭐');
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      if (deleteConfirm.type === 'project') {
        removeProject(deleteConfirm.name);
      } else {
        removeHabitGroup(deleteConfirm.name);
      }
      setDeleteConfirm(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px] bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Manage Categories</DialogTitle>
            <DialogDescription className="sr-only">
              Create and delete projects for tasks and groups for habits.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="projects" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary">
              <TabsTrigger value="projects" className="data-[state=active]:bg-card">
                <FolderKanban className="h-4 w-4 mr-2" />
                Projects
              </TabsTrigger>
              <TabsTrigger value="groups" className="data-[state=active]:bg-card">
                <Tag className="h-4 w-4 mr-2" />
                Habit Groups
              </TabsTrigger>
            </TabsList>

            <TabsContent value="projects" className="mt-4 space-y-4">
              <div className="flex gap-2">
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
                  placeholder="New project name..."
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddProject()}
                  className="bg-background border-border flex-1"
                />
                <Button size="icon" onClick={handleAddProject} disabled={!newProject.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No projects yet. Add one above.
                  </p>
                ) : (
                  projects.map((project) => (
                    <div
                      key={project.name}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <span className="text-sm text-foreground">{project.emoji} {project.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteConfirm({ type: 'project', name: project.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="groups" className="mt-4 space-y-4">
              <div className="flex gap-2">
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
                  placeholder="New group name..."
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                  className="bg-background border-border flex-1"
                />
                <Button size="icon" onClick={handleAddGroup} disabled={!newGroup.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {habitGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No habit groups yet. Add one above.
                  </p>
                ) : (
                  habitGroups.map((group) => (
                    <div
                      key={group.name}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <span className="text-sm text-foreground">{group.emoji} <span className="capitalize">{group.name}</span></span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteConfirm({ type: 'group', name: group.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
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
