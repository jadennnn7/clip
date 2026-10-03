import { AuthSplitPage, type AuthSearchParams } from '@/components/auth/AuthSplitPage'

export default async function LoginPage({ searchParams }: { searchParams: Promise<AuthSearchParams> }) {
  return <AuthSplitPage intent="login" searchParams={await searchParams} />
}
