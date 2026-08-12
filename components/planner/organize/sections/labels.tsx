'use client';

import { useState } from 'react';
import { ProjectTimeBlock } from '../project-time-block';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import { byName, matching } from '@/lib/collections';
import { makeIconToken } from '@/lib/category-icons';
import { ObjectRow, SettingRow } from '../primitives';
import {
  BackRow,
  BufferedInput,
  DangerZone,
  DetailColumn,
  DraftRow,
  IdentityRow,
  ListColumn,
  TeachingLine,
} from '../detail-parts';
import type { HabitGroupType, Item, ItemTypeDef, Project } from '@/lib/planner-types';

/**
 * PROJECTS, ITEM TYPES and HABIT GROUPS — the half of the console that came
 * from ManageCategoriesDialog.
 *
 * ONE FILE, not three, and that is deliberate. The plan's file list named
 * `sections/{projects,types,groups}.tsx`, but the three are the same section
 * three times over — a list of labels, a usage count, a colour, a delete — and
 * the interesting differences (a project's time block, a type's frozen slug and
 * un-undoable delete) are a dozen lines each. Three files would have been three
 * copies of the identical scaffolding, which is precisely the drift that put
 * `lib/collections.ts` in the tree.
 *
 * WHAT THIS HALF HAS NEVER HAD: a detail pane, a usage count, or a single
 * data-testid. The dialog it replaces is a 400px box of rows with a hover trash
 * on each, and `tests/` reaches none of it. Every testid here is new, which is
 * what makes Phase 3's e2e possible.
 *
 * WHY THE NAMES ARE NOT EDITABLE YET: `items.project` and `items."group"` are
 * NAME references — a rename orphans every child. That is Phase 0's migration,
 * and until it lands each detail says so in a sentence rather than showing a
 * disabled input, because a disabled input reads as a bug and a sentence reads
 * as a decision.
 */

/* ── projects ─────────────────────────────────────────────────────────── */

export function ProjectsSection({
  selectedId,
  onSelect,
  focusNew,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusNew: boolean;
}) {
  const projects = usePlannerStore((s) => s.projects);
  const items = usePlannerStore((s) => s.items);
  const addProject = usePlannerStore((s) => s.addProject);
  const [query, setQuery] = useState('');

  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const visible = matching(projects, query, byName);
  const usage = (name: string) => countProjectItems(items, name);

  return (
    <>
      <ListColumn
        eyebrow="PROJECTS"
        count={visible.length}
        hasSelection={!!selected}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: 'Filter projects…',
          testId: 'project-filter',
        }}
        footer={
          <DraftRow
            placeholder="New project…"
            addLabel="Add project"
            testPrefix="project"
            autoFocus={focusNew}
            onAdd={(name, icon) => {
              addProject(name, icon ?? makeIconToken('Briefcase'));
              onSelect(created(usePlannerStore.getState().projects, name));
            }}
          />
        }
      >
        {projects.length === 0 ? (
          <p className="text-muted-foreground px-[7px] pt-2 text-xs">No projects yet.</p>
        ) : (
          visible.map((project) => (
            <ObjectRow
              key={project.id}
              testId="project-row"
              idAttr={{ 'data-project-id': project.id }}
              icon={project.emoji}
              color={project.color}
              name={project.name}
              selected={selectedId === project.id}
              pill={null}
              count={usage(project.name)}
              onSelect={() => onSelect(project.id)}
            />
          ))
        )}
      </ListColumn>

      <DetailColumn hasSelection={!!selected}>
        {selected ? (
          <ProjectDetail project={selected} onBack={() => onSelect(null)} />
        ) : (
          <TeachingLine>
            Projects file your tasks, and can carry a repeating block on the grid.
          </TeachingLine>
        )}
      </DetailColumn>
    </>
  );
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const items = usePlannerStore((s) => s.items);
  const updateProject = usePlannerStore((s) => s.updateProject);
  const removeProject = usePlannerStore((s) => s.removeProject);
  const confirm = useUIStore((s) => s.confirm);

  const n = countProjectItems(items, project.name);

  // `!== 'habit'` matches removeProject exactly, so the sentence and the write
  // agree: custom-typed items are task-shaped and get unfiled too. Which is why
  // the noun is "items" — three Goals under a project must not be reported as
  // three tasks.
  const consequence =
    (n === 0
      ? 'Nothing is filed under it, so nothing moves.'
      : `Its ${n} ${n === 1 ? 'item stays' : 'items stay'} exactly as ${
          n === 1 ? 'it is' : 'they are'
        } — ${n === 1 ? 'it' : 'they'} just stop being filed under ${project.name}.`) +
    ' ⌘Z brings it back now, and it stays in the Trash for 30 days.';

  return (
    <div className="flex flex-col" data-testid="project-detail" data-project-id={project.id}>
      <BackRow label="Projects" testId="project-detail-back" onBack={onBack} />

      <IdentityRow
        id={project.id}
        name={project.name}
        icon={project.emoji}
        color={project.color}
        label="Project"
        testPrefix="project"
        editable={false}
        parkedNote={`Renaming is parked: your items point at this project by name, so a rename would unfile ${
          n === 1 ? 'the one' : `all ${n}`
        } of them. Stable ids land first.`}
        meta={
          <>
            Project · <span className="font-num">{n}</span> {n === 1 ? 'item' : 'items'}
          </>
        }
        onPatch={(patch) => updateProject(project.id, renameIconKey(patch, 'emoji'))}
      />

      <div className="bg-border my-4 h-px" />

      <ProjectTimeBlock project={project} />

      <DangerZone
        label="Delete this project"
        testId="project-delete"
        consequence={consequence}
        onDelete={() =>
          confirm({
            title: `Delete “${project.name}”?`,
            description: consequence,
            confirmLabel: 'Delete',
            testId: 'category-delete-confirm',
            onConfirm: () => {
              removeProject(project.id);
              onBack();
            },
          })
        }
      />
    </div>
  );
}

