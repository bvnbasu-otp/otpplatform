import { useRef, useCallback, useState, useEffect } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down' | null;

export interface SwipeGestureOptions {
  /** Callback fired when swiped towards the left (typically Next step) */
  onSwipeLeft?: () => void;
  /** Callback fired when swiped towards the right (typically Previous step) */
  onSwipeRight?: () => void;
  /** Callback fired when swiped upwards */
  onSwipeUp?: () => void;
  /** Callback fired when swiped downwards */
  onSwipeDown?: () => void;
  /** Minimum horizontal/vertical delta in pixels required to trigger swipe (default: 50px) */
  minDelta?: number;
  /**
   * Ratio of horizontal delta to vertical delta required for a horizontal swipe (default: 1.5).
   * Prevents accidental triggers during vertical card scrolling.
   */
  horizontalDominanceRatio?: number;
  /**
   * Ratio of vertical delta to horizontal delta required for a vertical swipe (default: 1.5).
   */
  verticalDominanceRatio?: number;
  /** Maximum duration in ms for a gesture to count as a swipe (default: 1000ms) */
  maxDurationMs?: number;
  /** Disable gesture recognition */
  disabled?: boolean;
}

export interface SwipeGestureState {
  isSwiping: boolean;
  swipeDirection: SwipeDirection;
  deltaX: number;
  deltaY: number;
}

export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: () => void;
}

export interface UseSwipeGestureReturn extends SwipeHandlers, SwipeGestureState {
  handlers: SwipeHandlers;
  ref: (node: HTMLElement | null) => void;
}

/**
 * Pure helper function to compute swipe direction based on touch coordinates and dominance thresholds.
 */
export function computeSwipeDirection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  options?: Pick<
    SwipeGestureOptions,
    'minDelta' | 'horizontalDominanceRatio' | 'verticalDominanceRatio'
  >
): SwipeDirection {
  const minDelta = options?.minDelta ?? 50;
  const hRatio = options?.horizontalDominanceRatio ?? 1.5;
  const vRatio = options?.verticalDominanceRatio ?? 1.5;

  const dx = endX - startX;
  const dy = endY - startY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Horizontal dominance check
  if (absDx >= minDelta && absDx >= absDy * hRatio) {
    return dx < 0 ? 'left' : 'right';
  }

  // Vertical dominance check
  if (absDy >= minDelta && absDy >= absDx * vRatio) {
    return dy < 0 ? 'up' : 'down';
  }

  return null;
}

/**
 * Framework-agnostic gesture tracker for managing swipe events, coordinates, and thresholds.
 */
export class SwipeGestureTracker {
  private options: SwipeGestureOptions;
  public startX = 0;
  public startY = 0;
  public currentX = 0;
  public currentY = 0;
  public startTime = 0;
  public isTracking = false;

  constructor(options: SwipeGestureOptions = {}) {
    this.options = options;
  }

  public setOptions(options: SwipeGestureOptions) {
    this.options = options;
  }

  public handleTouchStart(touch: { clientX: number; clientY: number }) {
    if (this.options.disabled) return false;
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.currentX = touch.clientX;
    this.currentY = touch.clientY;
    this.startTime = Date.now();
    this.isTracking = true;
    return true;
  }

  public handleTouchMove(touch: { clientX: number; clientY: number }) {
    if (this.options.disabled || !this.isTracking) return null;
    this.currentX = touch.clientX;
    this.currentY = touch.clientY;

    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;
    const direction = computeSwipeDirection(
      this.startX,
      this.startY,
      touch.clientX,
      touch.clientY,
      this.options
    );

    return { dx, dy, direction };
  }

  public handleTouchEnd(touch?: { clientX: number; clientY: number }): SwipeDirection {
    if (this.options.disabled || !this.isTracking) return null;
    if (touch) {
      this.currentX = touch.clientX;
      this.currentY = touch.clientY;
    }
    this.isTracking = false;

    const duration = Date.now() - this.startTime;
    const maxDuration = this.options.maxDurationMs ?? 1000;
    const direction = computeSwipeDirection(
      this.startX,
      this.startY,
      this.currentX,
      this.currentY,
      this.options
    );

    if (duration > maxDuration || !direction) {
      return null;
    }

    if (direction === 'left' && this.options.onSwipeLeft) {
      this.options.onSwipeLeft();
    } else if (direction === 'right' && this.options.onSwipeRight) {
      this.options.onSwipeRight();
    } else if (direction === 'up' && this.options.onSwipeUp) {
      this.options.onSwipeUp();
    } else if (direction === 'down' && this.options.onSwipeDown) {
      this.options.onSwipeDown();
    }

    return direction;
  }

