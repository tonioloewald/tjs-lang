#!/usr/bin/env bun
/**
 * Seed test stored functions and security rules into Firestore
 */
import { initializeApp } from 'firebase-admin/app'
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

// Sample security rules
const securityRules = [
  {
    // Public posts - anyone can read, only author can write/delete
    collection: 'posts',
    name: 'Posts RBAC',
    description: 'Anyone can read, only author can write/delete',
    code: `
      // Anyone can read
      if (_method === 'read') return true

      // Must be logged in for write/delete
      if (!_uid) return false

      // New posts: set authorId to current user
      if (_method === 'write' && !doc) {
        return newData.authorId === _uid
      }

      // Existing posts: only author can modify
      return doc.authorId === _uid
    `,
    fuel: 50,
  },
  {
    // Private notes - only owner can access
    collection: 'notes',
    name: 'Notes RBAC',
    description: 'Only owner can read/write/delete',
    code: `
      // Must be logged in
      if (!_uid) return false

      // New notes: owner must be current user
      if (_method === 'write' && !doc) {
        return newData.ownerId === _uid
      }

      // Existing notes: only owner can access
      return doc && doc.ownerId === _uid
    `,
    fuel: 50,
  },
  {
    // Public read, admin write
    collection: 'config',
    name: 'Config RBAC',
    description: 'Anyone can read, admin-only write',
    code: `
      // Anyone can read config
      if (_method === 'read') return true

      // Only specific admins can write
      const admins = ['admin-uid-1', 'admin-uid-2']
      return admins.includes(_uid)
    `,
    fuel: 30,
  },
]

async function seed() {
  console.log('Seeding stored functions...')

  for (const fn of storedFunctions) {
    const { id, ...data } = fn
    await db
      .collection('storedFunctions')
      .doc(id)
      .set({
        ...data,
        created: Date.now(),
        modified: Date.now(),
      })
    console.log(`  ✓ ${fn.name} (${fn.urlPattern})`)
  }

  console.log('\nSeeding security rules...')

  for (const rule of securityRules) {
    const { collection, ...data } = rule
    await db
      .collection('securityRules')
      .doc(collection)
      .set({
        ...data,
        created: Date.now(),
        modified: Date.now(),
      })
    console.log(`  ✓ ${rule.name} (${collection})`)
  }

  console.log('\nDone!')
}

seed().catch(console.error)
