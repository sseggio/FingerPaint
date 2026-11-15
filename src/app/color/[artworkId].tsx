import { useLocalSearchParams } from 'expo-router';

import { ColoringScreen } from '@/screens/coloring';

export default function Route() {
  const { artworkId, replay } = useLocalSearchParams<{ artworkId: string; replay?: string }>();
  return <ColoringScreen artworkId={artworkId} replay={replay} />;
}
