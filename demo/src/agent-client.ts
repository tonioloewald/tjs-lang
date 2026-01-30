/*
 * agent-client.ts - Client for calling the universal AJS endpoint
 */

import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'

// Firebase configuration (same as firebase-auth.ts)
const firebaseConfig = {
  apiKey: 'AIzaSyBYyEixJ0Kr33TvJBcjoqtcNuNElUbX2g4',
  authDomain: 'tjs-platform.firebaseapp.com',
  projectId: 'tjs-platform',
  storageBucket: 'tjs-platform.firebasestorage.app',
  messagingSenderId: '380998649944',
  appId: '1:380998649944:web:f7f075791fd849e083a22d',
}

let functions: ReturnType<typeof getFunctions> | null = null

function getFunctionsInstance() {
  if (functions) return functions
  const app = getApps()[0] || initializeApp(firebaseConfig)
  functions = getFunctions(app)
  return functions
}

export interface AgentRunRequest {
  code: string
  args?: Record<string, unknown>
  fuel?: number
}

export interface AgentRunResponse {
  result: unknown
  fuelUsed: number
  error: { message: string } | null
}

/**
 * Get the current user's ID token for API calls
 */
export async function getIdToken(): Promise<string | null> {
  const app = getApps()[0] || initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const user = auth.currentUser
  if (!user) return null
  return user.getIdToken()
}

/**
 * Call the universal AJS endpoint via REST
 * Lighter weight than the callable version
 */
export async function run(request: AgentRunRequest): Promise<AgentRunResponse> {
  const token = await getIdToken()
  if (!token) {
    throw new Error('Not authenticated')
  }

  const res = await fetch('/run', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  return res.json()
}

/**
 * Call the universal AJS endpoint via Firebase callable
 * Requires user to be signed in
 */
export async function runAgent(
  request: AgentRunRequest
): Promise<AgentRunResponse> {
  const functions = getFunctionsInstance()
  const agentRun = httpsCallable<AgentRunRequest, AgentRunResponse>(
    functions,
    'agentRun'
  )

  const result = await agentRun(request)
  return result.data
}

// Expose to window for console and playground use
if (typeof window !== 'undefined') {
  ;(window as any).runAgent = runAgent
  ;(window as any).run = run
  ;(window as any).getIdToken = getIdToken
}
