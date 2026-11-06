import { z } from "zod";

export const OpportunityStatus = z.enum([
  "DISCOVERED", "CLASSIFIED", "RESEARCHING", "TECHNICAL_ANALYSIS",
  "VERIFYING", "NEEDS_HUMAN_REVIEW", "VERIFIED", "REJECTED", "STALE",
  "AVAILABLE", "SELECTED", "IN_PROGRESS", "IN_REVIEW", "READY_FOR_APPROVAL",
  "SUBMITTED", "CHANGES_REQUESTED", "ACCEPTED", "PAYMENT_PENDING", "PAID", "CLOSED"
]);

export const OpportunitySchema = z.object({
  schemaVersion: z.string().default("1.0"),
  id: z.string().min(1),
  fingerprint: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  source: z.object({
    platform: z.string(),
    url: z.string().url(),
    repository: z.string().optional(),
    issueNumber: z.number().int().positive().optional()
  }),
  reward: z.object({
    amountMinor: z.number().int().nonnegative().nullable(),
    currency: z.string().length(3).nullable(),
    fundingStatus: z.enum(["CONFIRMED", "ADVERTISED", "UNKNOWN", "NOT_FUNDED"])
  }),
  status: OpportunityStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Opportunity = z.infer<typeof OpportunitySchema>;
