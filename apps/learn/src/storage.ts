/** Learn's persistent settings (last open tab, best quiz score) under one key prefix. */

import { createStorage } from '@fintools/shared/storage';

export const storage = createStorage('fintools.learn.');
export const { lsGet, lsSet } = storage;