/* ── item types ───────────────────────────────────────────────────────── */

export function TypesSection({
  selectedId,
  onSelect,
  focusNew,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusNew: boolean;
}) {
  const itemTypes = usePlannerStore((s) => s.itemTypes);
  const itemTypesAvailable = usePlannerStore((s) => s.itemTypesAvailable);
  const items = usePlannerStore((s) => s.items);
  const addItemType = usePlannerStore((s) => s.addItemType);

  const [query, setQuery] = useState('');

  const selected = itemTypes.find((t) => t.id === selectedId) ?? null;
  // Label AND slug: the slug is on the row and is what a user hunting for the
  // type they created as "Side Quest" may well type.
  const visible = matching(itemTypes, query, (t) => `${t.label} ${t.name}`);

  return (
    <>
      <ListColumn
        eyebrow="ITEM TYPES"
        count={visible.length}
        hasSelection={!!selected}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: 'Filter item types…',
          testId: 'type-filter',
        }}
        footer={
          <DraftRow
            placeholder="New type… (e.g. Goal)"
            addLabel="Add item type"
            testPrefix="type"
            autoFocus={focusNew}
            disabled={!itemTypesAvailable}
            // The store silently no-ops on a bad slug, so the row has to know
            // the same rules — and now say them out loud rather than greying a
            // button and leaving the user to guess.
            validate={(name) => slugProblem(name, itemTypes)}
            onAdd={(name, icon) => {
              const slug = slugForLabel(name);
              addItemType({
                name: slug,
                label: name,
                labelPlural: `${name}s`,
                icon: icon ?? makeIconToken('Target'),
              });
              const made = usePlannerStore.getState().itemTypes.find((t) => t.name === slug);
              onSelect(made?.id ?? null);
            }}
          />
        }
      >
        {!itemTypesAvailable ? (
          <p
            className="text-muted-foreground px-[7px] pt-2 text-xs"
            data-testid="types-unavailable"
          >
            Custom types aren&apos;t available on this account yet.
          </p>
        ) : itemTypes.length === 0 ? (
          <p className="text-muted-foreground px-[7px] pt-2 text-xs">No custom types yet.</p>
        ) : (
          visible.map((type) => (
            <ObjectRow
              key={type.id}
              testId="type-row"
              idAttr={{ 'data-type-id': type.id }}
              icon={type.icon}
              color={type.color}
              name={type.label}
              // The SLUG, because that is what item-registry hashes for a
              // custom type's accent — the label is only what it is called.
              accentName={type.name}
              selected={selectedId === type.id}
              pill={null}
              count={countTypeItems(items, type.name)}
              onSelect={() => onSelect(type.id)}
            />
          ))
        )}
      </ListColumn>

      <DetailColumn hasSelection={!!selected}>
        {selected ? (
          <TypeDetail type={selected} onBack={() => onSelect(null)} />
        ) : (
          <TeachingLine>
            Custom types work like tasks — they get their own tab in the add dialog and their own
            section in Beacon&apos;s context.
          </TeachingLine>
        )}
      </DetailColumn>
    </>
  );
}

