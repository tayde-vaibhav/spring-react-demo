import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, IconButton, InputAdornment, MenuItem,
  Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TableSortLabel, TextField, Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import { api, ApiError, type Product } from '../api/client'
import { useAuth } from '../auth/AuthContext'

const PAGE_SIZE = 10
type SortField = 'name' | 'category' | 'price' | 'stock' | 'createdAt'

export function ProductsPage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<SortField>('createdAt')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const filters = useMemo(() => ({
    page, size: PAGE_SIZE, sort, direction, q: search,
    category, minPrice, maxPrice,
  }), [page, sort, direction, search, category, minPrice, maxPrice])

  const products = useQuery({ queryKey: ['products', filters], queryFn: () => api.products(filters) })
  const stats = useQuery({ queryKey: ['product-stats'], queryFn: api.stats })
  const removeProduct = useMutation({
    mutationFn: async (id: string) => api.deleteProduct(id, await api.getCsrfToken()),
    onSuccess: async () => {
      setSelected(null)
      setDeleteError('')
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['product-stats'] })
    },
    onError: (error) => setDeleteError(error instanceof ApiError ? error.problem.detail || error.message : 'Could not delete this product.'),
  })

  function changeSort(field: SortField) {
    setDirection((current) => field === sort ? (current === 'asc' ? 'desc' : 'asc') : 'asc')
    setSort(field)
    setPage(0)
  }

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value)
    setPage(0)
  }

  const categoryNames = stats.data?.map((item) => item.category).sort() ?? []

  return (
    <Box className="page-content">
      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">CATALOGUE</Typography>
          <Typography component="h1" variant="h2">Products</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.7 }}>A thoughtful view of every item in your collection.</Typography>
        </Box>
        {isAdmin && <Button component={RouterLink} to="/products/new" variant="contained" startIcon={<AddRoundedIcon />}>Add product</Button>}
      </Box>

      <Card className="filters-card">
        <CardContent className="filters-row">
          <TextField
            className="search-field"
            label="Search products"
            placeholder="Name or description"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label="Category" value={category} onChange={(event) => changeFilter(setCategory, event.target.value)} className="filter-field">
            <MenuItem value="">All categories</MenuItem>
            {categoryNames.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
          </TextField>
          <TextField label="Min price" type="number" slotProps={{ htmlInput: { min: 0, step: '0.01' } }} value={minPrice} onChange={(event) => changeFilter(setMinPrice, event.target.value)} className="price-filter" />
          <TextField label="Max price" type="number" slotProps={{ htmlInput: { min: 0, step: '0.01' } }} value={maxPrice} onChange={(event) => changeFilter(setMaxPrice, event.target.value)} className="price-filter" />
          {(category || minPrice || maxPrice || searchInput) && (
            <Button startIcon={<CloseRoundedIcon />} onClick={() => { setCategory(''); setMinPrice(''); setMaxPrice(''); setSearchInput(''); setSearch(''); setPage(0) }}>
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {deleteError && <Alert severity="error" onClose={() => setDeleteError('')} sx={{ mb: 2 }}>{deleteError}</Alert>}
      {products.isError && (
        <Alert severity="error" action={<Button color="inherit" onClick={() => void products.refetch()}>Retry</Button>} sx={{ mb: 2 }}>
          {products.error instanceof ApiError ? products.error.problem.detail || 'Products could not be loaded.' : 'Products could not be loaded. Check your connection and try again.'}
        </Alert>
      )}

      <Card className="table-card">
        <TableContainer>
          <Table aria-label="Product catalogue" size="medium">
            <TableHead>
              <TableRow>
                {([['name', 'Product'], ['category', 'Category'], ['price', 'Price'], ['stock', 'Stock'], ['createdAt', 'Added']] as const).map(([field, label]) => (
                  <TableCell key={field} aria-sort={sort === field ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <TableSortLabel active={sort === field} direction={sort === field ? direction : 'asc'} onClick={() => changeSort(field)}>{label}</TableSortLabel>
                  </TableCell>
                ))}
                <TableCell>Status</TableCell>
                {isAdmin && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {products.isLoading && Array.from({ length: 5 }, (_, index) => (
                <TableRow key={`loading-${index}`}><TableCell colSpan={isAdmin ? 7 : 6}><Skeleton height={43} /></TableCell></TableRow>
              ))}
              {!products.isLoading && !products.isError && products.data?.content.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 7 : 6}>
                  <Box className="empty-state"><span className="empty-state-mark">✳</span><Typography variant="h6">Nothing in this view yet</Typography><Typography color="text.secondary">Try changing a filter or search for something else.</Typography></Box>
                </TableCell></TableRow>
              )}
              {products.data?.content.map((product) => (
                <TableRow key={product.id} hover>
                  <TableCell>
                    <Stack spacing={0.2}>
                      <Typography sx={{ fontWeight: 700 }}>{product.name}</Typography>
                      <Typography variant="caption" color="text.secondary" className="description-cell">{product.description || 'No description'}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell><Chip className="category-chip" size="small" label={product.category} /></TableCell>
                  <TableCell className="numeric-cell">{formatCurrency(product.price)}</TableCell>
                  <TableCell className="numeric-cell">{product.stock.toLocaleString()}</TableCell>
                  <TableCell>{product.createdAt ? new Date(product.createdAt).toLocaleDateString() : '—'}</TableCell>
                  <TableCell><Chip size="small" label={product.active ? 'Active' : 'Inactive'} className={product.active ? 'status-active' : 'status-inactive'} /></TableCell>
                  {isAdmin && <TableCell align="right" className="row-actions">
                    <IconButton component={RouterLink} to={`/products/${encodeURIComponent(product.id)}/edit`} aria-label={`Edit ${product.name}`} size="small"><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton aria-label={`Delete ${product.name}`} size="small" color="error" onClick={() => { setSelected(product); setDeleteError('') }}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                  </TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={products.data?.totalElements ?? 0}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count}`}
        />
      </Card>

      <Dialog open={Boolean(selected)} onClose={() => !removeProduct.isPending && setSelected(null)} aria-labelledby="delete-title" aria-describedby="delete-description">
        <DialogTitle id="delete-title">Remove this product?</DialogTitle>
        <DialogContent><DialogContentText id="delete-description">“{selected?.name}” will be removed from your catalogue. This cannot be undone.</DialogContentText></DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setSelected(null)} disabled={removeProduct.isPending}>Keep product</Button>
          <Button color="error" variant="contained" onClick={() => selected && removeProduct.mutate(selected.id)} disabled={removeProduct.isPending}>
            {removeProduct.isPending ? <CircularProgress size={18} color="inherit" /> : 'Remove product'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}
