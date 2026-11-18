import { z } from "zod";

const uuidSchema = z.string().uuid();

export function isUuidParam(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}