  public handleTouchCancel() {
    this.isTracking = false;
  }
}

/**
 * Reusable React Hook for horizontal & vertical touch swipe gestures.
 * Ensures strict minimum displacement (50px default) and horizontal dominance
 * so vertical card scrolling never accidentally triggers pipeline screen steps.
 */
export function useSwipeGesture(options: SwipeGestureOptions = {}): UseSwipeGestureReturn {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    minDelta = 50,
    horizontalDominanceRatio = 1.5,
    verticalDominanceRatio = 1.5,
    maxDurationMs = 1000,
    disabled = false,
  } = options;

  // Track options inside a mutable ref and instance
  const trackerRef = useRef<SwipeGestureTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new SwipeGestureTracker(options);
  }
  useEffect(() => {
    trackerRef.current?.setOptions({
      onSwipeLeft,
      onSwipeRight,
      onSwipeUp,
      onSwipeDown,
      minDelta,
      horizontalDominanceRatio,
      verticalDominanceRatio,
      maxDurationMs,
      disabled,
    });
  });

  const [state, setState] = useState<SwipeGestureState>({
    isSwiping: false,
    swipeDirection: null,
    deltaX: 0,
    deltaY: 0,
  });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      if (!touch) return;

      const started = trackerRef.current?.handleTouchStart({
        clientX: touch.clientX,
        clientY: touch.clientY,
      });

      if (started) {
        setState({
          isSwiping: true,
          swipeDirection: null,
          deltaX: 0,
          deltaY: 0,
        });
      }
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      if (!touch) return;

      const moveRes = trackerRef.current?.handleTouchMove({
        clientX: touch.clientX,
        clientY: touch.clientY,
      });

      if (moveRes) {
        setState((prev) => ({
          ...prev,
          deltaX: moveRes.dx,
          deltaY: moveRes.dy,
          swipeDirection: moveRes.direction,
        }));
      }
    },
    []
  );

  const handleTouchEnd = useCallback(
    (e?: React.TouchEvent | TouchEvent) => {
      const touch = e && e.touches && e.touches.length > 0 ? e.touches[0] : undefined;
      trackerRef.current?.handleTouchEnd(
        touch ? { clientX: touch.clientX, clientY: touch.clientY } : undefined
      );

      setState({
        isSwiping: false,
        swipeDirection: null,
        deltaX: 0,
        deltaY: 0,
      });
    },
    []
  );

  const handleTouchCancel = useCallback(() => {
    trackerRef.current?.handleTouchCancel();
    setState({
      isSwiping: false,
      swipeDirection: null,
      deltaX: 0,
      deltaY: 0,
    });
  }, []);

  const handlers: SwipeHandlers = {
    onTouchStart: handleTouchStart as (e: React.TouchEvent) => void,
    onTouchMove: handleTouchMove as (e: React.TouchEvent) => void,
    onTouchEnd: handleTouchEnd as (e: React.TouchEvent) => void,
    onTouchCancel: handleTouchCancel,
  };

  // Optional Ref callback for attaching directly to DOM node
  const domNodeRef = useRef<HTMLElement | null>(null);
  const refCallback = useCallback(
    (node: HTMLElement | null) => {
      if (domNodeRef.current) {
        domNodeRef.current.removeEventListener('touchstart', handleTouchStart);
        domNodeRef.current.removeEventListener('touchmove', handleTouchMove);
        domNodeRef.current.removeEventListener('touchend', handleTouchEnd);
        domNodeRef.current.removeEventListener('touchcancel', handleTouchCancel);
      }
      domNodeRef.current = node;
      if (node) {
        node.addEventListener('touchstart', handleTouchStart, { passive: true });
        node.addEventListener('touchmove', handleTouchMove, { passive: true });
        node.addEventListener('touchend', handleTouchEnd, { passive: true });
        node.addEventListener('touchcancel', handleTouchCancel, { passive: true });
      }
    },
    [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]
  );

  return {
    ...handlers,
    handlers,
    ref: refCallback,
    isSwiping: state.isSwiping,
    swipeDirection: state.swipeDirection,
    deltaX: state.deltaX,
    deltaY: state.deltaY,
  };
}
