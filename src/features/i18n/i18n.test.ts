import type { Dictionary } from './dictionary';
import { en } from './en';
import { fr } from './fr';
import {
  createTranslator,
  fallbackPluralCategory,
  interpolate,
  localizedTitle,
  pluralCategory,
  resolveLocale,
  selectPlural,
} from './translate';

const placeholders = (message: string | Record<string, string>) =>
  [...new Set(JSON.stringify(message).match(/\{\w+\}/g) ?? [])].sort();

describe('dictionaries', () => {
  it('have the same keys, message kinds and placeholders in FR and EN', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const a = en[key];
      const b = fr[key];
      expect([key, typeof b]).toEqual([key, typeof a]);
      if (typeof a === 'object' && typeof b === 'object') {
        expect(b.other).toBeTruthy();
        expect(b.one).toBeTruthy();
        expect(placeholders(b)).toEqual(placeholders(a));
      } else {
        expect([key, placeholders(b as string)]).toEqual([key, placeholders(a as string)]);
      }
    }
  });

  it('has no empty translation', () => {
    for (const dict of [en, fr]) {
      for (const message of Object.values(dict)) {
        const strings: string[] = typeof message === 'string' ? [message] : Object.values(message);
        strings.forEach((s) => expect(s.trim()).not.toBe(''));
      }
    }
  });

  it('turns missing keys, unknown keys and missing params into type errors', () => {
    // @ts-expect-error every reference key is required in a translation
    const partial: Dictionary = { 'common.comingSoon': 'x' };
    const t = createTranslator('en');
    // @ts-expect-error unknown key
    expect(t('nope.missing')).toBe('nope.missing');
    // @ts-expect-error plural messages require `count`
    t('library.artworkCount');
    // @ts-expect-error `language` is required
    t('settings.language.systemHint');
    expect(partial).toBeDefined();
  });
});

describe('plurals', () => {
  it.each([
    [0, 'one'],
    [1, 'one'],
    [1.5, 'one'],
    [2, 'other'],
    [10, 'other'],
  ])('fr: %p → %s', (n, category) => {
    expect(pluralCategory('fr', n)).toBe(category);
  });

  it.each([
    [0, 'other'],
    [1, 'one'],
    [2, 'other'],
    [42, 'other'],
  ])('en: %p → %s', (n, category) => {
    expect(pluralCategory('en', n)).toBe(category);
  });

  it('formats plural messages in both languages', () => {
    const tFr = createTranslator('fr');
    const tEn = createTranslator('en');
    expect(tFr('library.artworkCount', { count: 0 })).toBe('0 illustration à colorier');
    expect(tFr('library.artworkCount', { count: 1 })).toBe('1 illustration à colorier');
    expect(tFr('library.artworkCount', { count: 6 })).toBe('6 illustrations à colorier');
    expect(tEn('library.artworkCount', { count: 0 })).toBe('0 artworks to color');
    expect(tEn('library.artworkCount', { count: 1 })).toBe('1 artwork to color');
    expect(tEn('library.artworkCount', { count: 6 })).toBe('6 artworks to color');
  });

  it('falls back to `other` when a category is not provided (e.g. fr "many")', () => {
    expect(selectPlural({ one: 'un', other: 'beaucoup' }, 'fr', 1_000_000)).toBe('beaucoup');
  });

  it('has a fallback matching Intl.PluralRules for engines without it', () => {
    for (const locale of ['fr', 'en'] as const) {
      for (const n of [0, 1, 1.5, 2, 3, 10, 21, 100]) {
        expect([locale, n, fallbackPluralCategory(locale, n)]).toEqual([locale, n, pluralCategory(locale, n)]);
      }
    }
  });
});

describe('interpolation', () => {
  it('replaces placeholders and keeps unknown ones', () => {
    expect(interpolate('Hi {name}, {missing}', { name: 'Ada' }, 'en')).toBe('Hi Ada, {missing}');
    expect(createTranslator('fr')('settings.language.systemHint', { language: 'Français' })).toBe(
      'Suit la langue de ton appareil (Français).',
    );
  });

  it('formats numbers for the locale', () => {
    expect(interpolate('{n}', { n: 1234 }, 'en')).toBe('1,234');
    expect(interpolate('{n}', { n: 1234 }, 'fr').replace(/\s/g, ' ')).toBe('1 234');
  });
});

describe('resolveLocale', () => {
  it('honours an explicit preference', () => {
    expect(resolveLocale('fr', [{ languageCode: 'en' }])).toBe('fr');
    expect(resolveLocale('en', [{ languageCode: 'fr' }])).toBe('en');
  });

  it('follows the first supported system language', () => {
    expect(resolveLocale('system', [{ languageCode: 'fr', languageTag: 'fr-CA' }])).toBe('fr');
    expect(resolveLocale('system', [{ languageCode: 'de' }, { languageCode: 'fr' }])).toBe('fr');
    expect(resolveLocale('system', [{ languageCode: null, languageTag: 'FR-be' }])).toBe('fr');
  });

  it('falls back from system to English for unsupported languages', () => {
    expect(resolveLocale('system', [{ languageCode: 'ja' }])).toBe('en');
    expect(resolveLocale('system', [{ languageCode: null }])).toBe('en');
    expect(resolveLocale('system', [])).toBe('en');
  });
});

describe('localizedTitle', () => {
  it('picks the UI language and falls back when empty', () => {
    expect(localizedTitle({ fr: 'Chat tigré', en: 'Tabby cat' }, 'fr')).toBe('Chat tigré');
    expect(localizedTitle({ fr: 'Chat tigré', en: 'Tabby cat' }, 'en')).toBe('Tabby cat');
    expect(localizedTitle({ fr: '', en: 'Tabby cat' }, 'fr')).toBe('Tabby cat');
    expect(localizedTitle({ fr: 'Chat tigré', en: '' }, 'en')).toBe('Chat tigré');
  });
});
