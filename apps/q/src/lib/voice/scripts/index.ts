/* Every language's script, keyed by the same codes as lib/i18n. */
import en from './en';
import cy from './cy';
import fr from './fr';
import de from './de';
import es from './es';
import zh from './zh';
import type { Key } from '../../i18n/en';

export const SCRIPTS: Record<'en' | 'cy' | 'fr' | 'de' | 'es' | 'zh', Partial<Record<Key, string>>> = { en, cy, fr, de, es, zh };
