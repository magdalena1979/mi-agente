const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

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

function hasValidSupabaseAnonKeyFormat(value: string) {
  return (
    (value.startsWith('eyJ') && value.length > 100) ||
    (value.startsWith('sb_publishable_') && value.length > 20)
  )
}

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  hasValidSupabaseUrl: hasValidSupabaseUrlFormat(supabaseUrl),
  hasValidSupabaseAnonKey: hasValidSupabaseAnonKeyFormat(supabaseAnonKey),
  isSupabaseConfigured:
    hasValidSupabaseUrlFormat(supabaseUrl) &&
    hasValidSupabaseAnonKeyFormat(supabaseAnonKey),
}
