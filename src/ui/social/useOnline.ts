import { useSyncExternalStore } from 'react';
import { getOnlineClient, type OnlineView } from '../../net/online';

export const client = getOnlineClient();
export const useOnline = (): OnlineView => useSyncExternalStore((f) => client.subscribe(f), () => client.view);
