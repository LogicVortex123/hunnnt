/**
 * Repositories whose bounty programs are known to have ended, with the evidence.
 * Add entries when research finds a maintainer statement; keys are lowercase owner/repo.
 */
export const ENDED_PROGRAMS: Record<string, { since: string; reason: string; evidence: string }> = {
  "coollabsio/coolify": {
    since: "2026-09-13",
    reason: "Coolify team stopped the Algora bounty program; payouts won't happen and claims aren't accepted",
    evidence: "https://github.com/coollabsio/coolify/issues/4972",
  },
};
