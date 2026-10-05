/**
 * Learn app: five reading and practice tabs, no data, no network.
 * The shell (tab row, hash routing, last open tab) comes from @fintools/shared/shell.
 */

import '@fintools/shared/styles/tokens.css';
import '@fintools/shared/styles/layout.css';
import '@fintools/shared/styles/components.css';
import './styles/learn.css';

import { createApp, type TabDef } from '@fintools/shared/shell';

import * as stories from './stories.ts';
import * as multiples from './multiples.ts';
import * as glossary from './glossary.ts';
import * as steps from './steps.ts';
import * as quiz from './quiz/index.ts';
import { storage } from './storage.ts';

const TABS: TabDef[] = [
  { id: 'stories', label: 'Senaryolar', mod: stories },
  { id: 'multiples', label: 'Çarpanlar', mod: multiples },
  { id: 'glossary', label: 'Sözlük', mod: glossary },
  { id: 'steps', label: 'Karar adımları', mod: steps },
  { id: 'quiz', label: 'Kendini sına', mod: quiz },
];

void createApp({ tabs: TABS, defaultTab: 'stories', storage });
