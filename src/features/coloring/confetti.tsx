import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { funAccents, radius } from '@/theme';

/** One fall, slightly longer than a screen transition: this is the rare "delight" moment. */
const DURATION_MS = 2200;
const PIECES = 42;
/** Fall curve: fast start, gentle landing (ease-out, never ease-in). */
const FALL = Easing.bezier(0.23, 1, 0.32, 1);

export interface ConfettiPiece {
  /** Start x, 0..1 of the width. */
  x: number;
  /** Horizontal drift (points). */
  drift: number;
  /** Delay before falling, 0..0.3 of the animation. */
  delay: number;
  /** Full turns while falling. */
  spin: number;
  size: number;
  color: string;
}

/** Deterministic pieces (seeded LCG): the same burst every time, testable. */
export function confettiPieces(count = PIECES, seed = 7): ConfettiPiece[] {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({
    x: random(),
    drift: (random() - 0.5) * 120,
    delay: random() * 0.3,
    spin: 1 + random() * 2,
    size: 8 + random() * 6,
    color: funAccents[i % funAccents.length],
  }));
}

function Piece({ piece, progress, height }: { piece: ConfettiPiece; progress: SharedValue<number>; height: number }) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (progress.get() - piece.delay) / (1 - piece.delay)));
    return {
      opacity: t <= 0 ? 0 : 1 - t * t,
      transform: [
        { translateX: piece.drift * t },
        { translateY: -40 + (height + 80) * t },
        { rotate: `${piece.spin * 360 * t}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        { left: `${piece.x * 100}%`, width: piece.size, height: piece.size * 0.5, backgroundColor: piece.color },
        style,
      ]}
    />
  );
}

/**
 * Confetti burst over the finished artwork, driven by a single shared value on the UI thread.
 * Purely decorative (hidden from screen readers, never intercepts touches). With reduce motion
 * on, nothing falls: the completion card alone tells the story.
 */
export function Confetti() {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [height, setHeight] = useState(0);
  const pieces = useMemo(() => confettiPieces(), []);

  useEffect(() => {
    if (reduceMotion || height <= 0) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: DURATION_MS, easing: FALL }));
  }, [height, progress, reduceMotion]);

  if (reduceMotion) return null;

  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  return (
    <View
      testID="confetti"
      style={[StyleSheet.absoluteFill, styles.passThrough]}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {height > 0 ? pieces.map((piece, i) => <Piece key={i} piece={piece} progress={progress} height={height} />) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  passThrough: { pointerEvents: 'none' },
  piece: { position: 'absolute', top: 0, borderRadius: radius.sm / 4 },
});
