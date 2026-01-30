/*
 * user-store.ts - Firestore user document management with client-side encryption
 *
 * Provides:
 * - User document initialization on first sign-in
 * - Per-user AES-256 encryption key generation
 * - Encrypted API key storage/retrieval
 */

import { initializeApp, getApps } from 'firebase/app'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Firestore,
} from 'firebase/firestore'

// Firebase configuration (same as firebase-auth.ts)
const firebaseConfig = {
  apiKey: 'AIzaSyBYyEixJ0Kr33TvJBcjoqtcNuNElUbX2g4',
  authDomain: 'tjs-platform.firebaseapp.com',
  projectId: 'tjs-platform',
  storageBucket: 'tjs-platform.firebasestorage.app',
  messagingSenderId: '380998649944',
  appId: '1:380998649944:web:f7f075791fd849e083a22d',
}

let db: Firestore | null = null

function getDb(): Firestore {
  if (db) return db
  const app = getApps()[0] || initializeApp(firebaseConfig)
  db = getFirestore(app)
  return db
}

// ============================================
// Encryption utilities using Web Crypto API
// ============================================

async function generateEncryptionKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
  const exported = await crypto.subtle.exportKey('raw', key)
  return bufferToBase64(exported)
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
  const keyBuffer = base64ToBuffer(keyBase64)
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encrypt(plaintext: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return bufferToBase64(combined)
}

async function decrypt(
  encryptedBase64: string,
  keyBase64: string
): Promise<string> {
  const key = await importKey(keyBase64)
  const combined = base64ToBuffer(encryptedBase64)

  // Extract IV (first 12 bytes) and ciphertext
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(decrypted)
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ============================================
// User document types
// ============================================

export interface UserDoc {
  email: string | null
  displayName: string | null
  encryptionKey: string
  apiKeys: {
    openai?: string
    anthropic?: string
    deepseek?: string
  }
  created: number
  modified: number
}

export interface ApiKeys {
  openai?: string
  anthropic?: string
  gemini?: string
  deepseek?: string
}

// ============================================
// User document operations
// ============================================

/**
 * Initialize or get user document
 * Creates encryption key on first sign-in
 */
export async function initUserDoc(user: {
  uid: string
  email: string | null
  displayName: string | null
}): Promise<UserDoc> {
  const db = getDb()
  const userRef = doc(db, 'users', user.uid)
  const userSnap = await getDoc(userRef)

  if (userSnap.exists()) {
    return userSnap.data() as UserDoc
  }

  // First sign-in: create user doc with new encryption key
  const encryptionKey = await generateEncryptionKey()
  const userDoc: UserDoc = {
    email: user.email,
    displayName: user.displayName,
    encryptionKey,
    apiKeys: {},
    created: Date.now(),
    modified: Date.now(),
  }

  await setDoc(userRef, userDoc)
  return userDoc
}

/**
 * Get user's API keys (decrypted)
 */
export async function getApiKeys(uid: string): Promise<ApiKeys> {
  const db = getDb()
  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)

  if (!userSnap.exists()) {
    return {}
  }

  const userData = userSnap.data() as UserDoc
  const { encryptionKey, apiKeys } = userData

  // Decrypt each key
  const decrypted: ApiKeys = {}

  if (apiKeys.openai) {
    try {
      decrypted.openai = await decrypt(apiKeys.openai, encryptionKey)
    } catch (e) {
      console.error('Failed to decrypt OpenAI key')
    }
  }

  if (apiKeys.anthropic) {
    try {
      decrypted.anthropic = await decrypt(apiKeys.anthropic, encryptionKey)
    } catch (e) {
      console.error('Failed to decrypt Anthropic key')
    }
  }

  if (apiKeys.gemini) {
    try {
      decrypted.gemini = await decrypt(apiKeys.gemini, encryptionKey)
    } catch (e) {
      console.error('Failed to decrypt Gemini key')
    }
  }

  if (apiKeys.deepseek) {
    try {
      decrypted.deepseek = await decrypt(apiKeys.deepseek, encryptionKey)
    } catch (e) {
      console.error('Failed to decrypt Deepseek key')
    }
  }

  return decrypted
}

/**
 * Save user's API keys (encrypted)
 */
export async function saveApiKeys(uid: string, keys: ApiKeys): Promise<void> {
  const db = getDb()
  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)

  if (!userSnap.exists()) {
    throw new Error('User document not found')
  }

  const userData = userSnap.data() as UserDoc
  const { encryptionKey } = userData

  // Encrypt each key
  const encrypted: Record<string, string> = {}

  if (keys.openai) {
    encrypted.openai = await encrypt(keys.openai, encryptionKey)
  }

  if (keys.anthropic) {
    encrypted.anthropic = await encrypt(keys.anthropic, encryptionKey)
  }

  if (keys.gemini) {
    encrypted.gemini = await encrypt(keys.gemini, encryptionKey)
  }

  if (keys.deepseek) {
    encrypted.deepseek = await encrypt(keys.deepseek, encryptionKey)
  }

  await updateDoc(userRef, {
    apiKeys: encrypted,
    modified: Date.now(),
  })
}
