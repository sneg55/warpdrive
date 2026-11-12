import type { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { INTERCOM_SEARCH_PER_PAGE } from "@/constants/intercom";
import { err, ok, type Result } from "@/types/result";
import { intercomRequest } from "./intercomHttp";
import {
  contactSchema,
  conversationSchema,
  partSchema,
  searchItemSchema,
  searchResponseSchema,
} from "./intercomSchemas";
import type {
  IntercomClient,
  IntercomContact,
  IntercomConversation,
  IntercomHttpConfig,
  SearchPage,
} from "./types";

export { isTransientIntercomError } from "./intercomHttp";

function parseWith<S extends z.ZodType>(
  schema: S,
  raw: unknown,
  path: string,
): Result<z.infer<S>, AppError> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  return err(
    new AppError(ERROR_IDS.INTERCOM_PARSE_FAILED, "intercom response failed validation", {
      path,
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    }),
  );
}

function toSearchPage(raw: z.infer<typeof searchResponseSchema>): SearchPage {
  const items = raw.conversations.flatMap((c) => {
    const item = searchItemSchema.safeParse(c);
    return item.success ? [{ id: item.data.id, updatedAt: item.data.updated_at }] : [];
  });
  const next = raw.pages?.next?.starting_after;
  return { items, nextCursor: next === undefined || next === null || next === "" ? null : next };
}

function toConversation(raw: z.infer<typeof conversationSchema>): IntercomConversation {
  const contactIds = (raw.contacts?.contacts ?? []).flatMap((c) =>
    c.id === undefined ? [] : [c.id],
  );
  const parts = (raw.conversation_parts?.conversation_parts ?? []).flatMap((p) => {
    const part = partSchema.safeParse(p);
    return part.success ? [part.data] : [];
  });
  return {
    id: raw.id,
    title: raw.title ?? null,
    state: raw.state,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    source: raw.source ?? null,
    contactIds,
    parts,
  };
}

export function makeIntercomClient(cfg: IntercomHttpConfig): IntercomClient {
  return {
    async searchConversations(args, signal) {
      const path = "/conversations/search";
      const perPage = args.perPage ?? INTERCOM_SEARCH_PER_PAGE;
      const pagination =
        args.startingAfter === null
          ? { per_page: perPage }
          : { per_page: perPage, starting_after: args.startingAfter };
      const raw = await intercomRequest(
        cfg,
        path,
        {
          method: "POST",
          body: {
            query: { field: "updated_at", operator: ">", value: args.updatedAfter },
            sort: { field: "updated_at", order: "ascending" },
            pagination,
          },
        },
        signal,
      );
      if (!raw.ok) return raw;
      const parsed = parseWith(searchResponseSchema, raw.value, path);
      return parsed.ok ? ok(toSearchPage(parsed.value)) : parsed;
    },

    async getConversation(id, signal) {
      const path = `/conversations/${encodeURIComponent(id)}`;
      const raw = await intercomRequest(cfg, path, { method: "GET" }, signal);
      if (!raw.ok) return raw;
      const parsed = parseWith(conversationSchema, raw.value, path);
      return parsed.ok ? ok(toConversation(parsed.value)) : parsed;
    },

    async getContact(id, signal): Promise<Result<IntercomContact, AppError>> {
      const path = `/contacts/${encodeURIComponent(id)}`;
      const raw = await intercomRequest(cfg, path, { method: "GET" }, signal);
      if (!raw.ok) return raw;
      const parsed = parseWith(contactSchema, raw.value, path);
      if (!parsed.ok) return parsed;
      return ok({
        id: parsed.value.id,
        email: parsed.value.email ?? null,
        role: parsed.value.role ?? null,
      });
    },
  };
}
