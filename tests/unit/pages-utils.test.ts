import { describe, expect, it } from 'vitest'
import { chunkEvery, evenIndices, formatRanges, oddIndices, parsePageRanges, parseRangeGroups, toAlpha, toRoman } from '@/utils/pages'

describe('parsePageRanges', () => {
  it('parses lists, ranges and open ranges (1-based → 0-based)', () => {
    expect(parsePageRanges('1-3, 5', 10)).toEqual([0, 1, 2, 4])
    expect(parsePageRanges('8-', 10)).toEqual([7, 8, 9])
    expect(parsePageRanges('-3', 10)).toEqual([0, 1, 2])
    expect(parsePageRanges('3-1', 5)).toEqual([0, 1, 2])
    expect(parsePageRanges(' 2 , 2 , 4 ', 5)).toEqual([1, 3])
    expect(parsePageRanges('', 5)).toEqual([])
  })
  it('rejects out-of-range and malformed input with clear errors', () => {
    expect(() => parsePageRanges('0', 5)).toThrow(/outside/)
    expect(() => parsePageRanges('6', 5)).toThrow(/outside/)
    expect(() => parsePageRanges('1-9', 5)).toThrow(/outside/)
    expect(() => parsePageRanges('a', 5)).toThrow(/Invalid/)
    expect(() => parsePageRanges('1--3', 5)).toThrow(/Invalid/)
  })
  it('parses groups separated by semicolons', () => {
    expect(parseRangeGroups('1-2; 4; 6-', 7)).toEqual([[0, 1], [3], [5, 6]])
  })
})

describe('split helpers', () => {
  it('chunks every N pages', () => {
    expect(chunkEvery(7, 3)).toEqual([[0, 1, 2], [3, 4, 5], [6]])
    expect(chunkEvery(0, 3)).toEqual([])
    expect(() => chunkEvery(5, 0)).toThrow()
  })
  it('odd / even indices', () => {
    expect(oddIndices(5)).toEqual([0, 2, 4])
    expect(evenIndices(5)).toEqual([1, 3])
    expect(evenIndices(1)).toEqual([])
  })
  it('formats ranges compactly', () => {
    expect(formatRanges([0, 1, 2, 4, 6, 7])).toBe('1-3, 5, 7-8')
    expect(formatRanges([])).toBe('')
  })
})

describe('page label helpers', () => {
  it('roman numerals', () => {
    expect(toRoman(1)).toBe('i')
    expect(toRoman(4)).toBe('iv')
    expect(toRoman(9)).toBe('ix')
    expect(toRoman(1994)).toBe('mcmxciv')
  })
  it('alphabetic labels follow the PDF convention (a…z, aa…zz)', () => {
    expect(toAlpha(1)).toBe('a')
    expect(toAlpha(26)).toBe('z')
    expect(toAlpha(27)).toBe('aa')
    expect(toAlpha(28)).toBe('bb')
  })
})
