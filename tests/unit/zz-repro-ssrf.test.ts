import { describe, it, expect } from 'vitest'
import { assertSafeUrl } from '@/lib/reminders/channels/zz-http-head'

const attacks = [
  'http://[::ffff:169.254.169.254]/api/services/tts/speak',
  'http://[::ffff:127.0.0.1]:8123/api/services/tts/speak',
  'http://[::169.254.169.254]/latest/meta-data/',
  'http://[0:0:0:0:0:0:0:1]/',
  'http://[fe80:0::1]/',
]
const shouldPass = ['http://2130706433/', 'http://0177.0.0.1/']

describe('committed guard @ HEAD', () => {
  for (const a of attacks) {
    it(`should block ${a}`, () => {
      let out: string | null = null
      try { out = assertSafeUrl(a).hostname } catch (e) { out = `BLOCKED (${(e as Error).message})` }
      console.log(`${a}\n   -> ${out}`)
      expect(String(out)).toContain('BLOCKED')
    })
  }
  for (const a of shouldPass) {
    it(`normalization check ${a}`, () => {
      let out: string
      try { out = assertSafeUrl(a).hostname } catch (e) { out = `BLOCKED (${(e as Error).message})` }
      console.log(`${a}\n   -> ${out}`)
      expect(String(out)).toContain('BLOCKED')
    })
  }
})
