import { useState, type FormEvent } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, FormControlLabel,
  Skeleton, Stack, Switch, TextField, Typography,
} from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import { api, ApiError, type Product, type ProductRequest, type ProductUpdateRequest } from '../api/client'

interface ProductFormValues {
  name: string
  description: string
  category: string
  price: string
  stock: string
  tags: string
  specs: string
  active: boolean
}

type FieldErrors = Partial<Record<keyof ProductFormValues | 'form', string>>

const blankValues: ProductFormValues = {
  name: '', description: '', category: '', price: '', stock: '0', tags: '', specs: '{}', active: true,
}

export function ProductFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const product = useQuery({ queryKey: ['product', id], queryFn: () => api.product(id!), enabled: editing })

  if (editing && product.isLoading) return <Box className="page-content"><Skeleton height={64} /><Skeleton height={400} /></Box>
  if (editing && product.isError) return <Box className="page-content"><Alert severity="error">{product.error instanceof ApiError ? product.error.problem.detail : 'Could not load this product.'}</Alert></Box>

  return <ProductEditor key={id || 'new-product'} id={id} initialProduct={product.data ?? null} />
}

function ProductEditor({ id, initialProduct }: { id?: string; initialProduct: Product | null }) {
  const editing = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<ProductFormValues>(() => initialProduct ? toForm(initialProduct) : blankValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')

  const save = useMutation({
    mutationFn: async (payload: ProductRequest) => {
      const csrf = await api.getCsrfToken()
      return editing
        ? api.updateProduct(id!, { ...payload, version: initialProduct!.version } satisfies ProductUpdateRequest, csrf)
        : api.createProduct(payload, csrf)
    },
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['product-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['product', id] }),
      ])
      navigate('/products', { replace: true, state: { notice: `${saved.name} ${editing ? 'updated' : 'added'}.` } })
    },
    onError: (cause) => {
      setFormError(cause instanceof ApiError ? cause.problem.detail || 'Please review the form and try again.' : 'Unable to save this product.')
      if (cause instanceof ApiError && cause.problem.errors) {
        setErrors(Object.fromEntries(Object.entries(cause.problem.errors).map(([key, message]) => [key as keyof ProductFormValues, message])))
      }
    },
  })

  const title = editing ? 'Edit product' : 'Add a product'

  function update<K extends keyof ProductFormValues>(field: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setFormError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validate(values)
    setErrors(validation.errors)
    setFormError(validation.formError)
    if (Object.keys(validation.errors).length || validation.formError) return
    const payload = makePayload(values)
    if (payload) save.mutate(payload)
  }

  return (
    <Box className="page-content form-page">
      <Button component={RouterLink} to="/products" startIcon={<ArrowBackRoundedIcon />} className="back-link">Back to products</Button>
      <Box className="page-heading form-heading">
        <Box><Typography className="eyebrow">CATALOGUE · {editing ? 'UPDATE' : 'NEW ENTRY'}</Typography><Typography component="h1" variant="h2">{title}</Typography><Typography color="text.secondary" sx={{ mt: 0.6 }}>Good details make everything easier to find.</Typography></Box>
      </Box>

      {formError && <Alert severity="error" role="alert" sx={{ mb: 2.5 }}>{formError}</Alert>}
      <Card className="form-card">
        <CardContent>
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Typography className="form-section-title">The essentials</Typography>
            <Box className="form-grid">
              <TextField label="Product name" required fullWidth value={values.name} onChange={(event) => update('name', event.target.value)} error={Boolean(errors.name)} helperText={errors.name || `${values.name.length}/200`} slotProps={{ htmlInput: { maxLength: 200 } }} />
              <TextField label="Category" required fullWidth value={values.category} onChange={(event) => update('category', event.target.value)} error={Boolean(errors.category)} helperText={errors.category || `${values.category.length}/100`} slotProps={{ htmlInput: { maxLength: 100 } }} />
              <TextField label="Price" required type="number" fullWidth value={values.price} onChange={(event) => update('price', event.target.value)} error={Boolean(errors.price)} helperText={errors.price || 'Must be greater than 0; up to 2 decimal places.'} slotProps={{ htmlInput: { min: '0.01', step: '0.01' } }} />
              <TextField label="Stock quantity" required type="number" fullWidth value={values.stock} onChange={(event) => update('stock', event.target.value)} error={Boolean(errors.stock)} helperText={errors.stock || 'Whole number, zero or more.'} slotProps={{ htmlInput: { min: 0, step: 1 } }} />
              <TextField label="Description" multiline minRows={3} maxRows={6} fullWidth className="form-wide" value={values.description} onChange={(event) => update('description', event.target.value)} error={Boolean(errors.description)} helperText={errors.description || `${values.description.length}/2000`} slotProps={{ htmlInput: { maxLength: 2000 } }} />
            </Box>

            <Typography className="form-section-title form-section-spaced">Details & discovery</Typography>
            <Box className="form-grid">
              <TextField label="Tags" placeholder="e.g. outdoor, lightweight, travel" fullWidth value={values.tags} onChange={(event) => update('tags', event.target.value)} error={Boolean(errors.tags)} helperText={errors.tags || 'Separate tags with commas · up to 20 tags, 50 characters each.'} className="form-wide" />
              <TextField label="Specifications (JSON)" multiline minRows={5} fullWidth value={values.specs} onChange={(event) => update('specs', event.target.value)} error={Boolean(errors.specs)} helperText={errors.specs || 'Nested object · max 30 keys per object and 3 levels deep.'} className="form-wide specs-field" />
              <FormControlLabel control={<Switch checked={values.active} onChange={(event) => update('active', event.target.checked)} />} label={values.active ? 'Product is active' : 'Product is inactive'} className="active-switch" />
            </Box>

            {errors.form && <Alert severity="error" sx={{ mt: 2 }}>{errors.form}</Alert>}
            <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1.2} className="form-actions" sx={{ justifyContent: 'flex-end' }}>
              <Button component={RouterLink} to="/products" variant="text" color="inherit">Cancel</Button>
              <Button type="submit" variant="contained" startIcon={save.isPending ? <CircularProgress size={18} color="inherit" /> : <SaveRoundedIcon />} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}

