import { AuthSplitPage, type AuthSearchParams } from '@/components/auth/AuthSplitPage'

export default async function SignupPage({ searchParams }: { searchParams: Promise<AuthSearchParams> }) {
  return <AuthSplitPage intent="signup" searchParams={await searchParams} />
}
