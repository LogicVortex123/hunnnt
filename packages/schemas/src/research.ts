import { z } from "zod";

/** Evidence-backed research report for one bounty (Claude adapter or Claude Code subagent). */
export const ResearchReportSchema = z.object({
  summary: z.string().min(1).max(2000),
  recommendation: z.enum(["pursue", "skip", "needs_human"]),
  recommendationReason: z.string().min(1).max(1000),
  reward: z.object({
    amountUsd: z.number().nonnegative().nullable(),
    fundingStatus: z.enum(["confirmed", "advertised", "unknown"]),
    platform: z.string().max(100).nullable(),
  }),
  eligibilityStatus: z.enum(["confirmed", "unclear", "restricted", "unknown"]),
  deadline: z.string().max(100).nullable(),
  acceptanceCriteria: z.array(z.string().max(500)).max(20),
  submissionMethod: z.string().max(500).nullable(),
  competition: z.object({
    openPRs: z.number().int().nonnegative(),
    mergedPRs: z.number().int().nonnegative(),
    activeClaimants: z.number().int().nonnegative(),
    notes: z.string().max(1000),
  }),
  effort: z.object({
    hours: z.number().positive().max(1000),
    doableInTwoDays: z.boolean(),
    reasoning: z.string().max(1000),
  }),
  maintainerActivity: z.string().max(500),
  risks: z.array(z.string().max(500)).max(20),
  /** Every factual claim must be tied to a URL. */
  evidence: z.array(z.object({ url: z.string().url(), claim: z.string().max(500) })).min(1).max(30),
  unknowns: z.array(z.string().max(500)).max(20),
});

export type ResearchReport = z.infer<typeof ResearchReportSchema>;
