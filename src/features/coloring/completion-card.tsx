import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { AppText, Button, Card } from '@/components/ui';
import { useT } from '@/features/i18n';
import { spacing } from '@/theme';

/** Card entrance: springs up once, settles without overshoot; a plain fade with reduce motion. */
const ENTERING = FadeInDown.springify().damping(18).stiffness(180).reduceMotion(ReduceMotion.System);

export interface CompletionCardProps {
  title: string;
  /** True right after finishing (celebration); false when reopening a finished artwork. */
  justFinished: boolean;
  /** Null when there is no other artwork to offer. */
  onNext: (() => void) | null;
  onLibrary(): void;
}

/** End of an artwork: congratulations and the two ways forward. */
export function CompletionCard({ title, justFinished, onNext, onLibrary }: CompletionCardProps) {
  const t = useT();
  return (
    <Animated.View entering={justFinished ? ENTERING : undefined} style={styles.wrap}>
      <Card style={styles.card}>
        <AppText variant="title" accessibilityRole="header">
          {t('coloring.done.title')}
        </AppText>
        <AppText tone="secondary">
          {justFinished ? t('coloring.done.body', { title }) : t('coloring.done.again', { title })}
        </AppText>
        <View style={styles.actions}>
          {onNext ? (
            <Button
              label={t('coloring.done.next')}
              accessibilityLabel={t('coloring.done.nextLabel')}
              onPress={onNext}
              style={styles.action}
            />
          ) : null}
          <Button
            label={t('coloring.done.library')}
            accessibilityLabel={t('coloring.done.libraryLabel')}
            variant="secondary"
            onPress={onLibrary}
            style={styles.action}
          />
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg },
  card: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  action: { flexGrow: 1 },
});
