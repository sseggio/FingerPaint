import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { CONTACT_EMAIL } from '@/features/about/app-info';
import { OPEN_SOURCE_CREDITS } from '@/features/about/licenses';

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
    expect(screen.getByRole('header', { name: 'FingerPaint' })).toBeTruthy();
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

  it('opens the mail app from an explicitly labelled button', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<AboutScreen />);
    await fireEvent.press(screen.getByRole('button', { name: `Write an email to ${CONTACT_EMAIL}` }));
    expect(open).toHaveBeenCalledWith(`mailto:${CONTACT_EMAIL}`);
    open.mockRestore();
  });
});
