import { describe, it, expect, vi } from 'vitest';
import { PointerSensor, TouchSensor } from '@dnd-kit/core';
import {
  NonTouchPointerSensor,
  isTouchPointer,
  POINTER_ACTIVATION_DISTANCE_PX,
  TOUCH_ACTIVATION_DELAY_MS,
  TOUCH_ACTIVATION_TOLERANCE_PX,
} from '@/lib/dnd/sensors';

/**
 * The sensor activation policy (lib/dnd/CONTRACT.md § Sensors).
 *
 * These assert the ONE property the whole fix rests on: a touch pointer must be
 * DECLINED by the pointer sensor, because dnd-kit hands a gesture to the first
 * sensor that claims it and `pointerdown` beats `touchstart`. A sensor that
 * claims the finger leaves the TouchSensor's press-and-hold unreachable and the
 * list unscrollable, which is the bug this file guards.
 *
 * The activator is exercised directly here because the thing under test is a
 * pure predicate over the native event, and this is the cheapest way to pin its
 * edges — the unlabelled `pointerType`, the secondary-pointer gate.
 *
 * It is NOT the whole story, and an earlier version of this comment claimed it
 * was ("jsdom has no real pointer pipeline"). jsdom has one: it implements
 * PointerEvent and TouchEvent, and a review demonstrated that reverting the
 * shell to a plain `PointerSensor` — the original bug, exactly — left this file
 * 9/9 green, because a predicate nobody mounts is still a correct predicate.
 * `dnd-sensor-pipeline.test.tsx` mounts the shell's own sensor set in a real
 * DndContext and is the file that goes red on that revert. Both are needed:
 * this one says the rule is right, that one says the rule is in force.
 */

const activator = NonTouchPointerSensor.activators[0];
type ActivatorEvent = Parameters<typeof activator.handler>[0];

/** The synthetic-event shape dnd-kit's binder passes to an activator. */
function press(
  pointerType: string,
  overrides: { isPrimary?: boolean; button?: number } = {}
): ActivatorEvent {
  return {
    nativeEvent: { isPrimary: true, button: 0, pointerType, ...overrides },
  } as unknown as ActivatorEvent;
}

describe('NonTouchPointerSensor', () => {
  it('listens on the same activator event as PointerSensor', () => {
    expect(activator.eventName).toBe('onPointerDown');
    expect(activator.eventName).toBe(PointerSensor.activators[0].eventName);
  });

  it('declines a touch pointer so the TouchSensor can take the gesture', () => {
    const onActivation = vi.fn();
    expect(activator.handler(press('touch'), { onActivation })).toBe(false);
    // Not merely "returns false": calling onActivation would mark the native
    // event as captured and the following touchstart would be ignored.
    expect(onActivation).not.toHaveBeenCalled();
  });

  it('claims mouse and pen exactly as PointerSensor does', () => {
    for (const type of ['mouse', 'pen']) {
      const onActivation = vi.fn();
      expect(activator.handler(press(type), { onActivation })).toBe(true);
      expect(onActivation).toHaveBeenCalledTimes(1);
    }
  });

  it('treats an unlabelled pointerType as non-touch, not as touch', () => {
    // Erring the other way would disable drag outright on any engine that leaves
    // the field blank.
    expect(activator.handler(press(''), {})).toBe(true);
  });

  it('keeps upstream secondary-pointer and button gates', () => {
    expect(activator.handler(press('mouse', { isPrimary: false }), {})).toBe(false);
    expect(activator.handler(press('mouse', { button: 2 }), {})).toBe(false);
  });
});

describe('isTouchPointer', () => {
  it('is true only for a finger', () => {
    expect(isTouchPointer({ pointerType: 'touch' })).toBe(true);
    expect(isTouchPointer({ pointerType: 'mouse' })).toBe(false);
    expect(isTouchPointer({ pointerType: 'pen' })).toBe(false);
    expect(isTouchPointer({})).toBe(false);
  });
});

describe('activation constraints', () => {
  it('leaves the desktop distance threshold untouched', () => {
    expect(POINTER_ACTIVATION_DISTANCE_PX).toBe(5);
  });

  it('makes touch press-and-hold, with a tight drift budget', () => {
    // The delay must be long enough to outlast a flick and short enough not to
    // feel stalled; the tolerance must be tight, because exceeding it CANCELS
    // the pending drag and lets the browser keep scrolling.
    expect(TOUCH_ACTIVATION_DELAY_MS).toBeGreaterThanOrEqual(200);
    expect(TOUCH_ACTIVATION_DELAY_MS).toBeLessThanOrEqual(300);
    expect(TOUCH_ACTIVATION_TOLERANCE_PX).toBeLessThanOrEqual(8);
  });

  it('still activates the TouchSensor on touchstart', () => {
    // If dnd-kit ever moved this, the fall-through the pointer sensor's refusal
    // depends on would land nowhere and touch drag would disappear silently.
    expect(TouchSensor.activators[0].eventName).toBe('onTouchStart');
  });
});