function toForm(product: Product): ProductFormValues {
  return {
    name: product.name,
    description: product.description || '',
    category: product.category,
    price: String(product.price),
    stock: String(product.stock),
    tags: (product.tags || []).join(', '),
    specs: JSON.stringify(product.specs || {}, null, 2),
    active: product.active,
  }
}

function validate(values: ProductFormValues): { errors: FieldErrors; formError: string } {
  const errors: FieldErrors = {}
  const formError = ''
  if (!values.name.trim()) errors.name = 'Enter a product name.'
  else if (values.name.length > 200) errors.name = 'Name must be 200 characters or fewer.'
  if (!values.category.trim()) errors.category = 'Enter a category.'
  else if (values.category.length > 100) errors.category = 'Category must be 100 characters or fewer.'
  if (values.description.length > 2000) errors.description = 'Description must be 2,000 characters or fewer.'
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(values.price) || Number(values.price) <= 0) errors.price = 'Enter a positive amount with up to 12 whole digits and 2 decimal places.'
  if (!/^\d+$/.test(values.stock) || Number(values.stock) < 0 || Number(values.stock) > 2_147_483_647 || !Number.isSafeInteger(Number(values.stock))) errors.stock = 'Enter a whole number between 0 and 2,147,483,647.'

  const tags = parseTags(values.tags)
  if (tags.length > 20) errors.tags = 'Use no more than 20 tags.'
  else if (tags.some((tag) => tag.length === 0 || tag.length > 50)) errors.tags = 'Each tag must contain 1–50 characters.'

  try {
    const parsed: unknown = JSON.parse(values.specs || '{}')
    if (!isPlainObject(parsed)) errors.specs = 'Specifications must be a JSON object.'
    else if (!validSpecs(parsed, 1)) errors.specs = 'Specifications contain unsupported values or exceed key, size, depth, or value limits.'
  } catch {
    errors.specs = 'Enter valid JSON for specifications.'
  }
  return { errors, formError }
}

function makePayload(values: ProductFormValues): ProductRequest | null {
  try {
    return {
      name: values.name.trim(),
      description: values.description,
      category: values.category.trim(),
      price: Number(values.price),
      stock: Number(values.stock),
      tags: parseTags(values.tags),
      specs: JSON.parse(values.specs || '{}') as Record<string, unknown>,
      active: values.active,
    }
  } catch {
    return null
  }
}

function parseTags(value: string) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validSpecs(value: unknown, depth: number): boolean {
  if (isPlainObject(value)) {
    return depth <= 3 && Object.keys(value).length <= 30 && Object.entries(value).every(([key, child]) =>
      /^[A-Za-z][A-Za-z0-9_-]{0,49}$/.test(key) && validSpecValue(child, depth))
  }
  return false
}

function validSpecValue(value: unknown, depth: number): boolean {
  if (isPlainObject(value)) return validSpecs(value, depth + 1)
  if (Array.isArray(value)) return depth < 3 && value.length <= 50 && value.every((child) => validSpecValue(child, depth + 1))
  if (typeof value === 'string') return value.length <= 500
  if (typeof value === 'number') return Number.isFinite(value) && decimalFits(value)
  return value === null || typeof value === 'boolean'
}

function decimalFits(value: number): boolean {
  const asText = String(value).toLowerCase()
  if (asText.includes('e')) return false
  const [whole, fraction = ''] = asText.replace('-', '').split('.')
  const significantWhole = whole.replace(/^0+/, '')
  const significantDigits = `${significantWhole}${fraction}`.replace(/^0+/, '').length
  return significantDigits <= 18 && fraction.length <= 6
}
