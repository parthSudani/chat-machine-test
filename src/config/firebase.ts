import { initializeApp, getApps, App } from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  Timestamp,
  Firestore,
  DocumentReference,
  Transaction,
} from 'firebase-admin/firestore';
import { env } from './env';

if (env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = env.FIRESTORE_EMULATOR_HOST;
}

let app: App;
if (!getApps().length) {
  app = initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
  });
} else {
  app = getApps()[0]!;
}

export const firestore: Firestore = getFirestore(app);
export { FieldValue, Timestamp };
export type { DocumentReference, Transaction };
