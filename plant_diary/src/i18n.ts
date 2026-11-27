import { existsSync, readFileSync } from 'node:fs';

const DIR = new URL('../public/locales/', import.meta.url);

let lang = 'en';
let messages: Record<string, string> = {};

/** Switches the UI/server language. English is the built-in base; other languages are `public/locales/<lang>.json`. */
export function setLanguage(code: string | undefined): void {
  const wanted = /^[a-z]{2}$/.test(code ?? '') ? (code as string) : 'en';
  const file = new URL(`${wanted}.json`, DIR);
  lang = wanted !== 'en' && existsSync(file) ? wanted : 'en';
  messages = lang === 'en' ? {} : JSON.parse(readFileSync(file, 'utf8'));
}

export const getLanguage = () => ({ lang, messages });

/** Translates an English message and fills `{placeholders}`. */
export function t(msg: string, params: Record<string, string | number> = {}): string {
  return (messages[msg] ?? msg).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}
