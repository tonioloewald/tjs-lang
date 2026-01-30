/*
 * firebase-auth.ts - Firebase Authentication with Google Sign-In
 *
 * Provides:
 * - Google Sign-In / Sign-Out
 * - Auth state management
 * - ID token retrieval for Cloud Functions
 */

import { initializeApp, FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth'

// Firebase configuration - these are public client-side values
const firebaseConfig = {
  apiKey: 'AIzaSyBYyEixJ0Kr33TvJBcjoqtcNuNElUbX2g4',
  authDomain: 'tjs-platform.firebaseapp.com',
  projectId: 'tjs-platform',
  storageBucket: 'tjs-platform.firebasestorage.app',
  messagingSenderId: '380998649944',
  appId: '1:380998649944:web:f7f075791fd849e083a22d',
}

// Singleton instances
let app: FirebaseApp | null = null
let auth: Auth | null = null

// Auth state
export interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

// Subscribers for auth state changes
type AuthSubscriber = (state: AuthState) => void
const subscribers: Set<AuthSubscriber> = new Set()

let currentState: AuthState = {
  user: null,
  loading: true,
  error: null,
}

function notifySubscribers() {
  for (const subscriber of subscribers) {
    subscriber(currentState)
  }
}

/**
 * Initialize Firebase Auth
 * Call this once at app startup
 */
export function initAuth(): Auth {
  if (auth) return auth

  app = initializeApp(firebaseConfig)
  auth = getAuth(app)

  // Listen for auth state changes
  onAuthStateChanged(auth, (user) => {
    currentState = {
      user,
      loading: false,
      error: null,
    }
    notifySubscribers()
  })

  return auth
}

/**
 * Get the current auth instance
 */
export function getAuthInstance(): Auth | null {
  return auth
}

/**
 * Subscribe to auth state changes
 */
export function subscribeAuth(callback: AuthSubscriber): () => void {
  subscribers.add(callback)
  // Immediately call with current state
  callback(currentState)
  // Return unsubscribe function
  return () => subscribers.delete(callback)
}

/**
 * Get current auth state
 */
export function getAuthState(): AuthState {
  return currentState
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle(): Promise<User | null> {
  if (!auth) {
    initAuth()
  }

  try {
    currentState = { ...currentState, loading: true, error: null }
    notifySubscribers()

    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth!, provider)

    currentState = {
      user: result.user,
      loading: false,
      error: null,
    }
    notifySubscribers()

    return result.user
  } catch (error: any) {
    currentState = {
      user: null,
      loading: false,
      error: error.message || 'Sign in failed',
    }
    notifySubscribers()
    return null
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  if (!auth) return

  try {
    await firebaseSignOut(auth)
    currentState = {
      user: null,
      loading: false,
      error: null,
    }
    notifySubscribers()
  } catch (error: any) {
    currentState = {
      ...currentState,
      error: error.message || 'Sign out failed',
    }
    notifySubscribers()
  }
}

/**
 * Get the current user's ID token for authenticating with Cloud Functions
 * Returns null if not signed in
 */
export async function getIdToken(): Promise<string | null> {
  const user = currentState.user
  if (!user) return null

  try {
    return await user.getIdToken()
  } catch (error) {
    console.error('Failed to get ID token:', error)
    return null
  }
}

/**
 * Get current user info in a simple format
 */
export function getCurrentUser(): {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
} | null {
  const user = currentState.user
  if (!user) return null

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  }
}
