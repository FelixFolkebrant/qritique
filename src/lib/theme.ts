export type Theme = 'system' | 'light' | 'dark';

export function readTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}
