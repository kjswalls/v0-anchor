/**
 * Module-level hovered-item ref — written by TaskRow on mouseenter/leave and
 * read ONLY inside keyboard event handlers (edit_hovered / delete_hovered in
 * app-shell). Deliberately NOT reactive state: a store write on every hover
 * re-rendered the whole shell tree (app-shell + every visible row subscribe
 * to planner-store without selectors), making row highlights feel sluggish.
 * planner-store's hoveredItemId/hoveredItemType remain for the legacy
 * timeline until P8 cleanup.
 */

export type HoveredItemType = 'task' | 'habit' | null;

export const hoveredItem: { id: string | null; type: HoveredItemType } = {
  id: null,
  type: null,
};

export function setHoveredItemRef(id: string | null, type: HoveredItemType) {
  hoveredItem.id = id;
  hoveredItem.type = type;
}
