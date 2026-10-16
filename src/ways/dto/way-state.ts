export const WAY_STATES = [
  'EMPTY',
  'PENDING_APPROVAL',
  'EARNED',
  'PAID_ANYWAY',
] as const;

export type WayState = (typeof WAY_STATES)[number];