function TypeDetail({ type, onBack }: { type: ItemTypeDef; onBack: () => void }) {
  const items = usePlannerStore((s) => s.items);
  const updateItemType = usePlannerStore((s) => s.updateItemType);
  const removeItemType = usePlannerStore((s) => s.removeItemType);
  const confirm = useUIStore((s) => s.confirm);

  const n = countTypeItems(items, type.name);
  const plural = (type.labelPlural ?? `${type.label}s`).toLowerCase();

  // The one delete in the console that genuinely cannot be undone — itemTypes
  // sit outside HistoryState, so there is no ⌘Z and no 30-day window. It is the
  // only place the filled destructive button is spent.
  const consequence =
    (n === 0
      ? 'Nothing uses it yet.'
      : n === 1
        ? `Your one existing ${type.label.toLowerCase()} is kept and keeps working with a generic label.`
        : `Your ${n} existing ${plural} are kept and keep working with a generic label.`) +
    ' This one isn’t undoable — custom types sit outside the undo history.';

  return (
    <div className="flex flex-col" data-testid="type-detail" data-type-id={type.id}>
      <BackRow label="Item types" testId="type-detail-back" onBack={onBack} />

      <IdentityRow
        id={type.id}
        name={type.label}
        accentName={type.name}
        icon={type.icon}
        color={type.color}
        label="Item type"
        testPrefix="type"
        // Editable, unlike projects and habit groups: a type's children point at
        // its SLUG, not its label, so renaming the label orphans nothing. The
        // slug itself is what is permanent, and the meta line shows it.
        editable
        meta={
          <>
            Item type · <span className="font-num">{n}</span> {n === 1 ? 'item' : 'items'} ·{' '}
            <span className="font-mono">{type.name}</span>
          </>
        }
        onPatch={(patch) => {
          const next = renameIconKey(patch, 'icon');
          if (patch.name === undefined) {
            updateItemType(type.id, next);
            return;
          }
          // The label and its plural travel TOGETHER, and this is the whole
          // reason the pair shipped at once rather than the label alone: rename
          // "Goal" to "Objective" and leave the plural at "Goals", and every
          // list header in the app reads "Objective / Goals" with no control
          // anywhere to fix it.
          //
          // Only an untouched plural follows. Once someone has written "People"
          // for "Person", a later rename must not silently overwrite it — the
          // irregular plural is exactly the thing this field exists to hold.
          const auto = type.labelPlural === `${type.label}s`;
          updateItemType(type.id, {
            ...next,
            label: patch.name,
            ...(auto && { labelPlural: `${patch.name}s` }),
          });
        }}
      />

      <div className="bg-border my-4 h-px" />

      <SettingRow label="Plural" description="Used wherever more than one is counted.">
        <BufferedInput
          value={type.labelPlural ?? `${type.label}s`}
          testId="type-plural"
          ariaLabel="Item type plural"
          className="w-[160px]"
          onCommit={(next) => updateItemType(type.id, { labelPlural: next })}
        />
      </SettingRow>

      <DangerZone
        label="Delete this type"
        testId="type-delete"
        destructive
        consequence={consequence}
        onDelete={() =>
          confirm({
            title: `Delete “${type.label}”?`,
            description: consequence,
            confirmLabel: 'Delete',
            destructive: true,
            testId: 'category-delete-confirm',
            onConfirm: () => {
              removeItemType(type.id);
              onBack();
            },
          })
        }
      />
    </div>
  );
}

/* ── habit groups ─────────────────────────────────────────────────────── */

