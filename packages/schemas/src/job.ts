import { z } from "zod";

export const JobSchema = z.object({
  jobId: z.string().min(1),
  opportunityId: z.string().min(1),
  type: z.enum(["CLASSIFY", "RESEARCH", "REPOSITORY_ANALYSIS", "REVIEW", "SNAPSHOT"]),
  status: z.enum(["QUEUED", "LEASED", "RUNNING", "COMPLETED", "FAILED", "RETRYING", "CANCELLED", "EXPIRED"]),
  assignedNode: z.string().nullable(),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  leaseUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type Job = z.infer<typeof JobSchema>;
