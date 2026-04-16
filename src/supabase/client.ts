import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || url === 'https://your-project.supabase.co') {
  console.warn('[Supabase] VITE_SUPABASE_URL not configured — sharing features disabled.')
}

export const supabase = createClient(url, key)

// ── Voter identity (localStorage UUID) ───────────────────────────────────────

const VOTER_KEY = 'pt_voter_id'

export function getVoterId(): string {
  let id = localStorage.getItem(VOTER_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VOTER_KEY, id)
  }
  return id
}

export function isConfigured(): boolean {
  return !!url && url !== 'https://your-project.supabase.co'
}
