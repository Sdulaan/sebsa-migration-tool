'use client'

import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { ThemeProvider, createTheme } from '@mui/material/styles'

const theme = createTheme({
  cssVariables: false,
  typography: {
    fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif"
  },
  palette: {
    primary: { main: '#5B3FD6' }
  }
})

export default function ThemeRegistry({ children }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppRouterCacheProvider>
  )
}
