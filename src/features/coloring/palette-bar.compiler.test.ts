/**
 * @jest-environment node
 *
 * The app ships with the React Compiler (app.json `experiments.reactCompiler`), which Jest does not
 * apply. The palette reads counters the session mutates in place: once compiled, its render must
 * depend on `revision`, or the active color progress only refreshes on a color change (TestFlight
 * build 5 regression).
 */
import { transformFileSync } from '@babel/core';
import path from 'node:path';


function compiledPaletteBar(): string {
  const file = path.join(__dirname, 'palette-bar.tsx');
  const out = transformFileSync(file, {
    babelrc: false,
    configFile: false,
    plugins: [['babel-plugin-react-compiler', {}]],
    presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
  });
  const code = out?.code ?? '';
  const start = code.indexOf('function PaletteBar');
  return code.slice(start, code.indexOf('<ColorProgress', start));
}

describe('PaletteBar under the React Compiler', () => {
  it('is compiled (memo cache) and recomputes the counters on every revision', () => {
    const body = compiledPaletteBar();
    expect(body).toMatch(/_c\(\d+\)/);
    expect(body).toMatch(/!== revision/);
  });

});
