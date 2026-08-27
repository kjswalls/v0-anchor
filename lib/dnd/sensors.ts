import { PointerSensor } from '@dnd-kit/core';
import type { PointerSensorOptions } from '@dnd-kit/core';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Sensor activation policy — the one place that decides what starts a drag.
 *
 * ## Why this file exists at all
 *
 * The shell used to hand `useSensors` a `PointerSensor` (distance 5) *and* a
 * `TouchSensor` (delay 250 / tolerance 5) and assume the second one governed
 * touch. It never did. Two facts about dnd-kit combine to make that config a
 * no-op on a phone:
 *
 * 1. `PointerSensor` activates on `onPointerDown`, and pointer events fire for
 *    *every* input type — finger included, with `pointerType === 'touch'`.
 * 2. dnd-kit lets exactly one sensor claim a gesture. `DndContext`'s activator
 *    binder bails with "another sensor is already instantiating" the moment
 *    `activeRef.current !== null`, and the browser fires `pointerdown` *before*
 *    `touchstart`. So PointerSensor won every touch, every time, and the
 *    TouchSensor's delay was dead configuration.
 *
 * The consequence is the bug: on touch, 5px of finger travel — less than the
 * slop of an ordinary flick — committed to a drag. The list then scrolled *and*
 * a row lifted, which is what "dnd interferes with scrolling" means. It also put
 * dnd-kit in a fight with `components/mobile/swipe-row.tsx`, whose `react-swipeable`
 * handler claims horizontal intent at 10px: the drag activated first, at 5px, so
 * a swipe-to-reveal and a drag ran on the same finger.
 *
 * ## The fix
 *
 * Split the input types by SENSOR, never by viewport. A media query would get a
 * touchscreen laptop wrong in both directions — its trackpad deserves the
 * instant 5px drag, its screen does not. `pointerType` is the honest signal and
 * it is per-gesture.
 *
 * `NonTouchPointerSensor` declines touch pointers. Declining is not the same as
 * consuming: the activator returns `false`, so `activeRef` stays null, the
 * native event is left unmarked, and the `touchstart` that follows reaches
 * `TouchSensor` normally. Mouse and pen keep the byte-identical PointerSensor
 * path — same `isPrimary`/`button` gate, same distance constraint, same class —
 * so desktop feel is untouched.
 */
export class NonTouchPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        { nativeEvent: event }: ReactPointerEvent,
        { onActivation }: PointerSensorOptions
      ) => {
        // Upstream's gate, kept verbatim so mouse/pen behaviour does not move:
        // secondary pointers and non-left buttons never dragged and still don't.
        if (!event.isPrimary || event.button !== 0) {
          return false;
        }
        // …and the one line this class exists for. Fingers fall through to the
        // TouchSensor's press-and-hold below.
        if (isTouchPointer(event)) {
          return false;
        }
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/**
 * True for a finger, false for a mouse, pen or an event whose type the browser
 * left blank (older engines send `''`, which we must read as "not a finger" —
 * treating an unlabelled pointer as touch would silently disable desktop drag).
 */
export function isTouchPointer(event: { pointerType?: string }): boolean {
  return event.pointerType === 'touch';
}

/**
 * Which input type a gesture belongs to, as one word.
 *
 * `'pointer'` is the set `NonTouchPointerSensor` claims — mouse, pen, and any
 * pointer the browser left unlabelled. `'touch'` is a finger. It is the same
 * split the sensors above make, named once so code that has to ask "is this a
 * finger?" *after* activation does not re-invent it (or, worse, re-invent it as
 * a viewport query).
 */
export type DragInput = 'touch' | 'pointer';

/**
 * Classify a drag from the event that STARTED it.
 *
 * dnd-kit keeps the activator's native event on the drag — `DragStartEvent` and
 * `DragEndEvent` both carry `activatorEvent`, set from `event.nativeEvent` when
 * a sensor claims the gesture — so this is per-GESTURE and honest, for the same
 * reason `pointerType` beats a media query in the sensor split above. A
 * touchscreen laptop gets `'pointer'` for its trackpad and `'touch'` for its
 * screen, in the same session, with no capability sniffing anywhere.
 *
 * Two event shapes reach here, one per sensor:
 * - `NonTouchPointerSensor` → a `PointerEvent`, which carries `pointerType`.
 * - `TouchSensor` → a `touchstart` `TouchEvent`, which carries no `pointerType`
 *   at all; `touches` is the field that says finger.
 *
 * Deliberately not "whatever the pointer sensor declined": reading `touches`
 * directly means this keeps answering correctly even if the sensor policy above
 * is ever reverted, so the two touch rules cannot half-revert each other.
 *
 * Anything else — a keyboard sensor's event, a null activator, a shape neither
 * branch recognises — reads as `'pointer'`, the same direction `isTouchPointer`
 * errs in and for the same reason: an unrecognised input must never silently
 * lose a capability that mouse and pen have.
 */
export function dragInputOf(activatorEvent: Event | null | undefined): DragInput {
  const event = activatorEvent as Partial<PointerEvent & TouchEvent> | null | undefined;
  if (!event) return 'pointer';
  if (typeof event.pointerType === 'string') {
    return isTouchPointer(event) ? 'touch' : 'pointer';
  }
  if (event.touches) return 'touch';
  return 'pointer';
}

/**
 * 5px: low enough that the ghost appears near-instantly, high enough that a
 * jittery click doesn't register as a drag (rows open the edit dialog on click).
 * Unchanged from the original PointerSensor config on purpose.
 */
export const POINTER_ACTIVATION_DISTANCE_PX = 5;

/**
 * Press-and-hold before a finger drag starts.
 *
 * 250ms is the value the code and three comments have claimed all along (see
 * `swipe-row.tsx`, `task-row.tsx`, `schedule-sheet.tsx`) — this change is what
 * finally makes it true, so keeping the number keeps those notes honest. It also
 * sits where it needs to: comfortably past the ~100ms a flick-scroll spends
 * under the finger before it moves, and comfortably short of the ~500ms iOS
 * spends on its own long-press, so a deliberate hold does not feel stalled.
 */
export const TOUCH_ACTIVATION_DELAY_MS = 250;

/**
 * How far the finger may drift during those 250ms before the pending drag is
 * abandoned.
 *
 * Small on purpose, and the direction of the trade matters: exceeding the
 * tolerance CANCELS the drag, and nothing has called `preventDefault` yet, so
 * the browser's own scroll — already underway — simply continues untouched. A
 * tight 5px therefore means "any real scroll wins immediately"; a generous
 * tolerance would mean a scrolling finger still gets a row lifted under it,
 * which is the bug this file is about. The cost is that a very shaky hold has to
 * be re-attempted, which is the cheaper failure of the two.
 */
export const TOUCH_ACTIVATION_TOLERANCE_PX = 5;
