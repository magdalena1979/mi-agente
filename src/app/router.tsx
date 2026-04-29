import { createBrowserRouter } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { PublicOnlyRoute } from '@/features/auth/PublicOnlyRoute'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { AuthPage } from '@/features/auth/pages/AuthPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { EntryDetailPage } from '@/features/entries/pages/EntryDetailPage'
import { NewEntryPage } from '@/features/entries/pages/NewEntryPage'
import { HomePage } from '@/features/home/pages/HomePage'
import { DataDeletionPage, PrivacyPolicyPage } from '@/features/legal/pages/LegalPages'
// Compartido desactivado temporalmente en el frontend.
// import { AcceptInvitationPage } from '@/features/lists/pages/AcceptInvitationPage'
// import { ListDetailPage } from '@/features/lists/pages/ListDetailPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />,
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
        path: 'reset-password',
        element: <ResetPasswordPage />,
      },
      {
        path: 'privacy',
        element: <PrivacyPolicyPage />,
      },
      {
        path: 'data-deletion',
        element: <DataDeletionPage />,
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
      // Compartido desactivado temporalmente en el frontend.
      // {
      //   path: 'lists/:listId',
      //   element: (
      //     <RequireAuth>
      //       <ListDetailPage />
      //     </RequireAuth>
      //   ),
      // },
      // {
      //   path: 'accept-invite',
      //   element: (
      //     <RequireAuth>
      //       <AcceptInvitationPage />
      //     </RequireAuth>
      //   ),
      // },
    ],
  },
])
