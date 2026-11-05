import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Alert, Box, Card, CardContent, CircularProgress, Typography } from '@mui/material'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, ApiError } from '../api/client'

const CHART_COLORS = ['#315b50', '#6a9383', '#d37d59', '#91aa80', '#d5a85c', '#648493', '#a87d88', '#8a9eae', '#bf926d']

export function DashboardPage() {
  const stats = useQuery({ queryKey: ['product-stats'], queryFn: api.stats })
  const items = stats.data ?? []
  const totalProducts = items.reduce((total, item) => total + item.count, 0)
  const averageAcrossCategories = items.length
    ? items.reduce((total, item) => total + item.averagePrice * item.count, 0) / Math.max(totalProducts, 1)
    : 0

  return (
    <Box className="page-content">
      <Box className="page-heading dashboard-heading">
        <Box>
          <Typography className="eyebrow">YOUR WORKSPACE</Typography>
          <Typography component="h1" variant="h2">A little perspective.</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.7 }}>The shape of your catalogue, at a glance.</Typography>
        </Box>
        <Box className="date-note"><span className="date-note-dot" /> LIVE OVERVIEW</Box>
      </Box>

      {stats.isError && <Alert severity="error" action={<button className="alert-retry" onClick={() => void stats.refetch()}>Try again</button>} sx={{ mb: 2 }}>{stats.error instanceof ApiError ? stats.error.problem.detail || 'Dashboard metrics could not be loaded.' : 'Dashboard metrics could not be loaded.'}</Alert>}

      <Box className="metric-grid">
        <MetricCard icon={<Inventory2OutlinedIcon />} label="PRODUCTS IN CATALOGUE" value={stats.isLoading ? '—' : totalProducts.toLocaleString()} note="Across your active collection" />
        <MetricCard icon={<CategoryOutlinedIcon />} label="CATEGORIES" value={stats.isLoading ? '—' : items.length.toString()} note="Distinct product groups" />
        <MetricCard icon={<QueryStatsOutlinedIcon />} label="WEIGHTED AVERAGE PRICE" value={stats.isLoading ? '—' : formatPrice(averageAcrossCategories)} note="Weighted by products in each category" />
      </Box>

      <Box className="chart-grid">
        <Card className="chart-card">
          <CardContent>
            <Box className="chart-heading"><Box><Typography className="eyebrow">DISTRIBUTION</Typography><Typography variant="h6">Products by category</Typography></Box><span className="chart-unit">ITEMS</span></Box>
            {stats.isLoading ? <ChartLoading /> : items.length === 0 ? <ChartEmpty /> : (
              <Box className="chart-area" role="img" aria-label="Bar chart showing product counts by category">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={items} margin={{ top: 16, right: 12, left: -20, bottom: 36 }}>
                    <CartesianGrid stroke="#e9ede8" vertical={false} strokeDasharray="3 4" />
                    <XAxis dataKey="category" tick={{ fill: '#79847e', fontSize: 11 }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} />
                    <YAxis allowDecimals={false} tick={{ fill: '#79847e', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f3f6f1' }} formatter={(value) => [`${Number(value).toLocaleString()} items`, 'Products']} />
                    <Bar dataKey="count" radius={[7, 7, 2, 2]} maxBarSize={44}>
                      {items.map((item, index) => <Cell key={item.category} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </CardContent>
        </Card>
        <Card className="chart-card">
          <CardContent>
            <Box className="chart-heading"><Box><Typography className="eyebrow">VALUE</Typography><Typography variant="h6">Average price by category</Typography></Box><span className="chart-unit">AVERAGE</span></Box>
            {stats.isLoading ? <ChartLoading /> : items.length === 0 ? <ChartEmpty /> : (
              <Box className="chart-area" role="img" aria-label="Bar chart showing average prices by category">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={items} margin={{ top: 16, right: 12, left: -20, bottom: 36 }}>
                    <CartesianGrid stroke="#e9ede8" vertical={false} strokeDasharray="3 4" />
                    <XAxis dataKey="category" tick={{ fill: '#79847e', fontSize: 11 }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: '#79847e', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatPrice(Number(value))} />
                    <Tooltip cursor={{ fill: '#f3f6f1' }} formatter={(value) => [formatPrice(Number(value)), 'Average price']} />
                    <Bar dataKey="averagePrice" fill="#d37d59" radius={[7, 7, 2, 2]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>

      <Typography className="dashboard-footnote">Metrics reflect the current catalogue and update when product data changes.</Typography>
    </Box>
  )
}

function MetricCard({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <Card className="metric-card"><CardContent><Box className="metric-top"><span className="metric-icon">{icon}</span><Typography className="metric-label">{label}</Typography></Box><Typography variant="h3" className="metric-value">{value}</Typography><Typography variant="caption" color="text.secondary">{note}</Typography></CardContent></Card>
}

function ChartLoading() {
  return <Box className="chart-loading" aria-label="Loading chart"><CircularProgress size={28} /></Box>
}

function ChartEmpty() {
  return <Box className="chart-loading"><Typography color="text.secondary">No category data to chart yet.</Typography></Box>
}

function formatPrice(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}
