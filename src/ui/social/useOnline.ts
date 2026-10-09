import { useSyncExternalStore } from 'react';
import { getOnlineClient, type OnlineView } from '../../net/online';

export const client = getOnlineClient();
export const useOnline = (): OnlineView => useSyncExternalStore((f) => client.subscribe(f), () => client.view);
/** Subscribe to one primitive slice of the online view (re-renders only when it changes). */
export const useOnlineSelect = <T extends string | number | boolean | null>(pick: (v: OnlineView) => T): T =>
  useSyncExternalStore((f) => client.subscribe(f), () => pick(client.view));
