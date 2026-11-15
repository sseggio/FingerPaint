/**
 * Prints an ADMIN_PASSWORD_HASH line for .env.
 *   npm run hash-password                 (prompts, input hidden)
 *   echo -n 'secret' | node dist/hash-password.mjs
 */
import { stdin, stdout } from 'node:process';

import { hashPassword } from './password';

const MIN_LENGTH = 12;

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPiped(): Promise<string> {
  let data = '';
  for await (const chunk of stdin) data += String(chunk);
  return data.replace(/\r?\n$/, '');
}

async function main() {
  let password: string;
  if (stdin.isTTY) {
    password = await readHidden('Mot de passe admin : ');
    const again = await readHidden('Confirme le mot de passe : ');
    if (password !== again) {
      console.error('Les deux saisies diffèrent.');
      process.exit(1);
    }
  } else {
    password = await readPiped();
  }
  if (password.length < MIN_LENGTH) {
    console.error(`Le mot de passe doit faire au moins ${MIN_LENGTH} caractères.`);
    process.exit(1);
  }
  const hash = await hashPassword(password);
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
}

void main();
