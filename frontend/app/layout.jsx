import './globals.css'
import ThemeRegistry from '../components/ThemeRegistry'

export const metadata = {
  title: 'SEBSA | IFS Data Transfer',
  icons: { icon: '/sebsa-logo.png' }
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  )
}
