import { useLocalSearchParams } from 'expo-router';

import { AlbumScreen } from '@/screens/album';

export default function Route() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  return <AlbumScreen albumId={albumId} />;
}
