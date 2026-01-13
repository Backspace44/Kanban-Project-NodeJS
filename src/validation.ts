import { z } from "zod";
import { badUserInput } from "./errors";

export const paginationSchema = z.object({
  offset: z.number().int().min(0),
  limit: z.number().int().min(1).max(50),
});

export function parseOrThrow<T>(schema: z.ZodSchema<T>, value: unknown): T {
  const res = schema.safeParse(value);
  if (!res.success) {
    badUserInput("Validation error", { issues: res.error.issues });
  }
  return res.data;
}
