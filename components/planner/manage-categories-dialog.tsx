'use client';

import { useState } from 'react';
import { Trash2, FolderKanban, Tag, Settings2, Shapes } from 'lucide-react';
import { EditProjectDialog } from './edit-project-dialog';
import type { Item, Project } from '@/lib/planner-types';
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
import { AddIconButton } from '@/components/primitives/add-icon-button';
import { ColorSwatchPicker } from '@/components/primitives/color-swatch-picker';
import { usePlannerStore } from '@/lib/planner-store';
import { CategoryIcon, makeIconToken } from '@/lib/category-icons';
import { accentColorForName } from '@/lib/accent-colors';

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Panel to open on — 'projects' | 'groups' | 'types'. Defaults to projects. */
  defaultTab?: string;
}

type DeleteTarget = { type: 'project' | 'group' | 'itemType'; name: string; id: string };

/**
 * What deleting actually does, said plainly — the ManageCollectionsDialog
 * precedent, applied to the half of the app that never had it.
 *
 * The copy this replaces was wrong three separate ways, and each error pointed
 * the same direction: it made a recoverable act sound final and a final one
 * sound routine.
 *
 *   1. Projects and habit groups claimed "This action cannot be undone." Both
 *      are in HistoryState (⌘Z works) AND soft-deleted with a 30-day window
 *      before the nightly purge. The sentence was false twice over.
 *   2. Deleting a habit group claimed to "unassign it from all habits". It does
 *      not: removeHabitGroup REASSIGNS every habit to the first remaining group,
 *      falling back to the literal 'Personal'. The habits land somewhere
 *      specific and the user was never told where.
 *   3. Deleting a custom item type — the one delete here that genuinely cannot
 *      be undone, because itemTypes sit outside HistoryState — carried no
 *      warning at all.
 *
 * Counts are computed live rather than passed in, so the number in the sentence
 * is the number on the canvas.
 */
function DeleteConsequence({
  target,
  items,
  habitGroups,
  itemTypes,
}: {
  target: DeleteTarget;
  items: Item[];
  habitGroups: { id: string; name: string }[];
  itemTypes: { id: string; name: string; label: string; labelPlural?: string }[];
}) {
  if (target.type === 'project') {
    // `!== 'habit'`, matching removeProject: custom-typed items are task-shaped
    // and get unfiled too. The noun is therefore "items", not "tasks" — three
    // Goals under a project must not be reported as three tasks.
    const n = items.filter((i) => i.type !== 'habit' && i.project === target.name).length;
    return (
      <>
        {n === 0
          ? 'Nothing is filed under it, so nothing moves.'
          : `Its ${n} ${n === 1 ? 'item stays' : 'items stay'} exactly as ${n === 1 ? 'it is' : 'they are'} — ${n === 1 ? 'it' : 'they'} just stop being filed under ${target.name}.`}{' '}
        ⌘Z brings it back now, and it stays in the Trash for 30 days.
      </>
    );
  }

  if (target.type === 'group') {
    const n = items.filter((i) => i.type === 'habit' && i.group === target.name).length;
    // The same expression removeHabitGroup uses, so the sentence names the group
    // the habits will ACTUALLY land in rather than a plausible-sounding one.
    const destination = habitGroups.find((g) => g.id !== target.id)?.name ?? 'Personal';
    return (
      <>
        {n === 0
          ? 'No habits are in it, so nothing moves.'
          : `Its ${n} ${n === 1 ? 'habit moves' : 'habits move'} to “${destination}” — ${n === 1 ? 'it isn’t' : 'they aren’t'} deleted.`}{' '}
        ⌘Z brings the group back now, and it stays in the Trash for 30 days.
      </>
    );
  }

  const type = itemTypes.find((t) => t.id === target.id);
  const slug = type?.name;
  const n = slug
    ? items.filter((i) => i.type === 'custom' && i.customType === slug).length
    : 0;
  const plural = (type?.labelPlural ?? `${target.name}s`).toLowerCase();
  return (
    <>
      {n === 0
        ? 'Nothing uses it yet.'
        : `Your ${n} existing ${n === 1 ? target.name.toLowerCase() : plural} are kept and keep working with a generic label.`}{' '}
      This one isn’t undoable — custom types sit outside the undo history.
    </>
  );
}

/** 'Goal' → 'goal', 'Side Quest' → 'side-quest' (items.type slug). */
const slugForLabel = (label: string) =>
  label.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');

const RESERVED_TYPE_NAMES = ['task', 'habit', 'custom'];

