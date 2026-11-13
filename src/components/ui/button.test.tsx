import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './button';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

describe('Button', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Colorier" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Colorier' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled and exposes disabled state', async () => {
    const onPress = jest.fn();
    await render(<Button label="Acheter" onPress={onPress} disabled />);
    const btn = screen.getByRole('button', { name: 'Acheter' });
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn).toBeDisabled();
  });
});
