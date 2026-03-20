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
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlannerStore } from '@/lib/planner-store';
import { cn } from '@/lib/utils';

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCategoriesDialog({ open, onOpenChange }: ManageCategoriesDialogProps) {
  const { projects, habitGroups, addProject, removeProject, addHabitGroup, removeHabitGroup } = usePlannerStore();
  const [newProject, setNewProject] = useState('');
  const [newGroup, setNewGroup] = useState('');

  const handleAddProject = () => {
    if (newProject.trim()) {
      addProject(newProject.trim());
      setNewProject('');
    }
  };

  const handleAddGroup = () => {
    if (newGroup.trim()) {
      addHabitGroup(newGroup.trim());
      setNewGroup('');
    }
  };

  return (
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
                    key={project}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                  >
                    <span className="text-sm text-foreground">{project}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeProject(project)}
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
                    key={group}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                  >
                    <span className="text-sm text-foreground capitalize">{group}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeHabitGroup(group)}
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
  );
}
