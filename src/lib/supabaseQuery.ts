import { supabase } from '@/integrations/supabase/client'

export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  context: string
): Promise<T | null> {
  const { data, error } = await queryFn()
  if (error) {
    console.error(`[Supabase] ${context}:`, error.message, error.hint || '')
    return null
  }
  if (data === null || (Array.isArray(data) && data.length === 0)) {
    console.warn(`[Supabase] ${context}: retornou vazio`)
  }
  return data
}
