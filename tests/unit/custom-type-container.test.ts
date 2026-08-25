import { describe, expect, it } from 'vitest';
import { buildCustomTypeConfig, getItemTypeConfig, hydrateCustomTypes } from '@/lib/item-registry';
import type { ItemTypeDef } from '@anchor-app/types';

/**
 * Custom types are project-shaped, and the registry has to say so.
 *
 * `containerKind` was null on the custom template while `fields` was
 * TASK_FIELDS — which carries `project`. So a custom item held a real project
 * value that no container question could see: the dialog never rendered the
 * picker (it gates on `config.containerKind`), and buildListGroups filed every
 * custom item under "No project" no matter what it actually held.
 *
 * These pin the registry ANSWER only. The consequences of that answer — the
 * three project-block move verbs and `removeProject`'s sweep, both of which had
 * to widen from `type === 'task'` once custom items started answering with a
 * project — are pinned in project-block-task-like.test.ts, which mocks the
 * store. Nothing here asserts either.
 *
 * Written against the REGISTRY rather than a rendered dialog because the
 * registry is the thing every surface asks — the dialog, grouping, the filter
 * pass-through rule, and (later) the container registry's `eligibleTypes`.
 */

const def = (name: string): ItemTypeDef => ({
  id: `id-${name}`,
  name,
  label: name,
  labelPlural: `${name}s`,
});

describe('custom item types and the container axis', () => {
  it('declares projects as the container kind, agreeing with its own fields list', () => {
    const config = buildCustomTypeConfig(def('goal'));

    expect(config.containerKind).toBe('projects');
    // The rest of the config was already project-shaped; containerKind was the
    // one field that disagreed. If any of these drift, revisit the pairing.
    expect(config.fields).toContain('project');
    expect(config.form.containerLabel).toBe('Project');
  });

  it('does not claim a habit-shaped container', () => {
    const config = buildCustomTypeConfig(def('goal'));
    // The dialog resolves `containerKind === 'projects' ? projects : habitGroups`,
    // so anything other than 'projects' silently offers habit groups.
    expect(config.containerKind).not.toBe('habitGroups');
  });

  it('resolves through getItemTypeConfig for a hydrated type', () => {
    hydrateCustomTypes([def('goal')]);
    try {
      expect(getItemTypeConfig('goal').containerKind).toBe('projects');
    } finally {
      hydrateCustomTypes([]);
    }
  });

  it('resolves for an unhydrated slug too, via the on-the-fly template', () => {
    // getItemTypeConfig is total by contract — a slug with no def still gets a
    // config. That path must carry the same container answer, or an item whose
    // type row has not loaded yet would drop out of container grouping.
    expect(getItemTypeConfig('never-registered').containerKind).toBe('projects');
  });

  it('keeps the built-in types unchanged', () => {
    expect(getItemTypeConfig('task').containerKind).toBe('projects');
    expect(getItemTypeConfig('habit').containerKind).toBe('habitGroups');
  });
});
