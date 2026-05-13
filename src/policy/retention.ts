export type TagDecision = {
  tag: string;
  digest: string;
  manifestMediaType: string;
  protected: boolean;
  createdAt: Date | null;
};

export function sortEligibleByNewestFirst(decisions: TagDecision[]): TagDecision[] {
  const eligible = decisions.filter((d) => !d.protected);
  return [...eligible].sort((a, b) => {
    if (a.createdAt && b.createdAt)
      return b.createdAt.getTime() - a.createdAt.getTime();
    if (a.createdAt && !b.createdAt) return -1;
    if (!a.createdAt && b.createdAt) return 1;
    return a.tag.localeCompare(b.tag);
  });
}

export function selectTagsToPrune(
  decisions: TagDecision[],
  retentionCount: number,
): TagDecision[] {
  const sorted = sortEligibleByNewestFirst(decisions);
  return sorted.slice(retentionCount);
}
