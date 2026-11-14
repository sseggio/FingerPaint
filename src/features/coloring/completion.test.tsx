import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';

import { CompletionCard } from './completion-card';
import { Confetti, confettiPieces } from './confetti';

const mockReducedMotion = jest.fn(() => false);
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => mockReducedMotion() };
});
const mockLocales = jest.fn(() => [{ languageCode: 'fr', languageTag: 'fr-FR' }]);
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
  mockReducedMotion.mockReturnValue(false);
});

describe('CompletionCard', () => {
  it('offers "Suivante" and "Bibliothèque" with accessible labels', async () => {
    const onNext = jest.fn();
    const onLibrary = jest.fn();
    await render(<CompletionCard title="Chat tigré" justFinished onNext={onNext} onLibrary={onLibrary} />);
    expect(screen.getByText('« Chat tigré » est entièrement colorié.')).toBeTruthy();
    expect(screen.getByText('Suivante')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Colorier l’illustration suivante' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Retour à la bibliothèque' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onLibrary).toHaveBeenCalledTimes(1);
  });

  it('hides "Next" when there is nothing else to color (English)', async () => {
    mockLocales.mockReturnValueOnce([{ languageCode: 'en', languageTag: 'en-US' }]);
    await render(<CompletionCard title="Cat" justFinished={false} onNext={null} onLibrary={jest.fn()} />);
    expect(screen.getByText('You finished “Cat”.')).toBeTruthy();
    expect(screen.queryByText('Next')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to the library' })).toBeTruthy();
  });
});

describe('Confetti', () => {
  it('falls once measured, without catching touches or screen-reader focus', async () => {
    await render(<Confetti />);
    const layer = screen.getByTestId('confetti', { includeHiddenElements: true });
    await act(async () => {
      await fireEvent(layer, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } });
    });
    expect(layer.props.accessibilityElementsHidden).toBe(true);
    expect(layer.children.length).toBe(confettiPieces().length);
  });

  it('is skipped entirely with reduce motion', async () => {
    mockReducedMotion.mockReturnValue(true);
    await render(<Confetti />);
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
  });

  it('builds a deterministic burst in the accent colors', () => {
    const a = confettiPieces(10, 3);
    expect(confettiPieces(10, 3)).toEqual(a);
    expect(a.every((p) => p.x >= 0 && p.x < 1 && p.delay < 0.3)).toBe(true);
  });
});
