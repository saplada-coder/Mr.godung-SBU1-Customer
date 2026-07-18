import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import Dashboard from './Dashboard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const me = await getSessionUser()
  if (!me) redirect('/sign-in')
  return <Dashboard me={me} />
}
