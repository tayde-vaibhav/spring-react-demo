import { Link as RouterLink } from 'react-router'
import { Box, Button, Typography } from '@mui/material'

export function NotFoundPage() {
  return (
    <Box className="not-found-page">
      <Typography className="eyebrow">404 · NOT FOUND</Typography>
      <Typography variant="h1">This page wandered off.</Typography>
      <Typography color="text.secondary">The address may be old, or the page may have moved.</Typography>
      <Button component={RouterLink} to="/dashboard" variant="contained">Back to overview</Button>
    </Box>
  )
}
