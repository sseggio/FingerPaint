import { useLocalSearchParams } from 'expo-router';

import { ColoringScreen } from '@/screens/coloring';

export default function Route() {
  const { artworkId } = useLocalSearchParams<{ artworkId: string }>();
  return <ColoringScreen artworkId={artworkId} />;
}
