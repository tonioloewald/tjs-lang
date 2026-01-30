/*
 * agent-client.ts - Client for calling the universal AJS endpoint
 */

import { getApps, initializeApp } from 'firebase/app'
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
 * Call the universal AJS endpoint
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

// Expose to window for console testing
if (typeof window !== 'undefined') {
  ;(window as any).runAgent = runAgent
}
