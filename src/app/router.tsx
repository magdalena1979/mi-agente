import { createBrowserRouter } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { AuthPage } from '@/features/auth/pages/AuthPage'
import { EntriesHomePage } from '@/features/entries/pages/EntriesHomePage'
import { EntryDetailPage } from '@/features/entries/pages/EntryDetailPage'
import { NewEntryPage } from '@/features/entries/pages/NewEntryPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <EntriesHomePage />,
      },
      {
        path: 'auth',
        element: <AuthPage />,
      },
      {
        path: 'entries/new',
        element: <NewEntryPage />,
      },
      {
        path: 'entries/:entryId',
        element: <EntryDetailPage />,
      },
    ],
  },
])
