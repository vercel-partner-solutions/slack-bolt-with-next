import type { UIMessage } from "ai";
import { z } from "zod";

export const slackMessageMetadataSchema = z.object({
  user: z.string().nullable(),
  bot_id: z.string().nullable(),
  ts: z.string().optional(),
  thread_ts: z.string().optional(),
  type: z.string().optional(),
});

export type SlackMessageMetadata = z.infer<typeof slackMessageMetadataSchema>;
export type SlackUIMessage = UIMessage<SlackMessageMetadata>;
