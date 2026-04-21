import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type InvitationRow = {
  id: string
  email: string
  status: 'pending' | 'accepted'
  invited_by: string | null
}

type AuthUser = {
  id: string
  email?: string | null
}

async function findUserByEmail(
  serviceClient: ReturnType<typeof createClient>,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase()
  let page = 1

  while (page <= 20) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: 100,
    })

    if (error) {
      throw error
    }

    const matchedUser = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    )

    if (matchedUser) {
      return matchedUser
    }

    if (data.users.length < 100) {
      return null
    }

    page += 1
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Missing access token' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const {
      data: { user },
      error: authError,
    } = await serviceClient.auth.getUser(accessToken)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    }

    const { invitationId } = await req.json()

    if (!invitationId || typeof invitationId !== 'string') {
      return new Response(JSON.stringify({ error: 'Invitation id is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    }

    const { data: invitation, error: invitationError } = await serviceClient
      .from('invitations')
      .select('id,email,status,invited_by')
      .eq('id', invitationId)
      .maybeSingle()

    if (invitationError) {
      return new Response(JSON.stringify({ error: invitationError.message }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    }

    if (!invitation) {
      return new Response(JSON.stringify({ error: 'Invitation not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    }

    const currentInvitation = invitation as InvitationRow
    const currentUser = user as AuthUser

    if (!currentInvitation.invited_by || currentInvitation.invited_by !== currentUser.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    }

    if (currentInvitation.status === 'accepted') {
      const invitedUser = await findUserByEmail(serviceClient, currentInvitation.email)

      if (invitedUser) {
        const { error: deleteShareError } = await serviceClient
          .from('shared_users')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('shared_with_user_id', invitedUser.id)

        if (deleteShareError) {
          return new Response(JSON.stringify({ error: deleteShareError.message }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          })
        }
      }
    }

    const { error: deleteInvitationError } = await serviceClient
      .from('invitations')
      .delete()
      .eq('id', currentInvitation.id)

    if (deleteInvitationError) {
      return new Response(JSON.stringify({ error: deleteInvitationError.message }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    )
  }
})
