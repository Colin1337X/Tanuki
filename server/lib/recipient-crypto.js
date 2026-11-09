import * as pgp from 'openpgp';
import { recipientCrypto } from '../../public/assets/recipient-crypto.js';
export const recipient = recipientCrypto(pgp);