export function GroupsSection({
  selectedId,
  onSelect,
  focusNew,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusNew: boolean;
}) {
  const habitGroups = usePlannerStore((s) => s.habitGroups);
  const items = usePlannerStore((s) => s.items);
  const addHabitGroup = usePlannerStore((s) => s.addHabitGroup);

  const [query, setQuery] = useState('');

  const selected = habitGroups.find((g) => g.id === selectedId) ?? null;
  const visible = matching(habitGroups, query, byName);

  return (
    <>
      <ListColumn
        eyebrow="HABIT GROUPS"
        count={visible.length}
        hasSelection={!!selected}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: 'Filter habit groups…',
          testId: 'group-filter',
        }}
        footer={
          <DraftRow
            placeholder="New group…"
            addLabel="Add habit group"
            testPrefix="group"
            autoFocus={focusNew}
            onAdd={(name, icon) => {
              addHabitGroup(name, icon ?? makeIconToken('Star'));
              onSelect(created(usePlannerStore.getState().habitGroups, name));
            }}
          />
        }
      >
        {habitGroups.length === 0 ? (
          <p className="text-muted-foreground px-[7px] pt-2 text-xs">No habit groups yet.</p>
        ) : (
          visible.map((group) => (
            <ObjectRow
              key={group.id}
              testId="group-row"
              idAttr={{ 'data-group-id': group.id }}
              icon={group.emoji}
              color={group.color}
              name={group.name}
              selected={selectedId === group.id}
              pill={null}
              count={countGroupHabits(items, group.name)}
              onSelect={() => onSelect(group.id)}
            />
          ))
        )}
      </ListColumn>

      <DetailColumn hasSelection={!!selected}>
        {selected ? (
          <GroupDetail group={selected} onBack={() => onSelect(null)} />
        ) : (
          <TeachingLine>Habit groups decide how your habits are stacked in the sidebar.</TeachingLine>
        )}
      </DetailColumn>
    </>
  );
}

function GroupDetail({ group, onBack }: { group: HabitGroupType; onBack: () => void }) {
  const items = usePlannerStore((s) => s.items);
  const habitGroups = usePlannerStore((s) => s.habitGroups);
  const updateHabitGroup = usePlannerStore((s) => s.updateHabitGroup);
  const removeHabitGroup = usePlannerStore((s) => s.removeHabitGroup);
  const confirm = useUIStore((s) => s.confirm);

  const n = countGroupHabits(items, group.name);
  // The SAME expression removeHabitGroup uses, so the sentence names the group
  // the habits will actually land in rather than a plausible-sounding one. The
  // old copy claimed deleting "unassigns it from all habits"; it does not — it
  // reassigns them, and the user was never told where.
  const destination = habitGroups.find((g) => g.id !== group.id)?.name ?? 'Personal';
  const consequence =
    (n === 0
      ? 'No habits are in it, so nothing moves.'
      : `Its ${n} ${n === 1 ? 'habit moves' : 'habits move'} to “${destination}” — ${
          n === 1 ? 'it isn’t' : 'they aren’t'
        } deleted.`) + ' ⌘Z brings the group back now, and it stays in the Trash for 30 days.';

  return (
    <div className="flex flex-col" data-testid="group-detail" data-group-id={group.id}>
      <BackRow label="Habit groups" testId="group-detail-back" onBack={onBack} />

      <IdentityRow
        id={group.id}
        name={group.name}
        icon={group.emoji}
        color={group.color}
        label="Habit group"
        testPrefix="group"
        editable={false}
        parkedNote={`Renaming is parked: your habits point at this group by name, so a rename would strand ${
          n === 1 ? 'the one' : `all ${n}`
        } of them. Stable ids land first.`}
        meta={
          <>
            Habit group · <span className="font-num">{n}</span> {n === 1 ? 'habit' : 'habits'}
          </>
        }
        onPatch={(patch) => updateHabitGroup(group.id, renameIconKey(patch, 'emoji'))}
      />

      <DangerZone
        label="Delete this group"
        testId="group-delete"
        consequence={consequence}
        onDelete={() =>
          confirm({
            title: `Delete “${group.name}”?`,
            description: consequence,
            confirmLabel: 'Delete',
            testId: 'category-delete-confirm',
            onConfirm: () => {
              removeHabitGroup(group.id);
              onBack();
            },
          })
        }
      />
    </div>
  );
}

/* ── patches ──────────────────────────────────────────────────────────── */

/**
 * IdentityRow's `{name, icon, color}` → the field names these three tables
 * actually use. Projects and habit groups spell the glyph `emoji`; item types
 * spell it `icon`.
 *
 * KEY PRESENCE, not value, and the difference is a real bug rather than a
 * style point. ColorSwatchPicker's `Auto` means "clear the stored colour" and
 * says so by calling `onSelect(undefined)`; a `patch.color !== undefined` test
 * drops exactly that case, producing an empty patch that the store spreads to
 * nothing and `dbUpdateProject` discards before it builds a query. The result
 * is a swatch you can set and never unset — a regression against the dialog
 * this replaces, which passes `{ color }` straight through and whose db writer
 * has always keyed on `'color' in updates`.
 *
 * `name` is deliberately dropped: all three are referenced BY NAME by their
 * children, so renaming orphans them until the stable-id migration. IdentityRow
 * renders these three as read-only, so no name key can arrive anyway — but if
 * one ever did, silently ignoring it is the safe direction.
 */
