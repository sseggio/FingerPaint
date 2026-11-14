import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Chip } from '@/components/ui';
import { useT } from '@/features/i18n';
import type { DifficultyFilter, LibraryFilters, StatusFilter } from '@/lib/library';
import { spacing } from '@/theme';

export interface FilterBarProps {
  filters: LibraryFilters;
  onChange: (filters: LibraryFilters) => void;
}

function ChipRow<T extends string | number>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.group}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        contentContainerStyle={styles.row}>
        {options.map((o) => (
          <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onSelect(o.value)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Difficulty and status chips. */
export function FilterBar({ filters, onChange }: FilterBarProps) {
  const t = useT();
  const difficulties: { value: DifficultyFilter; label: string }[] = [
    { value: 'all', label: t('library.filters.all') },
    { value: 1, label: t('library.difficulty.easy') },
    { value: 2, label: t('library.difficulty.medium') },
    { value: 3, label: t('library.difficulty.hard') },
  ];
  const statuses: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('library.filters.all') },
    { value: 'new', label: t('library.status.new') },
    { value: 'in_progress', label: t('library.status.inProgress') },
    { value: 'completed', label: t('library.status.completed') },
  ];
  return (
    <View style={styles.bar}>
      <ChipRow
        label={t('library.filters.difficulty')}
        options={difficulties}
        value={filters.difficulty}
        onSelect={(difficulty) => onChange({ ...filters, difficulty })}
      />
      <ChipRow
        label={t('library.filters.status')}
        options={statuses}
        value={filters.status}
        onSelect={(status) => onChange({ ...filters, status })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: spacing.md },
  group: { gap: spacing.xs },
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
});
