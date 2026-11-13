import { X_SNOWFLAKE_EPOCH_MS } from "@/constants/xDms";

export function snowflakeToDate(id: string): Date {
  return new Date(Number(BigInt(id) >> 22n) + X_SNOWFLAKE_EPOCH_MS);
}
