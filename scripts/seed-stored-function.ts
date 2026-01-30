#!/usr/bin/env bun
/**
 * Seed a test stored function into Firestore
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS or ADC)
initializeApp({
  projectId: 'tjs-platform',
})

const db = getFirestore()

// Sample stored functions
const storedFunctions = [
  {
    id: 'hello-world',
    name: 'Hello World',
    urlPattern: '/hello',
    contentType: 'application/json',
    public: true,
    code: `return { message: 'Hello from TJS!', timestamp: Date.now() }`,
    fuel: 100,
  },
  {
    id: 'hello-name',
    name: 'Hello Name',
    urlPattern: '/hello/:name',
    contentType: 'application/json',
    public: true,
    code: `return { message: 'Hello, ' + name + '!', path: _path }`,
    fuel: 100,
  },
  {
    id: 'about-page',
    name: 'About Page',
    urlPattern: '/about',
    contentType: 'text/html',
    public: true,
    code: `return '<html><body><h1>About TJS Platform</h1><p>A type-safe JavaScript platform.</p></body></html>'`,
    fuel: 100,
  },
]

async function seed() {
  console.log('Seeding stored functions...')

  for (const fn of storedFunctions) {
    const { id, ...data } = fn
    await db.collection('storedFunctions').doc(id).set({
      ...data,
      created: Date.now(),
      modified: Date.now(),
    })
    console.log(`  ✓ ${fn.name} (${fn.urlPattern})`)
  }

  console.log('Done!')
}

seed().catch(console.error)
