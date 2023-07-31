import { readFileSync } from 'fs';
import { decryptx } from './gamespy-crypto';

const GAME_KEY = 'e4Rd9J';

const validationKey = readFileSync('nonce.txt').toString();
const encryptedData = readFileSync('out.bin');
const ourDecryption = decryptx(GAME_KEY, validationKey, encryptedData);

console.log();
console.log('Original bytes       ', encryptedData);
console.log('Our decryption       ', ourDecryption);
