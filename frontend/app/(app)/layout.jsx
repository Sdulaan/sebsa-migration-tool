'use client'

import ProtectedRoute from '../../components/ProtectedRoute'
import AppShell from '../../components/AppShell'

export default function AppRouteLayout({ children }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}
