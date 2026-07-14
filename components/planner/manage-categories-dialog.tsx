'use client';

import { useState } from 'react';
import { Plus, Trash2, FolderKanban, Tag, Settings2 } from 'lucide-react';
import { EditProjectDialog } from './edit-project-dialog';
import type { Project } from '@/lib/planner-types';
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
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IconPicker } from '@/components/primitives/icon-picker';
import { usePlannerStore } from '@/lib/planner-store';
import { CategoryIcon, makeIconToken } from '@/lib/category-icons';

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCategoriesDialog({ open, onOpenChange }: ManageCategoriesDialogProps) {
  const { projects, habitGroups, addProject, removeProject, addHabitGroup, removeHabitGroup } = usePlannerStore();
  const [newProject, setNewProject] = useState('');
  const [newProjectEmoji, setNewProjectEmoji] = useState(makeIconToken('Briefcase'));
  const [newGroup, setNewGroup] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState(makeIconToken('Star'));
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'project' | 'group'; name: string; id: string } | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const handleAddProject = () => {
    if (newProject.trim()) {
      addProject(newProject.trim(), newProjectEmoji);
      setNewProject('');
      setNewProjectEmoji(makeIconToken('Briefcase'));
    }
  };

  const handleAddGroup = () => {
    if (newGroup.trim()) {
      addHabitGroup(newGroup.trim(), newGroupEmoji);
      setNewGroup('');
      setNewGroupEmoji(makeIconToken('Star'));
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      if (deleteConfirm.type === 'project') {
        removeProject(deleteConfirm.id);
      } else {
        removeHabitGroup(deleteConfirm.id);
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
                <IconPicker value={newProjectEmoji} name={newProject} onSelect={setNewProjectEmoji} />
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
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-sm text-foreground">
                          <CategoryIcon glyph={project.emoji} name={project.name} />
                          {project.name}
                        </span>
                        {project.startTime && project.timeBucket && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {project.startTime} · {project.duration}m
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingProject(project)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteConfirm({ type: 'project', name: project.name, id: project.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="groups" className="mt-4 space-y-4">
              <div className="flex gap-2">
                <IconPicker value={newGroupEmoji} name={newGroup} onSelect={setNewGroupEmoji} />
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
                      <span className="flex items-center gap-1.5 text-sm text-foreground">
                        <CategoryIcon glyph={group.emoji} name={group.name} />
                        <span className="capitalize">{group.name}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteConfirm({ type: 'group', name: group.name, id: group.id })}
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

      <EditProjectDialog
        project={editingProject}
        open={!!editingProject}
        onOpenChange={(open) => !open && setEditingProject(null)}
      />
    </>
  );
}
