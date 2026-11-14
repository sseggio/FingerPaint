import { Canvas, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { buildSymbolPaths } from './canvas/symbol-paths';

export interface SymbolIconProps {
  /** Symbol id (palette color `symbol`). */
  symbol: string;
  size: number;
  color: string;
}

/** A colorblind symbol drawn with Skia, identical to the one in the canvas cells. Decorative. */
export function SymbolIcon({ symbol, size, color }: SymbolIconProps) {
  const paths = useMemo(() => buildSymbolPaths(symbol, 0, 0, size), [symbol, size]);
  if (!paths) return null;
  return (
    <Canvas
      style={{ width: size, height: size }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none">
      {paths.fill ? <Path path={paths.fill} color={color} /> : null}
      {paths.stroke ? (
        <Path path={paths.stroke} color={color} style="stroke" strokeWidth={paths.strokeWidth} strokeJoin="round" />
      ) : null}
    </Canvas>
  );
}
