import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Alert, Box, Button, Card, CardContent, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      navigate(from || '/dashboard', { replace: true })
    } catch (cause) {
      setError(cause instanceof ApiError
        ? cause.problem.detail || 'We could not sign you in with those credentials.'
        : 'Unable to reach the sign-in service. Try again shortly.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box component="main" className="login-page">
      <Box className="login-story">
        <RouterBrand />
        <Box>
          <Typography className="eyebrow">A CLEARER VIEW OF WHAT YOU HAVE</Typography>
          <Typography variant="h1" className="login-headline">Make room for<br /><span>good work.</span></Typography>
          <Typography className="login-subtitle">A calm, considered home for your product catalogue and the details that keep it moving.</Typography>
        </Box>
        <Typography className="login-footnote">PRODUCT OPERATIONS, WITH A LITTLE MORE CLARITY.</Typography>
      </Box>
      <Box className="login-panel">
        <Card className="login-card">
          <CardContent>
            <Typography className="eyebrow">WELCOME BACK</Typography>
            <Typography variant="h4" component="h2" className="login-title">Sign in to Fieldnote</Typography>
            <Typography color="text.secondary" className="login-copy">Use your workspace account to continue.</Typography>
            {error && <Alert severity="error" role="alert" sx={{ mt: 2.5 }}>{error}</Alert>}
            <Box component="form" onSubmit={handleSubmit} noValidate className="login-form">
              <TextField
                label="Username"
                autoComplete="username"
                required
                fullWidth
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonOutlineRoundedIcon /></InputAdornment> } }}
              />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                fullWidth
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><LockRoundedIcon /></InputAdornment> } }}
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting || !username || !password}>
                {submitting ? <CircularProgress size={22} color="inherit" /> : 'Sign in'}
              </Button>
            </Box>
            <Typography variant="caption" className="csrf-note">Protected by secure, cookie-based sign-in.</Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

function RouterBrand() {
  return <div className="brand login-brand"><span className="brand-mark" aria-hidden="true">F</span><span>Fieldnote<span className="brand-period" aria-hidden="true">.</span></span></div>
}
