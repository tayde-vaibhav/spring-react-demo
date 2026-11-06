import { Component, type ErrorInfo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Box, Button, CircularProgress, CssBaseline, ThemeProvider, Typography, createTheme } from '@mui/material'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { AppLayout } from './components/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProductFormPage } from './pages/ProductFormPage'
import { ProductsPage } from './pages/ProductsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 },
  },
})

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#315b50', dark: '#24453d', light: '#e4eee9' },
    secondary: { main: '#d37d59' },
    background: { default: '#f5f6f2', paper: '#ffffff' },
    text: { primary: '#1e2926', secondary: '#6d7974' },
    error: { main: '#b94f48' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontWeight: 750, letterSpacing: '-0.045em' },
    h2: { fontWeight: 720, letterSpacing: '-0.035em' },
    h3: { fontWeight: 700, letterSpacing: '-0.03em' },
    button: { textTransform: 'none', fontWeight: 650 },
  },
  components: {
    MuiCard: { styleOverrides: { root: { border: '1px solid #e7eae5', boxShadow: '0 12px 34px rgba(28, 43, 37, 0.045)' } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 10, minHeight: 42 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10, backgroundColor: '#fff' } } },
    MuiTableCell: { styleOverrides: { head: { color: '#52665b', fontSize: 12, fontWeight: 700, letterSpacing: '.055em', textTransform: 'uppercase' } } },
  },
})

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI rendering failed', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <Box className="fatal-error" role="alert">
          <Typography variant="overline" color="primary">Something went wrong</Typography>
          <Typography variant="h3">We couldn’t render this page.</Typography>
          <Typography color="text.secondary">Try reloading. Your saved data hasn’t been changed.</Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>Reload page</Button>
        </Box>
      )
    }
    return this.props.children
  }
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <Box className="route-loading" aria-label="Checking your session"><CircularProgress /></Box>
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  return isAdmin ? children : <Navigate to="/products" replace />
}

function RouteTree() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<RequireAdmin><ProductFormPage /></RequireAdmin>} />
        <Route path="products/:id/edit" element={<RequireAdmin><ProductFormPage /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <BrowserRouter>
            <AuthProvider>
              <RouteTree />
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
