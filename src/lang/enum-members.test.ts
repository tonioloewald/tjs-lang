/**
 * An Enum line that is not a member is refused, not skipped (#4130). `Enum E 'd' { A: 'a' }`
 * (the object-literal habit) produced an EMPTY enum with no error, because each line that did not
 * match `Name` or `Name = value` was dropped. The colon form gets the corrected spelling back.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

describe('Enum members', () => {
  it('written with colons is refused, naming the fix', () => {
    expect(() => tjs(`Enum E 'kinds' { A: 'a', B: 'b' }`)).toThrow(
      /write members with =, not :.*A = 'a'/
    )
  })
  it('any other non-member line is refused', () => {
    expect(() => tjs(`Enum E 'kinds' { A = 'a', 3 }`)).toThrow(
      /'3' is not a member/
    )
  })
  it('valid members still work (the other direction)', () => {
    const E = new Function(
      tjs(`Enum E 'kinds' { A = 'a', B = 'b' }\nEnum N 'n' { X, Y = 5, Z }`)
        .code + '\nreturn [E, N]'
    )()
    expect(E[0].values).toEqual(['a', 'b'])
    expect(E[1].values).toEqual([0, 5, 6])
  })
})
