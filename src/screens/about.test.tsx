import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';

import { CONTACT_EMAIL } from '@/features/about/app-info';
import { OPEN_SOURCE_CREDITS } from '@/features/about/licenses';
import { useCatalogStore } from '@/features/catalog/catalog-store';
import { useDiagnosticsStore } from '@/features/diagnostics';

import { AboutScreen } from './about';

jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '7' }));

describe('AboutScreen', () => {
  it('shows the version, the privacy promise, credits, licenses and contact', async () => {
    await render(<AboutScreen />);
    expect(screen.getByRole('header', { name: 'PixelJoy' })).toBeTruthy();
    expect(screen.getByText('Version 1.0.0 (build 7)')).toBeTruthy();
    for (const header of ['Privacy', 'Credits', 'Open-source licenses', 'Contact']) {
      expect(screen.getByRole('header', { name: header })).toBeTruthy();
    }
    expect(screen.getByText(/No data collected/)).toBeTruthy();
    expect(screen.getByText(/Everything stays on your device/)).toBeTruthy();
    expect(screen.getByText(/No ads, no tracking/)).toBeTruthy();
    for (const credit of OPEN_SOURCE_CREDITS) {
      expect(screen.getByText(new RegExp(`^${credit.name.replace(/[/.@-]/g, '\\$&')}: MIT license`))).toBeTruthy();
    }
    expect(screen.getByText(CONTACT_EMAIL)).toBeTruthy();
  });

  it('explains the anonymous catalog download only when the online catalog is configured', async () => {
    expect(useCatalogStore.getState().enabled).toBe(false);
    await render(<AboutScreen />);
    expect(screen.queryByText(/public catalog/)).toBeNull();
    await act(async () => useCatalogStore.setState({ enabled: true }));
    expect(screen.getByText('New artworks come from a public catalog, downloaded without any identifier.')).toBeTruthy();
    await act(async () => useCatalogStore.setState({ enabled: false }));
  });

  it('opens the mail app from an explicitly labelled button', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<AboutScreen />);
    await fireEvent.press(screen.getByRole('button', { name: `Write an email to ${CONTACT_EMAIL}` }));
    expect(open).toHaveBeenCalledWith(`mailto:${CONTACT_EMAIL}`);
    open.mockRestore();
  });

  it('hides the diagnostics section while no error was recorded', async () => {
    await render(<AboutScreen />);
    await act(async () => {
      await useDiagnosticsStore.getState().hydrate();
    });
    expect(screen.queryByRole('header', { name: 'Diagnostics' })).toBeNull();
  });

  it('lists recorded errors, copies the report through the share sheet and clears them', async () => {
    await act(async () => {
      await useDiagnosticsStore.getState().record('gesture:tap.onActivate', 'TypeError: boom', 'at tap (canvas)');
    });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await render(<AboutScreen />);
    expect(screen.getByRole('header', { name: 'Diagnostics' })).toBeTruthy();
    expect(screen.getByText('1 error recorded')).toBeTruthy();
    expect(screen.getByText(/gesture:tap\.onActivate TypeError: boom/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Copy the diagnostics report' }));
    const message = (share.mock.calls[0][0] as { message: string }).message;
    expect(message).toContain('PixelJoy diagnostics, version 1.0.0 (7)');
    expect(message).toContain('TypeError: boom');
    expect(message).toContain('at tap (canvas)');
    share.mockRestore();
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Clear the recorded errors' }));
    });
    expect(screen.queryByRole('header', { name: 'Diagnostics' })).toBeNull();
    expect(useDiagnosticsStore.getState().entries).toEqual([]);
  });
});
