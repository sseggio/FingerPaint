import { useLocalSearchParams } from 'expo-router';

import { ShopScreen } from '@/screens/shop';

export default function Route() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  return <ShopScreen reason={reason} />;
}
