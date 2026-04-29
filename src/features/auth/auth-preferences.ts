import type { User } from '@supabase/supabase-js'

import { supabase } from '@/integrations/supabase/client'

const CATEGORY_SETUP_MODAL_METADATA_KEY = 'has_seen_category_setup_modal'

function getClient() {
  if (!supabase) {
    throw new Error(
      'Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    )
  }

  return supabase
}

export function hasSeenCategorySetupModal(user?: User | null) {
  return user?.user_metadata?.[CATEGORY_SETUP_MODAL_METADATA_KEY] === true
}

export async function markCategorySetupModalSeen() {
  const client = getClient()

  const { data, error } = await client.auth.updateUser({
    data: {
      [CATEGORY_SETUP_MODAL_METADATA_KEY]: true,
    },
  })

  if (error) {
    throw error
  }

  return data.user
}
