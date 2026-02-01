/*#
# Encryption Utilities

Server-side decryption using Node.js crypto module.
Must match the client-side Web Crypto API encryption.
*/

import * as crypto from 'crypto'

function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64')
}
base64ToBuffer.__tjs = {
  params: {
    base64: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'crypto.tjs:10',
}

export async function decrypt(encryptedBase64, keyBase64) {
  const keyBuffer = base64ToBuffer(keyBase64)
  const combined = base64ToBuffer(encryptedBase64)

  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const authTag = ciphertext.slice(-16)
  const encryptedData = ciphertext.slice(0, -16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedData)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString('utf8')
}
decrypt.__tjs = {
  params: {
    encryptedBase64: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    keyBase64: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'crypto.tjs:14',
}
