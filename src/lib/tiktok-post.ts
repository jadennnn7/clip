import { z } from 'zod'

export const tiktokPostSchema = z.object({
  privacyLevel: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']),
  allowComment: z.boolean(), allowDuet: z.boolean(), allowStitch: z.boolean(),
  commercialContent: z.boolean(), ownBrand: z.boolean(), brandedContent: z.boolean(),
  isAigc: z.boolean(), consent: z.literal(true),
}).strict()
