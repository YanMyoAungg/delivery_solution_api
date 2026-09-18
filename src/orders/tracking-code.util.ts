import { randomInt } from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

function encodeTime(timestamp: number): string {
  let remaining = timestamp;
  let output = '';
  for (let index = 0; index < TIME_LENGTH; index++) {
    const remainder = remaining % 32;
    output = ENCODING[remainder] + output;
    remaining = (remaining - remainder) / 32;
  }
  return output;
}

function encodeRandom(): string {
  let output = '';
  for (let index = 0; index < RANDOM_LENGTH; index++) {
    output += ENCODING[randomInt(32)];
  }
  return output;
}

/** Generate a ULID: 48-bit millisecond timestamp + 80 bits of randomness. */
export function generateUlid(): string {
  return encodeTime(Date.now()) + encodeRandom();
}

/** Server-generated order tracking code in the fixed `ORD-<ULID>` format. */
export function generateTrackingCode(): string {
  return `ORD-${generateUlid()}`;
}
