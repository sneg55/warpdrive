import { z } from "zod";

const idString = z.union([z.string().min(1), z.number()]).transform((v) => String(v));
const nullableText = z.string().nullish().catch(null);
const unixSeconds = z.number().int().nonnegative();

const authorSchema = z
  .looseObject({
    type: nullableText,
    name: nullableText,
    email: nullableText,
  })
  .nullish()
  .catch(null);

export const sourceSchema = z.looseObject({
  id: idString.nullish().catch(null),
  body: nullableText,
  author: authorSchema,
  delivered_as: nullableText,
  redacted: z.boolean().nullish().catch(null),
});

export const partSchema = z.looseObject({
  id: idString,
  part_type: z.string().min(1),
  body: nullableText,
  author: authorSchema,
  created_at: unixSeconds,
  redacted: z.boolean().nullish().catch(null),
});

const contactRefSchema = z.looseObject({ id: idString.optional().catch(undefined) });

export const conversationSchema = z.looseObject({
  id: idString,
  title: nullableText,
  state: z.string().min(1),
  created_at: unixSeconds,
  updated_at: unixSeconds,
  source: sourceSchema.nullish().catch(null),
  contacts: z
    .looseObject({ contacts: z.array(contactRefSchema).catch([]) })
    .nullish()
    .catch(null),
  conversation_parts: z
    .looseObject({ conversation_parts: z.array(z.unknown()).catch([]) })
    .nullish()
    .catch(null),
});

export const searchItemSchema = z.looseObject({ id: idString, updated_at: unixSeconds });

export const searchResponseSchema = z.looseObject({
  conversations: z.array(z.unknown()).catch([]),
  pages: z
    .looseObject({
      next: z.looseObject({ starting_after: z.string().nullish() }).nullish().catch(null),
    })
    .nullish()
    .catch(null),
});

export const contactSchema = z.looseObject({
  id: idString,
  email: nullableText,
  role: nullableText,
});

export type IntercomSourceRaw = z.infer<typeof sourceSchema>;
export type IntercomPartRaw = z.infer<typeof partSchema>;
