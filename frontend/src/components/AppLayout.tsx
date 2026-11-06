import { useState } from 'react'
import { Link as RouterLink, NavLink, Outlet, useNavigate } from 'react-router'
import { AppBar, Avatar, Box, Button, Chip, Container, IconButton, Menu, MenuItem, Stack, Toolbar, Tooltip, Typography } from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import { useAuth } from '../auth/AuthContext'

export function AppLayout() {
  const { user, isAdmin, logout } = useAuth()
  const [anchor, setAnchor] = useState<null | HTMLElement>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const navigate = useNavigate()

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
      setAnchor(null)
    }
  }

  return (
    <Box className="app-frame">
      <AppBar position="sticky" color="inherit" elevation={0} className="topbar">
        <Toolbar className="topbar-inner">
          <RouterLink className="brand" to="/dashboard" aria-label="Fieldnote home">
            <span className="brand-mark">F</span>
            <span>Fieldnote<span className="brand-period">.</span></span>
          </RouterLink>
          <Box component="nav" className="main-nav" aria-label="Main navigation">
            <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <DashboardRoundedIcon fontSize="small" /> Overview
            </NavLink>
            <NavLink to="/products" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Inventory2RoundedIcon fontSize="small" /> Products
            </NavLink>
          </Box>
          <Stack direction="row" spacing={1.2} sx={{ alignItems: 'center' }}>
            {isAdmin && <Button className="top-create" variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/products/new')}>Add product</Button>}
            <Tooltip title="Account menu">
              <IconButton aria-label={`Account menu for ${user?.username}`} onClick={(event) => setAnchor(event.currentTarget)}>
                <Avatar className="user-avatar">{user?.username.slice(0, 1).toUpperCase()}</Avatar>
              </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
              <MenuItem disabled>{user?.username} · {user?.roles.join(', ')}</MenuItem>
              <MenuItem onClick={handleLogout} disabled={loggingOut}>
                <LogoutRoundedIcon fontSize="small" sx={{ mr: 1 }} /> Sign out
              </MenuItem>
            </Menu>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" component="main" className="main-content">
        <Outlet />
      </Container>

      <Box component="footer" className="app-footer">
        <Typography variant="caption">FIELDNOTE INVENTORY</Typography>
        <Chip size="small" label="Connected workspace" className="footer-chip" />
      </Box>
    </Box>
  )
}
