// PixelJoy back-office: pure helpers of the "Générer" tab (F34). No DOM access here, so they are
// unit-tested (test/generate-ui.test.ts) and shared with admin.js through `PixelJoyGenerate`.
'use strict';

(() => {
  const SIZE_PRESETS = [32, 64, 96, 128, 192, 256];
  /** Format → height / width. Ratios stay within the server's 2:1 limit. */
  const FORMATS = [
    { value: 'square', label: 'Carré', ratio: 1 },
    { value: 'landscape', label: 'Paysage 4:3', ratio: 3 / 4 },
    { value: 'portrait', label: 'Portrait 3:4', ratio: 4 / 3 },
    { value: 'wide', label: 'Panorama 2:1', ratio: 1 / 2 },
  ];
  /** Parameters shown by the common controls (size, colors, palette, difficulty). */
  const COMMON_KEYS = ['width', 'height', 'colors', 'palette', 'difficulty'];
  const DIFFICULTY_LABEL = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };
  const MIN_SIDE = 16;
  const MAX_SIDE = 256;

  /** Width / height of a preset: the preset is the longest side. */
  function sizeFromPreset(size, format) {
    const f = FORMATS.find((x) => x.value === format) ?? FORMATS[0];
    const side = Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(Number(size) || 64)));
    if (f.ratio <= 1) return { width: side, height: Math.max(MIN_SIDE, Math.round(side * f.ratio)) };
    return { width: Math.max(MIN_SIDE, Math.round(side / f.ratio)), height: side };
  }

  /**
   * Request params from raw control values (strings from inputs), typed after the generator's
   * descriptor. Unknown keys are dropped (the server refuses them).
   */
  function buildParams(descriptor, values) {
    const out = {};
    for (const spec of descriptor.params) {
      const v = values[spec.key];
      if (v === undefined || v === null || v === '') continue;
      if (spec.kind === 'int') out[spec.key] = Number(v);
      else if (spec.kind === 'bool') out[spec.key] = v === true || v === 'true' || v === 'on';
      else out[spec.key] = String(v);
    }
    return out;
  }

  function slug(s) {
    return String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '');
  }

  /** Kebab-case id like `mandala-4821`, made unique against `taken` (`-2`, `-3`, …). */
  function suggestId(generator, seed, taken) {
    const base = slug(`${generator}-${seed}`) || slug(generator) || 'generated';
    const used = new Set(taken);
    if (!used.has(base)) return base;
    for (let i = 2; i < 1000; i++) {
      const id = `${base}-${i}`;
      if (!used.has(id)) return id;
    }
    return `${base}-${Date.now() % 100000}`;
  }

  /** "64 × 48 · 3 072 cases · 12 couleurs · Moyen · 18 ms" */
  function formatStats(p) {
    const n = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const parts = [`${p.w} × ${p.h}`, `${n(p.stats.cells)} cases`, `${p.stats.colors} couleurs`, `difficulté ${DIFFICULTY_LABEL[p.difficulty] ?? p.difficulty}`];
    if (typeof p.ms === 'number') parts.push(`${p.ms} ms`);
    return parts.join(' · ');
  }

  /** Displayed size of the big preview: `zoom` screen pixels per cell. */
  function zoomedSize(w, h, zoom) {
    const z = Math.min(16, Math.max(1, Math.round(Number(zoom) || 1)));
    return { width: w * z, height: h * z };
  }

  /** Default zoom so the preview is about 512 px on its longest side. */
  function defaultZoom(w, h) {
    return Math.min(16, Math.max(1, Math.floor(512 / Math.max(w, h))));
  }

  /** A fresh numeric seed (1..999 999). */
  function randomSeed(random) {
    const r = typeof random === 'function' ? random() : Math.random();
    return 1 + Math.floor(r * 999999);
  }

  /** Text color readable on a swatch. */
  function inkOn(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return l > 0.4 ? '#1B1A2E' : '#FFFFFF';
  }

  const api = { SIZE_PRESETS, FORMATS, COMMON_KEYS, sizeFromPreset, buildParams, suggestId, formatStats, zoomedSize, defaultZoom, randomSeed, inkOn, slug };
  globalThis.PixelJoyGenerate = Object.freeze(api);
})();
