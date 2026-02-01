/**
 * RBAC Integration Tests
 *
 * Tests the full RBAC flow with memory store backend.
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { createMemoryStore } from '../store/memory'
import { createRBAC } from './index'

describe('RBAC with Memory Store', () => {
  let store: ReturnType<typeof createMemoryStore>
  let rbac: ReturnType<typeof createRBAC>

  beforeEach(async () => {
    store = createMemoryStore()
    rbac = createRBAC(store)
  })

  describe('Basic access rules', () => {
    test('denies access when no rule exists', async () => {
      const result = await rbac.check({
        method: 'read',
        collection: 'posts',
      })

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('No security rule')
    })

    test('allows all with "all" rule', async () => {
      await rbac.setRule('public', { read: 'all' })

      const result = await rbac.check({
        method: 'read',
        collection: 'public',
      })

      expect(result.allowed).toBe(true)
      expect(result.ruleType).toBe('shortcut')
    })

    test('denies all with "none" rule', async () => {
      await rbac.setRule('secret', { read: 'none' })

      const result = await rbac.check({
        uid: 'admin123',
        roles: ['admin'],
        method: 'read',
        collection: 'secret',
      })

      expect(result.allowed).toBe(false)
    })
  })

  describe('Authentication rules', () => {
    test('authenticated rule allows logged in users', async () => {
      await rbac.setRule('members', { read: 'authenticated' })

      const result = await rbac.check({
        uid: 'user123',
        method: 'read',
        collection: 'members',
      })

      expect(result.allowed).toBe(true)
    })

    test('authenticated rule denies anonymous users', async () => {
      await rbac.setRule('members', { read: 'authenticated' })

      const result = await rbac.check({
        uid: null,
        method: 'read',
        collection: 'members',
      })

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Authentication required')
    })
  })

  describe('Role-based rules', () => {
    test('admin rule allows admins', async () => {
      await rbac.setRule('adminOnly', { read: 'admin' })

      const result = await rbac.check({
        uid: 'admin1',
        roles: ['admin'],
        method: 'read',
        collection: 'adminOnly',
      })

      expect(result.allowed).toBe(true)
    })

    test('admin rule denies non-admins', async () => {
      await rbac.setRule('adminOnly', { read: 'admin' })

      const result = await rbac.check({
        uid: 'user1',
        roles: ['user'],
        method: 'read',
        collection: 'adminOnly',
      })

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Admin role required')
    })

    test('custom role rule works', async () => {
      await rbac.setRule('editorContent', { read: 'role:editor' })

      const allowed = await rbac.check({
        uid: 'user1',
        roles: ['editor'],
        method: 'read',
        collection: 'editorContent',
      })

      const denied = await rbac.check({
        uid: 'user2',
        roles: ['viewer'],
        method: 'read',
        collection: 'editorContent',
      })

      expect(allowed.allowed).toBe(true)
      expect(denied.allowed).toBe(false)
    })
  })

  describe('Owner-based rules', () => {
    test('owner rule allows document owner', async () => {
      await rbac.setRule('posts', { read: 'owner:authorId' })

      const result = await rbac.check({
        uid: 'user123',
        method: 'read',
        collection: 'posts',
        docId: 'post1',
        doc: { authorId: 'user123', title: 'My Post' },
      })

      expect(result.allowed).toBe(true)
    })

    test('owner rule denies non-owner', async () => {
      await rbac.setRule('posts', { read: 'owner:authorId' })

      const result = await rbac.check({
        uid: 'user456',
        method: 'read',
        collection: 'posts',
        docId: 'post1',
        doc: { authorId: 'user123', title: 'Their Post' },
      })

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Must be owner')
    })

    test('owner rule works for new documents', async () => {
      await rbac.setRule('posts', { create: 'owner:authorId' })

      const result = await rbac.check({
        uid: 'user123',
        method: 'write',
        collection: 'posts',
        doc: null, // new document
        newData: { authorId: 'user123', title: 'New Post' },
      })

      expect(result.allowed).toBe(true)
    })
  })

  describe('Method-specific rules', () => {
    test('different rules for read vs write', async () => {
      await rbac.setRule('articles', {
        read: 'all',
        write: 'authenticated',
      })

      const readAnon = await rbac.check({
        method: 'read',
        collection: 'articles',
      })

      const writeAnon = await rbac.check({
        method: 'write',
        collection: 'articles',
      })

      const writeAuth = await rbac.check({
        uid: 'user1',
        method: 'write',
        collection: 'articles',
        newData: { title: 'New' },
      })

      expect(readAnon.allowed).toBe(true)
      expect(writeAnon.allowed).toBe(false)
      expect(writeAuth.allowed).toBe(true)
    })

    test('create vs update rules', async () => {
      await rbac.setRule('posts', {
        create: 'authenticated',
        update: 'owner:authorId',
      })

      // Create - any authenticated user
      const create = await rbac.check({
        uid: 'newuser',
        method: 'write',
        collection: 'posts',
        doc: null,
        newData: { authorId: 'newuser', title: 'First Post' },
      })

      // Update - only owner
      const updateOwner = await rbac.check({
        uid: 'user123',
        method: 'write',
        collection: 'posts',
        doc: { authorId: 'user123' },
        newData: { title: 'Updated' },
      })

      const updateNonOwner = await rbac.check({
        uid: 'hacker',
        method: 'write',
        collection: 'posts',
        doc: { authorId: 'user123' },
        newData: { title: 'Hacked' },
      })

      expect(create.allowed).toBe(true)
      expect(updateOwner.allowed).toBe(true)
      expect(updateNonOwner.allowed).toBe(false)
    })
  })

  describe('Schema validation', () => {
    test('validates required fields', async () => {
      await rbac.setRule('posts', {
        write: 'authenticated',
        schema: {
          required: ['title', 'content'],
        },
      })

      const valid = await rbac.check({
        uid: 'user1',
        method: 'write',
        collection: 'posts',
        newData: { title: 'Hello', content: 'World' },
      })

      const invalid = await rbac.check({
        uid: 'user1',
        method: 'write',
        collection: 'posts',
        newData: { title: 'Hello' }, // missing content
      })

      expect(valid.allowed).toBe(true)
      expect(invalid.allowed).toBe(false)
      expect(invalid.reason).toContain('Missing required field')
    })

    test('validates field types', async () => {
      await rbac.setRule('posts', {
        write: 'authenticated',
        schema: {
          properties: {
            title: { type: 'string' },
            views: { type: 'number' },
          },
        },
      })

      const valid = await rbac.check({
        uid: 'user1',
        method: 'write',
        collection: 'posts',
        newData: { title: 'Hello', views: 100 },
      })

      const invalid = await rbac.check({
        uid: 'user1',
        method: 'write',
        collection: 'posts',
        newData: { title: 'Hello', views: 'many' }, // wrong type
      })

      expect(valid.allowed).toBe(true)
      expect(invalid.allowed).toBe(false)
      expect(invalid.reason).toContain('expected number')
    })
  })

  describe('User roles from store', () => {
    test('loads user roles', async () => {
      await store.set('users', 'user123', {
        email: 'user@example.com',
        roles: ['editor', 'author']
      })

      const roles = await rbac.loadUserRoles('user123')

      expect(roles).toEqual(['editor', 'author'])
    })

    test('returns empty array for missing user', async () => {
      const roles = await rbac.loadUserRoles('nonexistent')

      expect(roles).toEqual([])
    })
  })

  describe('Performance', () => {
    test('rule evaluation is fast', async () => {
      await rbac.setRule('posts', { read: 'authenticated' })

      const result = await rbac.check({
        uid: 'user1',
        method: 'read',
        collection: 'posts',
      })

      // Should be sub-millisecond for shortcut rules
      expect(result.evalTimeMs).toBeLessThan(5)
    })
  })
})
