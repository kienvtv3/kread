import { describe, it, expect } from 'vitest'
import {
  createBuffer, fillRect, hline, strokeRect, fillTriangle,
  compositeGlyph, compositeMonoGlyph
} from '../../src/lib/eink/compositor.js'

describe('compositor', () => {
  it('createBuffer fills with value', () => {
    const buf = createBuffer(4, 4, 255)
    expect(buf.length).toBe(16)
    expect(buf.every(v => v === 255)).toBe(true)
  })

  it('fillRect fills a region', () => {
    const buf = createBuffer(10, 10, 255)
    fillRect(buf, 10, 2, 2, 3, 3, 0)
    expect(buf[2 * 10 + 2]).toBe(0)
    expect(buf[4 * 10 + 4]).toBe(0)
    expect(buf[0]).toBe(255)
  })

  it('hline draws horizontal line', () => {
    const buf = createBuffer(10, 5, 255)
    hline(buf, 10, 1, 2, 5, 0)
    expect(buf[2 * 10 + 1]).toBe(0)
    expect(buf[2 * 10 + 5]).toBe(0)
    expect(buf[2 * 10 + 0]).toBe(255)
    expect(buf[2 * 10 + 6]).toBe(255)
  })

  it('strokeRect draws outlined rectangle', () => {
    const buf = createBuffer(10, 10, 255)
    strokeRect(buf, 10, 2, 2, 6, 6, 0, 1)
    expect(buf[2 * 10 + 2]).toBe(0)
    expect(buf[2 * 10 + 7]).toBe(0)
    expect(buf[7 * 10 + 2]).toBe(0)
    expect(buf[4 * 10 + 4]).toBe(255)
  })

  it('fillTriangle fills a triangle region', () => {
    const buf = createBuffer(10, 10, 255)
    fillTriangle(buf, 10, 10, 2, 2, 2, 8, 8, 5, 0)
    expect(buf[5 * 10 + 5]).toBe(0)
    expect(buf[0 * 10 + 0]).toBe(255)
  })

  it('compositeGlyph blends coverage onto buffer', () => {
    const buf = createBuffer(10, 10, 255)
    const glyph = {
      width: 2, height: 2,
      pixels: new Uint8Array([128, 255, 64, 0])
    }
    compositeGlyph(buf, 10, 10, glyph, 3, 3)
    expect(buf[3 * 10 + 3]).toBe(127)
    expect(buf[3 * 10 + 4]).toBe(0)
    expect(buf[4 * 10 + 3]).toBe(191)
    expect(buf[4 * 10 + 4]).toBe(255)
  })

  it('compositeGlyph clips at buffer edges', () => {
    const buf = createBuffer(5, 5, 255)
    const glyph = {
      width: 3, height: 3,
      pixels: new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 255])
    }
    compositeGlyph(buf, 5, 5, glyph, 4, 4)
    expect(buf[4 * 5 + 4]).toBe(0)
    expect(buf[3 * 5 + 4]).toBe(255)
  })

  it('compositeMonoGlyph places 1-bit packed bitmap', () => {
    const buf = createBuffer(16, 4, 255)
    const glyph = {
      width: 16, height: 1,
      pixels: new Uint8Array([0xFF, 0x00])
    }
    compositeMonoGlyph(buf, 16, 4, glyph, 0, 0)
    expect(buf[0]).toBe(0)
    expect(buf[7]).toBe(0)
    expect(buf[8]).toBe(255)
    expect(buf[15]).toBe(255)
  })
})
