import { createBrowserRouter } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { PublicOnlyRoute } from '@/features/auth/PublicOnlyRoute'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { AuthPage } from '@/features/auth/pages/AuthPage'
import { EntriesHomePage } from '@/features/entries/pages/EntriesHomePage'
import { EntryDetailPage } from '@/features/entries/pages/EntryDetailPage'
import { NewEntryPage } from '@/features/entries/pages/NewEntryPage'
import { AcceptInvitationPage } from '@/features/lists/pages/AcceptInvitationPage'
import { ListDetailPage } from '@/features/lists/pages/ListDetailPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <RequireAuth>
            <EntriesHomePage />
          </RequireAuth>
        ),
      },
      {
        path: 'auth',
        element: (
          <PublicOnlyRoute>
            <AuthPage />
          </PublicOnlyRoute>
        ),
      },
      {
        path: 'entries/new',
        element: (
          <RequireAuth>
            <NewEntryPage />
          </RequireAuth>
        ),
      },
      {
        path: 'entries/:entryId',
        element: (
          <RequireAuth>
            <EntryDetailPage />
          </RequireAuth>
        ),
      },
      {
        path: 'lists/:listId',
        element: (
          <RequireAuth>
            <ListDetailPage />
          </RequireAuth>
        ),
      },
      {
        path: 'accept-invite',
        element: (
          <RequireAuth>
            <AcceptInvitationPage />
          </RequireAuth>
        ),
      },
    ],
  },
])
