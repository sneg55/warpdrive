import type { AppError } from "@/constants/errorIds";

export function messageGoneFromMailbox(error: AppError): boolean {
  return error.context?.status === 404;
}
