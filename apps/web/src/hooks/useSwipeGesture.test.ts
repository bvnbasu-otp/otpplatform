import { describe, expect, it, vi } from 'vitest';
import {
  computeSwipeDirection,
  SwipeGestureTracker,
  useSwipeGesture,
} from './useSwipeGesture';

describe('useSwipeGesture & UX Navigation Standards', () => {
  describe('1. Pure computeSwipeDirection Algorithm', () => {
    it('detects standard horizontal left swipe when deltaX <= -50 and dominant', () => {
      // Start at (200, 100), end at (100, 105) -> dx = -100, dy = 5
      const direction = computeSwipeDirection(200, 100, 100, 105);
      expect(direction).toBe('left');
    });

    it('detects standard horizontal right swipe when deltaX >= 50 and dominant', () => {
      // Start at (100, 100), end at (220, 95) -> dx = 120, dy = -5
      const direction = computeSwipeDirection(100, 100, 220, 95);
      expect(direction).toBe('right');
    });

    it('detects vertical up and down swipes when vertical dominance is met', () => {
      // Up: Start at (100, 300), end at (105, 180) -> dy = -120, dx = 5
      expect(computeSwipeDirection(100, 300, 105, 180)).toBe('up');

      // Down: Start at (100, 100), end at (110, 250) -> dy = 150, dx = 10
      expect(computeSwipeDirection(100, 100, 110, 250)).toBe('down');
    });

    it('rejects gestures with displacement less than minDelta (default 50px)', () => {
      // DeltaX = 35px (< 50px threshold)
      const direction = computeSwipeDirection(100, 100, 135, 100);
      expect(direction).toBeNull();
    });

    it('rejects accidental horizontal triggers during vertical card scrolling (horizontal dominance ratio = 1.5)', () => {
      // User scrolls down 120px while finger naturally drifts 55px left
      // abs(dx) = 55, abs(dy) = 120. 55 is NOT >= 120 * 1.5 (180).
      // So horizontal swipe must NOT trigger.
      const direction = computeSwipeDirection(200, 100, 145, 220);
      expect(direction).not.toBe('left');
      expect(direction).toBe('down');
    });

    it('rejects diagonal ambiguous gestures where neither axis satisfies 1.5 ratio', () => {
      // dx = 60, dy = 50 -> 60 is not >= 75 (50*1.5), 50 is not >= 90 (60*1.5)
      const direction = computeSwipeDirection(100, 100, 160, 150);
      expect(direction).toBeNull();
    });

    it('supports custom minDelta and dominance ratios', () => {
      const customOptions = {
        minDelta: 100,
        horizontalDominanceRatio: 2.0,
      };

      // dx = 80 (< 100 custom minDelta)
      expect(computeSwipeDirection(100, 100, 180, 100, customOptions)).toBeNull();

      // dx = 120, dy = 70 -> abs(dx) = 120, abs(dy)*2 = 140 (fails 2.0 ratio)
      expect(computeSwipeDirection(100, 100, 220, 170, customOptions)).toBeNull();

      // dx = 150, dy = 50 -> 150 >= 100 * 1.5 (passes 2.0 ratio: 150 >= 100)
      expect(computeSwipeDirection(100, 100, 250, 150, customOptions)).toBe('right');
    });
  });

  describe('2. SwipeGestureTracker Core State & Callback Engine', () => {
    it('fires onSwipeLeft when user swipes finger to the left', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();

      const tracker = new SwipeGestureTracker({
        onSwipeLeft,
        onSwipeRight,
        minDelta: 50,
      });

      tracker.handleTouchStart({ clientX: 250, clientY: 100 });
      const moveRes = tracker.handleTouchMove({ clientX: 150, clientY: 105 });
      expect(moveRes?.dx).toBe(-100);
      expect(moveRes?.direction).toBe('left');

      const endRes = tracker.handleTouchEnd({ clientX: 150, clientY: 105 });
      expect(endRes).toBe('left');
      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
      expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('fires onSwipeRight when user swipes finger to the right', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();

      const tracker = new SwipeGestureTracker({
        onSwipeLeft,
        onSwipeRight,
        minDelta: 50,
      });

      tracker.handleTouchStart({ clientX: 100, clientY: 100 });
      const moveRes = tracker.handleTouchMove({ clientX: 220, clientY: 98 });
      expect(moveRes?.dx).toBe(120);
      expect(moveRes?.direction).toBe('right');

      const endRes = tracker.handleTouchEnd({ clientX: 220, clientY: 98 });
      expect(endRes).toBe('right');
      expect(onSwipeRight).toHaveBeenCalledTimes(1);
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('does not fire callbacks when disabled is true', () => {
      const onSwipeLeft = vi.fn();
      const tracker = new SwipeGestureTracker({
        onSwipeLeft,
        disabled: true,
      });

      const started = tracker.handleTouchStart({ clientX: 250, clientY: 100 });
      expect(started).toBe(false);

      const moveRes = tracker.handleTouchMove({ clientX: 100, clientY: 100 });
      expect(moveRes).toBeNull();

      const endRes = tracker.handleTouchEnd({ clientX: 100, clientY: 100 });
      expect(endRes).toBeNull();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('does not fire callbacks on touch cancel', () => {
      const onSwipeLeft = vi.fn();
      const tracker = new SwipeGestureTracker({
        onSwipeLeft,
      });

      tracker.handleTouchStart({ clientX: 250, clientY: 100 });
      tracker.handleTouchCancel();
      expect(tracker.isTracking).toBe(false);

      const endRes = tracker.handleTouchEnd({ clientX: 100, clientY: 100 });
      expect(endRes).toBeNull();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('does not fire callbacks when gesture duration exceeds maxDurationMs', () => {
      const onSwipeLeft = vi.fn();
      const tracker = new SwipeGestureTracker({
        onSwipeLeft,
        maxDurationMs: 200,
      });

      tracker.handleTouchStart({ clientX: 250, clientY: 100 });
      tracker.startTime = Date.now() - 500; // Simulate 500ms elapsed

      const endRes = tracker.handleTouchEnd({ clientX: 100, clientY: 100 });
      expect(endRes).toBeNull();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('3. Export & Types Verification', () => {
    it('exports useSwipeGesture hook and SwipeGestureTracker', () => {
      expect(useSwipeGesture).toBeDefined();
      expect(SwipeGestureTracker).toBeDefined();
      expect(computeSwipeDirection).toBeDefined();
    });
  });
});
