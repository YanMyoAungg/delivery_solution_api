function toMinorUnits(amount: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) throw new Error(`Invalid decimal amount '${amount}'`);

  const whole = BigInt(match[2]);
  const fractional = BigInt((match[3] ?? '').padEnd(2, '0'));
  const value = whole * 100n + fractional;
  return match[1] === '-' ? -value : value;
}

function fromMinorUnits(amount: bigint): string {
  const isNegative = amount < 0n;
  const absoluteAmount = isNegative ? -amount : amount;
  const whole = absoluteAmount / 100n;
  const fractional = (absoluteAmount % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole}.${fractional}`;
}

export function calculateCodToCollect(
  packagePrice: string,
  deliveryFee: string,
  isPackagePaidToShop: boolean,
  isFeePaidToShop: boolean,
): string {
  const packageAmount = isPackagePaidToShop ? 0n : toMinorUnits(packagePrice);
  const feeAmount = isFeePaidToShop ? 0n : toMinorUnits(deliveryFee);
  return fromMinorUnits(packageAmount + feeAmount);
}