export function ManageCategoriesDialog({
  open,
  onOpenChange,
  defaultTab,
}: ManageCategoriesDialogProps) {
  const {
    items,
    projects, habitGroups, addProject, removeProject, addHabitGroup, removeHabitGroup,
    itemTypes, itemTypesAvailable, addItemType, removeItemType,
    updateProject, updateHabitGroup, updateItemType, getHabitGroupColor,
  } = usePlannerStore();
  const [newProject, setNewProject] = useState('');
  const [newProjectEmoji, setNewProjectEmoji] = useState(makeIconToken('Briefcase'));
  const [newGroup, setNewGroup] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState(makeIconToken('Star'));
  const [newType, setNewType] = useState('');
  const [newTypeIcon, setNewTypeIcon] = useState(makeIconToken('Target'));
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'project' | 'group' | 'itemType'; name: string; id: string } | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const newTypeSlug = slugForLabel(newType);
  const newTypeValid =
    !!newTypeSlug &&
    /^[a-z][a-z0-9_-]{0,31}$/.test(newTypeSlug) &&
    !RESERVED_TYPE_NAMES.includes(newTypeSlug) &&
    !itemTypes.some((t) => t.name === newTypeSlug);

  const handleAddType = () => {
    if (!newTypeValid) return;
    const label = newType.trim();
    addItemType({
      name: newTypeSlug,
      label,
      labelPlural: `${label}s`,
      icon: newTypeIcon,
    });
    setNewType('');
    setNewTypeIcon(makeIconToken('Target'));
  };

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
      } else if (deleteConfirm.type === 'group') {
        removeHabitGroup(deleteConfirm.id);
      } else {
        removeItemType(deleteConfirm.id);
      }
      setDeleteConfirm(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-foreground">Manage Categories</DialogTitle>
            <DialogDescription className="sr-only">
              Create and delete projects for tasks and groups for habits.
            </DialogDescription>
          </DialogHeader>

          {/* Keyed so a later open with a different tab actually lands there —
              the dialog stays mounted, and defaultValue only applies once. */}
          <Tabs key={defaultTab ?? 'projects'} defaultValue={defaultTab ?? 'projects'} className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-secondary">
              <TabsTrigger value="projects" className="data-[state=active]:bg-card">
                <FolderKanban className="h-4 w-4 mr-1.5" />
                Projects
              </TabsTrigger>
              <TabsTrigger value="groups" className="data-[state=active]:bg-card">
                <Tag className="h-4 w-4 mr-1.5" />
                Groups
              </TabsTrigger>
              <TabsTrigger value="types" className="data-[state=active]:bg-card">
                <Shapes className="h-4 w-4 mr-1.5" />
                Types
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
                <AddIconButton size="input" onClick={handleAddProject} disabled={!newProject.trim()} aria-label="Add project" />
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
                        <ColorSwatchPicker
                          value={project.color}
                          fallback={accentColorForName(project.name)}
                          onSelect={(color) => updateProject(project.id, { color })}
                          aria-label={`Color for ${project.name}`}
                        />
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
                <AddIconButton size="input" onClick={handleAddGroup} disabled={!newGroup.trim()} aria-label="Add habit group" />
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
                      <div className="flex items-center gap-1">
                        <ColorSwatchPicker
                          value={group.color}
                          fallback={getHabitGroupColor(group.name)}
                          onSelect={(color) => updateHabitGroup(group.id, { color })}
                          aria-label={`Color for ${group.name}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteConfirm({ type: 'group', name: group.name, id: group.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="types" className="mt-4 space-y-4">
              {!itemTypesAvailable && (
                <p className="text-xs text-destructive">
                  Custom types aren&apos;t available yet — the database migration
                  hasn&apos;t been applied. Creation is disabled so nothing is lost.
                </p>
              )}
              <div className="flex gap-2">
                <IconPicker value={newTypeIcon} name={newType} onSelect={setNewTypeIcon} />
                <Input
                  placeholder="New item type… (e.g. Goal)"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
                  className="bg-background border-border flex-1"
                />
                <AddIconButton size="input" onClick={handleAddType} disabled={!newTypeValid || !itemTypesAvailable} aria-label="Add item type" />
              </div>
              <p className="text-[10px] text-muted-foreground -mt-2">
                Custom types work like tasks — they get their own tab in the add
                dialog and their own section in Beacon&apos;s context.
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {itemTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No custom types yet. Add one above.
                  </p>
                ) : (
                  itemTypes.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <span className="flex items-center gap-1.5 text-sm text-foreground">
                        <CategoryIcon glyph={t.icon} name={t.label} />
                        {t.label}
                        <span className="text-[10px] text-muted-foreground font-mono">{t.name}</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <ColorSwatchPicker
                          value={t.color}
                          fallback={accentColorForName(t.name)}
                          onSelect={(color) => updateItemType(t.id, { color })}
                          aria-label={`Color for ${t.label}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteConfirm({ type: 'itemType', name: t.label, id: t.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
            <AlertDialogTitle>
              {deleteConfirm ? `Delete “${deleteConfirm.name}”?` : 'Delete?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && (
                <DeleteConsequence
                  target={deleteConfirm}
                  items={items}
                  habitGroups={habitGroups}
                  itemTypes={itemTypes}
                />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="category-delete-confirm"
              onClick={handleDeleteConfirm}
              // The filled destructive button is spent on the ONE delete here
              // that genuinely cannot be undone. Projects and habit groups are
              // in the undo history and soft-deleted for 30 days; dressing all
              // three the same way is what taught the user to read none of them.
              className={
                deleteConfirm?.type === 'itemType'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
            >
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