function renameIconKey<K extends 'emoji' | 'icon'>(
  patch: { name?: string; icon?: string; color?: string },
  iconKey: K
): { color?: string } & Partial<Record<K, string>> {
  const next: { color?: string } & Partial<Record<K, string>> = {};
  // The glyph column is NOT NULL on projects and habit groups, so this one
  // stays a value test — IconPicker only ever sends a real token, and writing
  // an undefined would blank a required field.
  if (patch.icon !== undefined) next[iconKey] = patch.icon as never;
  if ('color' in patch) next.color = patch.color;
  return next;
}

/* ── counts and slugs ─────────────────────────────────────────────────── */

/**
 * Usage counts, computed live rather than stored, so the number in the delete
 * sentence is the number on the canvas.
 *
 * Each one mirrors the store action that will act on it — a count that
 * disagrees with its own write is worse than no count, because it is the
 * evidence the user is deciding on.
 */
const countProjectItems = (items: Item[], name: string) =>
  items.filter((i) => i.type !== 'habit' && i.project === name).length;

const countGroupHabits = (items: Item[], name: string) =>
  items.filter((i) => i.type === 'habit' && i.group === name).length;

const countTypeItems = (items: Item[], slug: string) =>
  items.filter((i) => i.type === 'custom' && i.customType === slug).length;

/**
 * The id of the thing just created, or null.
 *
 * `addProject` / `addHabitGroup` return void and BOTH no-op silently on a
 * duplicate name, so the id has to be read back out of the store — which is
 * safe because zustand's set() is synchronous. A no-op therefore selects the
 * row that was already there, which is the honest outcome: the name is taken,
 * and here is what has it.
 *
 * EXACT FIRST, then case-folded, because the two tables disagree on purpose.
 * `addHabitGroup` de-duplicates on `name.toLowerCase()` (matching how the rest
 * of the app compares group refs — see lib/filters.ts), so typing "personal"
 * against an existing "Personal" creates nothing; an exact-only lookup would
 * then return null, wipe the selection, and leave the user with no group, no
 * selection and no explanation. `addProject` compares exactly and really does
 * create a second "personal", so a fold-only lookup would select the OLDER row
 * instead of the one just made. Trying exact first satisfies both.
 */
const created = (rows: { id: string; name: string }[], name: string) =>
  (
    rows.find((r) => r.name === name) ??
    rows.find((r) => r.name.toLowerCase() === name.toLowerCase())
  )?.id ?? null;

/** 'Goal' → 'goal', 'Side Quest' → 'side-quest' (the items.type slug). */
const slugForLabel = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');

const RESERVED_TYPE_NAMES = ['task', 'habit', 'custom'];

/**
 * The store's own rules, restated so the row can refuse BEFORE it writes — and
 * say which rule was broken.
 *
 * `addItemType` enforces all of these by returning early and writing nothing, so
 * without this the field would clear, no type would appear, and nothing on
 * screen would explain why. Each branch names the actual slug, because the slug
 * is derived from what was typed and the derivation is where the surprise is:
 * "Side Quest" becoming `side-quest` is obvious in hindsight and invisible
 * before it.
 */
function slugProblem(label: string, existing: ItemTypeDef[]): string | null {
  const slug = slugForLabel(label);
  if (!slug) return 'Use some letters or numbers.';
  if (!/^[a-z]/.test(slug)) return 'Start with a letter.';
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(slug)) {
    return slug.length > 32 ? 'A bit shorter — 32 characters at most.' : 'Letters, numbers and dashes.';
  }
  if (RESERVED_TYPE_NAMES.includes(slug)) return `“${slug}” is a built-in name — pick another.`;
  const clash = existing.find((t) => t.name === slug);
  if (clash) {
    return clash.label.toLowerCase() === label.toLowerCase()
      ? `You already have a type called “${clash.label}”.`
      : `“${clash.label}” already uses the name “${slug}”.`;
  }
  return null;
}
