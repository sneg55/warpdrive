import { activitiesRouter } from "@/features/activities/router";
import { collaborationRouter } from "@/features/collaboration/router";
import { contactsRouter } from "@/features/contacts/router";
import { customFieldsRouter } from "@/features/custom-fields/router";
import { dealRouter } from "@/features/deals/dealRouter";
import { mailLabelsRouter } from "@/features/email/mailLabelsRouter";
import { emailRouter } from "@/features/email/router";
import { filesRouter } from "@/features/files/router";
import { importRouter } from "@/features/import/router";
import { labelsRouter } from "@/features/labels/router";
import { leadRouter } from "@/features/leads/leadRouter";
import { notificationsRouter } from "@/features/notifications/router";
import { oauthRouter } from "@/features/oauth/router";
import { pipelineRouter } from "@/features/pipelines/pipelineRouter";
import { versionRouter } from "@/features/release/router";
import { searchRouter } from "@/features/search/router";
import { statsRouter } from "@/features/stats/router";
import { identityRouter } from "./routers/identity";
import { realtimeRouter } from "./routers/realtime";
import { router } from "./trpc";

export const appRouter = router({
  identity: identityRouter,
  realtime: realtimeRouter,
  pipeline: pipelineRouter,
  deal: dealRouter,
  contacts: contactsRouter,
  customFields: customFieldsRouter,
  collaboration: collaborationRouter,
  activities: activitiesRouter,
  import: importRouter,
  labels: labelsRouter,
  mailLabels: mailLabelsRouter,
  lead: leadRouter,
  email: emailRouter,
  files: filesRouter,
  notifications: notificationsRouter,
  oauth: oauthRouter,
  search: searchRouter,
  stats: statsRouter,
  version: versionRouter,
});

export type AppRouter = typeof appRouter;

// Server-side caller factory: pass a fully-formed AppContext to call procedures
// without going through the HTTP layer. Used by server components for SSR prefetch.
export const createCaller = appRouter.createCaller;
