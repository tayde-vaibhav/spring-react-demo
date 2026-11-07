import { describe, expect, it } from 'vitest'
import { isValidProductPrice } from './productPrice'

describe('unchanged product price validation', () => {
  it.each(['1', '5', '0.01', '1.1', '1.00', '01.00', '000000000001', '999999999999', '999999999999.99'])(
    'accepts existing valid price case #%#', (value) => {
      expect(isValidProductPrice(value)).toBe(true)
    })

  it.each(['', '0', '0.00', '-1', '+1', '.01', '1.', '1.001', '1000000000000', '0000000000001',
    '1e2', 'NaN', 'Infinity', ' 1', '1 ', '1,00', '1x', '１２', '١٢'])(
    'rejects existing invalid price case #%#', (value) => {
      expect(isValidProductPrice(value)).toBe(false)
    })

  it('rejects long/adversarial values without relaxing precision', () => {
    for (const value of ['9'.repeat(100_000), '1.' + '9'.repeat(100_000), ' '.repeat(100_000), '(a+)+$']) {
      expect(isValidProductPrice(value)).toBe(false)
    }
  })

  it('retains the existing rejection of trailing line terminators', () => {
    for (const value of ['1\n', '1\r', '1\r\n', '1\u2028', '1\u2029', '0\n']) {
      expect(isValidProductPrice(value)).toBe(false)
    }
  })
})
