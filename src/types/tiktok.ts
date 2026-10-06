export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'

export interface TikTokPostOptions {
  privacyLevel: TikTokPrivacy
  allowComment: boolean
  allowDuet: boolean
  allowStitch: boolean
  commercialContent: boolean
  ownBrand: boolean
  brandedContent: boolean
  isAigc: boolean
  consent: true
}

export interface TikTokCreatorInfo {
  username: string
  nickname: string
  privacyOptions: TikTokPrivacy[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxDurationSeconds: number
  publicPostingEnabled: boolean
}
