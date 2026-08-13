import { describe, it, expect } from 'vitest';
import {
  CLASSIFY_KINDS,
  CONTAINER_KINDS,
  GATE_KINDS,
  NO_CONTAINER,
  classifyKindForItemType,
  containerKindOf,
  containerName,
  containerRef,
  foldRef,
  getContainerKindConfig,
  namesOfKind,
  sameContainerRef,
  unsetContainerRef,
  type ContainerKind,
} from '@/lib/container-registry';
import { getAllItemTypeNames, getItemTypeConfig } from '@/lib/item-registry';
import { containerRefOf } from '@/lib/filters';
import type { Item } from '@/lib/planner-types';

/**
 * Phase A — the container registry.
 *
 * Two things are being pinned, and they are different in kind. The first is the
 * ROLE SEAM: classify kinds are the ones an item answers with, gate kinds are
 * the ones that switch it off, and nothing may hold both jobs. That seam is what
 * keeps a routine out of a filter clause and a project out of the scope rail,
 * and it is stated once here rather than implied by which module you happen to
 * be reading.
 *
 * The second is the REF GRAMMAR, which moved out of lib/filters.ts unchanged.
 * Its cases are all real data: names with colons in them, both spellings of a
 * habit group, and the legacy unprefixed values a stored payload still holds.
 */

describe('the role seam', () => {
  it('sorts the four kinds into classify and gate, and nothing sits in both', () => {
    expect([...CLASSIFY_KINDS]).toEqual(['project', 'group']);
    expect([...GATE_KINDS]).toEqual(['routine', 'program']);

    const all = Object.keys(CONTAINER_KINDS) as ContainerKind[];
    expect(all.length).toBe(CLASSIFY_KINDS.length + GATE_KINDS.length);
    for (const kind of all) {
      const inClassify = (CLASSIFY_KINDS as readonly string[]).includes(kind);
      const inGate = (GATE_KINDS as readonly string[]).includes(kind);
      expect(inClassify).toBe(!inGate);
    }
  });

  it('derives the two lists from `role`, so a kind cannot be forgotten in one of them', () => {
    // The lists are Object.values(...).filter(role === …) rather than literals.
    // If either is ever hand-listed this disagrees the moment a role changes.
    for (const kind of CLASSIFY_KINDS) expect(getContainerKindConfig(kind).role).toBe('classify');
    for (const kind of GATE_KINDS) expect(getContainerKindConfig(kind).role).toBe('gate');
  });

  /**
   * The load-bearing half. A gate is many-to-many through a join table, so it
   * has no column on the item and no unset state — an item is in a routine or it
   * is not. Give one an `itemField` and `containerRefOf` starts answering with
   * it, which is the filter axis quietly acquiring a value no single item can
   * hold.
   */
  it('gives every classify kind an item field and an unset label, and no gate kind either', () => {
    for (const kind of CLASSIFY_KINDS) {
      const config = getContainerKindConfig(kind);
      expect(config.itemField).not.toBeNull();
      expect(config.unsetLabel).toBeTruthy();
      expect(config.itemTypeKey).not.toBeNull();
    }
    for (const kind of GATE_KINDS) {
      const config = getContainerKindConfig(kind);
      expect(config.itemField).toBeNull();
      expect(config.unsetLabel).toBeNull();
      expect(config.itemTypeKey).toBeNull();
    }
  });

  /**
   * A gate kind is not a ref namespace. `routine:abc` looks exactly like a
   * container ref and must still resolve to null, or a routine id could be
   * dropped into `filters.containers` and read as a container the user picked.
   */
  it('refuses to read a gate kind as a ref namespace', () => {
    for (const kind of GATE_KINDS) {
      expect(containerKindOf(`${kind}:some-uuid`)).toBeNull();
    }
  });

  /**
   * Cross-registry: the field a classify kind names must actually exist on the
   * item types that resolve to it. `fields` is Object.keys(taskShape) /
   * Object.keys(habitShape), so this is checked against the wire schemas rather
   * than against a second copy of them — which is the check that bites when
   * packages/types moves in Phase B.
   */
  it('names a field the item types carrying that kind actually have', () => {
    for (const typeName of getAllItemTypeNames()) {
      const config = getItemTypeConfig(typeName);
      const kind = classifyKindForItemType(config.containerKind);
      if (kind === null) continue;
      const field = getContainerKindConfig(kind).itemField!;
      expect(config.fields, `${typeName} carries ${field}`).toContain(field);
    }
  });
});

