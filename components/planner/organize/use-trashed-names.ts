'use client';

import { useEffect, useState } from 'react';
import { usePlannerStore } from '@/lib/planner-store';
import { fetchTrashedNames, type TrashedName } from '@/lib/db';

/**
 * The container names a trashed row is still holding.
 *
 * `projects_user_id_name_key` and `habit_groups_user_id_name_key` are PLAIN
 * unique indexes over `(user_id, name)` — no `WHERE deleted_at IS NULL` — so a
 * deleted container reserves its name for the full 30 days while being
 * invisible to `usePlannerStore`, whose arrays come from `deleted_at`-filtered
 * fetches. The store literally cannot see the row that is about to reject the
 * write.
 *
 * That gap is a live bug on BOTH container paths, and the create half is the
 * louder one. `addProject` de-dupes against live rows, passes, `set()`s
 * optimistically, and only then does the insert raise 23505 into a
 * `.catch(console.error)`. The console then selects the phantom, opens its
 * detail pane, and accepts a glyph, a colour and a whole time block — every one
 * an `.eq('id', …)` update matching zero rows — while any item filed into it
 * fails its own write on `items_project_id_fkey`. Nothing on screen says a
 * word, and the lot evaporates on the next reload.
 *
 * Fetched once per section mount, not subscribed. The bin changes when the user
 * deletes something, and a delete already unmounts nothing — but it also cannot
 * make this list STALE in the dangerous direction: a name that entered the bin
 * during this visit is one the store still knows about live, so the ordinary
 * sibling check catches it. Staleness here can only cost a refusal that is no
 * longer needed, never a phantom.
 */
export function useTrashedNames(): { projects: TrashedName[]; groups: TrashedName[] } {
  const userId = usePlannerStore((s) => s.userId);
  const [names, setNames] = useState<{ projects: TrashedName[]; groups: TrashedName[] }>({
    projects: [],
    groups: [],
  });

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchTrashedNames(userId)
      .then((rows) => {
        if (live) setNames(rows);
      })
      // FAILS OPEN, and the catch has to be here rather than only inside
      // fetchTrashedNames: the query error is handled there, but constructing
      // the client can reject too (no env, no session), and an unhandled
      // rejection out of a render effect is a different kind of breakage from
      // the one this guard is worth. Falling back to the empty list restores
      // exactly today's behaviour — the create can still produce a phantom —
      // which is a bug that reappears with the network, not a create row that
      // refuses everything because a lookup is down.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId]);

  return names;
}

/**
 * The sentence for a name a trashed container is holding, or null.
 *
 * EXACT match, not case-folded, and that is the DB's rule rather than a choice:
 * `projects.name` is plain `text` and the unique index is case-sensitive, so
 * "work" against a trashed "Work" inserts perfectly well. Refusing it would
 * block a name Postgres accepts — the opposite failure, and just as invisible
 * to the person typing.
 *
 * The message names the Trash because the bin is the fix. Without it this reads
 * as the app inventing a rule about a container the user cannot see anywhere.
 */
export function heldByTrash(
  trashed: TrashedName[],
  next: string,
  noun: string,
): string | null {
  const holder = trashed.find((t) => t.name === next);
  if (!holder) return null;
  return `A deleted ${noun} called “${holder.name}” still has that name. Restore it from Trash, or pick a different one.`;
}
