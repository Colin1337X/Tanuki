import * as pgp from 'openpgp';
import { recipientCrypto } from '../../public/assets/recipient-crypto.js';
import { postQuantumRecipient } from '../../public/assets/pq-recipient.js';
import { nativePrimitives } from './pq-primitives.js';
export const recipient = postQuantumRecipient(nativePrimitives,recipientCrypto(pgp));
