const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAñonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

function hasValidSupabaseUrlFormat(value: string) {
  try {
    const url = new URL(value)

    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.supabase.co') &&
      !url.pathname.includes('/dashboard')
    )
  } catch {
    return false
  }
}

function hasValidSupabaseAñonKeyFormat(value: string) {
  return (
    (value.startsWith('eyJ') && value.length > 100) ||
    (value.startsWith('sb_publishable_') && value.length > 20)
  )
}

export const env = {
  supabaseUrl,
  supabaseAñonKey,
  hasValidSupabaseUrl: hasValidSupabaseUrlFormat(supabaseUrl),
  hasValidSupabaseAñonKey: hasValidSupabaseAñonKeyFormat(supabaseAñonKey),
  isSupabaseConfigured:
    hasValidSupabaseUrlFormat(supabaseUrl) &&
    hasValidSupabaseAñonKeyFormat(supabaseAñonKey),
}
