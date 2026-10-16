export interface WaySequenceEntry {
  id: string;
  createdAt: Date;
}

export function getWaySequence(
  ways: readonly WaySequenceEntry[],
  wayId: string,
): number {
  const orderedWays = [...ways].sort((firstWay, secondWay) =>
    firstWay.createdAt.getTime() - secondWay.createdAt.getTime()
    || firstWay.id.localeCompare(secondWay.id),
  );
  const sequenceIndex = orderedWays.findIndex((way) => way.id === wayId);
  return sequenceIndex < 0 ? 1 : sequenceIndex + 1;
}
