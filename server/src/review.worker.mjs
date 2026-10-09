// Worker entry: register tsx in this thread, then load the TypeScript worker.
import { register } from 'tsx/esm/api';
register();
await import('./review.worker.ts');
