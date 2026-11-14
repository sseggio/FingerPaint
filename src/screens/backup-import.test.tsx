import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { applyImport, usePendingImportStore } from '@/features/backup/backup-io';
import type { ImportPlan } from '@/features/backup/backup-merge';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';

import { BackupImportScreen } from './backup-import';

jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));
jest.mock('@/features/backup/backup-io', () => {
  const actual = jest.requireActual('@/features/backup/backup-io');
  return { ...actual, applyImport: jest.fn(async () => undefined) };
});

const apply = applyImport as jest.Mock;

const plan: ImportPlan = {
  writes: [],
  daily: { lastActiveDay: null, streak: 0, best: 7, jokerDays: [], activeDays: [] },
  settings: { ...DEFAULT_SETTINGS },
  summary: { createdAt: Date.UTC(2026, 10, 2), inFile: 12, added: 9, improved: 2, kept: 1, completedAfter: 5, streakAfter: 0, bestAfter: 7 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
  usePendingImportStore.setState({ plan });
});

describe('BackupImportScreen', () => {
  it('summarizes the import before applying anything', async () => {
    await render(<BackupImportScreen />);
    for (const text of [
      '12 artworks in the file',
      '9 artworks restored',
      '2 artworks moved further along',
      '1 artwork already further here (kept)',
      '5 finished artworks in total',
      'Streak: 0 days (best: 7)',
      'Your settings will be restored from the backup.',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByText(/Purchases are never imported/)).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies the plan on confirmation', async () => {
    await render(<BackupImportScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Restore this backup' }));
    });
    expect(apply).toHaveBeenCalledWith(plan);
    expect(screen.getByText('Backup restored!')).toBeTruthy();
    expect(usePendingImportStore.getState().plan).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('cancels without applying', async () => {
    await render(<BackupImportScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel the import' }));
    expect(apply).not.toHaveBeenCalled();
    expect(usePendingImportStore.getState().plan).toBeNull();
    expect(router.back).toHaveBeenCalled();
  });

  it('shows a failure and keeps the plan', async () => {
    apply.mockRejectedValueOnce(new Error('disk'));
    await render(<BackupImportScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Restore this backup' }));
    });
    expect(screen.getByText('The backup could not be restored. Please try again.')).toBeTruthy();
    expect(usePendingImportStore.getState().plan).toBe(plan);
  });

  it('handles a missing plan', async () => {
    usePendingImportStore.setState({ plan: null });
    await render(<BackupImportScreen />);
    expect(screen.getByText('No backup to restore. Pick a file from the Settings.')).toBeTruthy();
  });
});