describe('the ref grammar', () => {
  it('round-trips a name containing a colon', () => {
    // Project names are unvalidated free text — manage-categories only trims,
    // and there is no CHECK constraint — so "Client: Acme" is a legal name.
    const ref = containerRef('project', 'Client: Acme');
    expect(containerKindOf(ref)).toBe('project');
    expect(containerName(ref)).toBe('Client: Acme');
  });

  it('returns an unprefixed legacy value as-is, with no kind', () => {
    expect(containerName('Work')).toBe('Work');
    expect(containerKindOf('Work')).toBeNull();
  });

  it('keeps the two namespaces apart when they share a name', () => {
    // DEFAULT_PROJECTS and DEFAULT_HABIT_GROUPS both seed Work.
    const project = containerRef('project', 'Work');
    const group = containerRef('group', 'Work');
    expect(project).not.toBe(group);
    expect(sameContainerRef(project, group)).toBe(false);
  });

  it('tags the unset key by kind, and cannot collide with a real ref', () => {
    expect(unsetContainerRef('project')).toBe(`${NO_CONTAINER}project`);
    expect(unsetContainerRef('group')).toBe(`${NO_CONTAINER}group`);
    // 'none' is not a kind, so a heading key never reads as a container.
    expect(containerKindOf(unsetContainerRef('group'))).toBeNull();
  });

  it('splits a mixed selection by kind, ignoring the other half', () => {
    const refs = [
      containerRef('project', 'Work'),
      containerRef('group', 'Work'),
      containerRef('project', 'Q3: launch'),
      'legacy-bare-name',
    ];
    expect(namesOfKind(refs, 'project')).toEqual(['Work', 'Q3: launch']);
    expect(namesOfKind(refs, 'group')).toEqual(['Work']);
  });
});

describe('the case policy', () => {
  /**
   * Habit groups fold and projects do not. Not a preference: makeAddDraft writes
   * a lowercase 'personal' against DEFAULT_HABIT_GROUPS' capitalised 'Personal'
   * whenever the groups list has not loaded yet, so both spellings live in real
   * data and the menu's single "Personal" checkbox has to select them together.
   */
  it('folds habit-group refs and leaves project refs alone', () => {
    expect(sameContainerRef('group:Personal', 'group:personal')).toBe(true);
    expect(sameContainerRef('project:Work', 'project:work')).toBe(false);
  });

  it('reads the policy off `caseFold` rather than off the prefix string', () => {
    // The assertion that makes A′ a one-line change: whatever each kind's flag
    // says, foldRef agrees with it.
    for (const kind of CLASSIFY_KINDS) {
      const folds = getContainerKindConfig(kind).caseFold;
      expect(sameContainerRef(containerRef(kind, 'Mixed Case'), containerRef(kind, 'mixed case'))).toBe(
        folds
      );
    }
  });

  it('leaves unprefixed and unset refs untouched', () => {
    // An unprefixed value is legacy free text whose case nothing has ever
    // folded; `none:project` is a heading key, not a name.
    expect(foldRef('Work')).toBe('Work');
    expect(foldRef(unsetContainerRef('project'))).toBe(unsetContainerRef('project'));
    expect(foldRef(NO_CONTAINER)).toBe(NO_CONTAINER);
  });

  it('does not fold a ref whose prefix is merely case-similar to a kind', () => {
    // 'GROUP:a' names no kind, so it is not a group ref and must not match one.
    expect(sameContainerRef('group:a', 'GROUP:a')).toBe(false);
  });
});

describe('containerRefOf reads the field the registry names', () => {
  const asItem = (partial: Record<string, unknown>) => partial as unknown as Item;

  it('resolves each type through its kind, with no task/habit branch', () => {
    expect(containerRefOf(asItem({ type: 'task', project: 'Work' }))).toBe('project:Work');
    expect(containerRefOf(asItem({ type: 'habit', group: 'health' }))).toBe('group:health');
    // Custom types are project-shaped (registry containerKind 'projects').
    expect(containerRefOf(asItem({ type: 'custom', customType: 'goal', project: 'Work' }))).toBe(
      'project:Work'
    );
  });

  it('reads the OTHER kind\'s column as unset, never as a container', () => {
    // A habit carrying a stray `project` answers with its group, which is
    // absent — the field is chosen by kind, not by whichever one is populated.
    expect(containerRefOf(asItem({ type: 'habit', project: 'Work' }))).toBe(NO_CONTAINER);
    expect(containerRefOf(asItem({ type: 'task', group: 'health' }))).toBe(NO_CONTAINER);
  });

  it('treats an empty string as unset', () => {
    // itemFromRow maps `group: row.group ?? ''` (db.ts:108), so '' is live data.
    expect(containerRefOf(asItem({ type: 'habit', group: '' }))).toBe(NO_CONTAINER);
    expect(containerRefOf(asItem({ type: 'task' }))).toBe(NO_CONTAINER);
  });
});

describe('classifyKindForItemType', () => {
  it('translates between the two registries\' spellings', () => {
    // The item registry names the TABLE (plural), the ref grammar names the
    // NAMESPACE (singular). This is the one function that knows both.
    expect(classifyKindForItemType('projects')).toBe('project');
    expect(classifyKindForItemType('habitGroups')).toBe('group');
    expect(classifyKindForItemType(null)).toBeNull();
  });

  it('agrees with every shipped item type', () => {
    expect(classifyKindForItemType(getItemTypeConfig('task').containerKind)).toBe('project');
    expect(classifyKindForItemType(getItemTypeConfig('habit').containerKind)).toBe('group');
  });
});
