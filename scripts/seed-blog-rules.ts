#!/usr/bin/env bun
/**
 * Seed blog security rules and stored functions into Firestore
 *
 * Collections:
 * - blog_posts: authorId, title, content, tags[], status, created, modified
 * - blog_comments: authorId, postId, content, created, modified
 * - blog_tags: name, postIds[], count
 * - blog_assets: authorId, type, size, url, postId?, created
 * - users: email, displayName, roles[], created
 *
 * Meta-collections (protected):
 * - securityRules: the rules themselves
 * - storedFunctions: the stored functions
 *
 * Roles (available in rules as _roles, _isAdmin, _isAuthor):
 * - admin: full access to everything
 * - author: can create/edit own posts and assets
 * - (authenticated): can create/edit own comments
 */
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({ projectId: 'tjs-platform' })
const db = getFirestore()

// Security Rules - using shortcuts where possible, AJS for complex cases
const securityRules = [
  // ===========================================
  // META-RULES: Protect the rules themselves
  // ===========================================
  {
    collection: 'securityRules',
    name: 'Security Rules (Meta)',
    description:
      'Admins can read/write rules, except for meta-rules which are immutable',
    // Anyone can read rules (needed for caching)
    read: 'all',
    // Only admins can write, and meta-rules are protected
    code: `
      // Only admins can modify rules
      if (!_isAdmin) {
        return { allow: false, reason: 'Admin role required to modify security rules' }
      }

      // Protect the meta-rules (securityRules and storedFunctions rules)
      const protectedCollections = ['securityRules', 'storedFunctions']
      if (protectedCollections.includes(_docId)) {
        return { allow: false, reason: 'Cannot modify meta-rules via API' }
      }

      return true
    `,
    fuel: 30,
  },
  {
    collection: 'storedFunctions',
    name: 'Stored Functions (Meta)',
    description:
      'Admins can read/write functions, internal functions are protected',
    read: 'all',
    code: `
      // Only admins can modify stored functions
      if (!_isAdmin) {
        return { allow: false, reason: 'Admin role required to modify stored functions' }
      }

      // Protect internal functions (start with _)
      if (_docId?.startsWith('_')) {
        return { allow: false, reason: 'Cannot modify internal functions via API' }
      }

      return true
    `,
    fuel: 30,
  },

  // ===========================================
  // USER RULES
  // ===========================================
  {
    collection: 'users',
    name: 'Users',
    description:
      'Users can read any profile, edit own. Admins can edit anyone.',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        displayName: { type: 'string', maxLength: 100 },
        roles: { type: 'array', items: { type: 'string' } },
        photoURL: { type: 'string' },
      },
    },
    read: 'authenticated',
    // Complex write logic: own profile or admin
    code: `
      if (_isAdmin) return true
      if (_docId === _uid) return true
      return { allow: false, reason: 'Can only edit your own profile' }
    `,
    fuel: 20,
  },

  // ===========================================
  // BLOG RULES - using shortcuts where possible
  // ===========================================
  {
    collection: 'blog_posts',
    name: 'Blog Posts',
    description: 'Authors can create/edit own posts. Admins can do anything.',
    schema: {
      type: 'object',
      required: ['authorId', 'title', 'status'],
      properties: {
        authorId: { type: 'string' },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string' },
        status: { enum: ['draft', 'published'] },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      },
    },
    // Automatic index management
    indexes: [
      // Published posts index - for public listing
      {
        name: 'published',
        filter: { status: 'published' },
        fields: ['title', 'authorId', 'tags', 'created'],
      },
      // Drafts index - for author dashboard
      {
        name: 'drafts',
        filter: { status: 'draft' },
        fields: ['title', 'authorId', 'created', 'modified'],
      },
      // Posts by author - partitioned for quick lookup
      {
        name: 'by-author',
        partitionBy: 'authorId',
        fields: ['title', 'status', 'created'],
      },
      // Posts by tag - partitioned by each tag for tag pages
      {
        name: 'by-tag',
        partitionByArray: 'tags',
        filter: { status: 'published' },
        fields: ['title', 'authorId', 'created'],
      },
    ],
    // Read: complex logic (published = public, drafts = author only)
    read: {
      code: `
        // Published posts are public
        if (doc?.status === 'published') return true
        // Drafts: must be author or admin
        if (!_uid) return false
        if (_isAdmin) return true
        if (doc?.authorId === _uid) return true
        // Queries: allow authenticated (app filters results)
        if (_isQuery) return !!_uid
        return false
      `,
      fuel: 30,
    },
    // Create: must be author role, set self as author
    create: {
      code: `
        if (_isAdmin) return true
        if (!_isAuthor) return { allow: false, reason: 'Author role required' }
        if (newData?.authorId !== _uid) return { allow: false, reason: 'Must set yourself as author' }
        return true
      `,
      fuel: 20,
    },
    // Update: must be author of post or admin
    update: {
      code: `
        if (_isAdmin) return true
        if (doc?.authorId !== _uid) return { allow: false, reason: 'Can only edit your own posts' }
        // Can't change authorId
        if (newData?.authorId && newData.authorId !== doc.authorId) {
          return { allow: false, reason: 'Cannot change post author' }
        }
        return true
      `,
      fuel: 25,
    },
    // Delete: same as update
    delete: 'owner:authorId',
  },
  {
    collection: 'blog_comments',
    name: 'Blog Comments',
    description: 'Anyone can read, authenticated users manage own comments.',
    schema: {
      type: 'object',
      required: ['authorId', 'postId', 'content'],
      properties: {
        authorId: { type: 'string' },
        postId: { type: 'string' },
        content: { type: 'string', minLength: 1, maxLength: 2000 },
      },
    },
    // Automatic index management
    indexes: [
      // Comments by post - for displaying on post pages
      {
        name: 'by-post',
        partitionBy: 'postId',
        fields: ['authorId', 'content', 'created'],
      },
      // Comments by author - for user profile
      {
        name: 'by-author',
        partitionBy: 'authorId',
        fields: ['postId', 'content', 'created'],
      },
    ],
    read: 'all',
    create: {
      code: `
        if (newData?.authorId !== _uid) return { allow: false, reason: 'Must set yourself as author' }
        if (!newData?.postId) return { allow: false, reason: 'Must link to a post' }
        return true
      `,
      fuel: 15,
    },
    update: 'owner:authorId',
    delete: 'owner:authorId',
  },
  {
    collection: 'blog_tags',
    name: 'Blog Tags',
    description: 'Anyone can read. Only admins can write directly.',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 50 },
        postIds: { type: 'array', items: { type: 'string' } },
        count: { type: 'number', minimum: 0 },
      },
    },
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
  },
  {
    collection: 'blog_assets',
    name: 'Blog Assets',
    description: 'Authors can upload with size limits. Anyone can read.',
    schema: {
      type: 'object',
      required: ['authorId', 'type', 'size'],
      properties: {
        authorId: { type: 'string' },
        type: { type: 'string' },
        size: { type: 'number', minimum: 0 },
        url: { type: 'string' },
        postId: { type: 'string' },
      },
    },
    // Automatic index management
    indexes: [
      // Assets by author - for asset library
      {
        name: 'by-author',
        partitionBy: 'authorId',
        fields: ['type', 'size', 'url', 'postId', 'created'],
      },
      // Assets by post - for post media management
      {
        name: 'by-post',
        partitionBy: 'postId',
        fields: ['authorId', 'type', 'size', 'url', 'created'],
      },
    ],
    read: 'all',
    create: {
      code: `
        const MAX_IMAGE = 5 * 1024 * 1024   // 5MB
        const MAX_VIDEO = 100 * 1024 * 1024 // 100MB

        if (!_isAuthor && !_isAdmin) return { allow: false, reason: 'Author role required' }
        if (newData?.authorId !== _uid) return { allow: false, reason: 'Must set yourself as author' }

        const size = newData?.size || 0
        const type = newData?.type || ''

        if (type.startsWith('image/') && size > MAX_IMAGE) {
          return { allow: false, reason: 'Image exceeds 5MB limit' }
        }
        if (type.startsWith('video/') && size > MAX_VIDEO) {
          return { allow: false, reason: 'Video exceeds 100MB limit' }
        }
        return true
      `,
      fuel: 30,
    },
    update: {
      code: `
        const MAX_IMAGE = 5 * 1024 * 1024
        const MAX_VIDEO = 100 * 1024 * 1024

        if (_isAdmin) return true
        if (doc?.authorId !== _uid) return { allow: false, reason: 'Can only update your own assets' }

        const size = newData?.size || doc.size
        const type = newData?.type || doc.type

        if (type.startsWith('image/') && size > MAX_IMAGE) {
          return { allow: false, reason: 'Image exceeds 5MB limit' }
        }
        if (type.startsWith('video/') && size > MAX_VIDEO) {
          return { allow: false, reason: 'Video exceeds 100MB limit' }
        }
        return true
      `,
      fuel: 30,
    },
    delete: 'owner:authorId',
  },
]

// Stored functions for blog functionality
const storedFunctions = [
  {
    id: 'sync-tags',
    name: 'Sync Post Tags',
    urlPattern: '/_internal/sync-tags',
    contentType: 'application/json',
    public: false,
    description: 'Syncs tags when a post is created/updated.',
    code: `
      const { postId, oldTags = [], newTags = [] } = args

      if (!postId) return { error: 'postId required' }

      const results = { created: [], updated: [], removed: [] }

      const tagsToAdd = newTags.filter(t => !oldTags.includes(t))
      const tagsToRemove = oldTags.filter(t => !newTags.includes(t))

      for (const tagName of tagsToAdd) {
        const existing = await store.get('blog_tags', tagName)

        if (existing?.error || !existing) {
          await store.set('blog_tags', tagName, {
            name: tagName,
            postIds: [postId],
            count: 1,
            created: Date.now()
          })
          results.created.push(tagName)
        } else {
          const postIds = existing.postIds || []
          if (!postIds.includes(postId)) {
            postIds.push(postId)
            await store.set('blog_tags', tagName, {
              ...existing,
              postIds,
              count: postIds.length,
              modified: Date.now()
            })
            results.updated.push(tagName)
          }
        }
      }

      for (const tagName of tagsToRemove) {
        const existing = await store.get('blog_tags', tagName)

        if (existing && !existing.error) {
          const postIds = (existing.postIds || []).filter(id => id !== postId)

          if (postIds.length === 0) {
            await store.delete('blog_tags', tagName)
            results.removed.push(tagName)
          } else {
            await store.set('blog_tags', tagName, {
              ...existing,
              postIds,
              count: postIds.length,
              modified: Date.now()
            })
            results.updated.push(tagName)
          }
        }
      }

      return results
    `,
    fuel: 500,
    timeoutMs: 10000,
  },
  {
    id: 'blog-api-posts',
    name: 'Blog Posts API',
    urlPattern: '/api/blog/posts',
    contentType: 'application/json',
    public: true,
    code: `
      const posts = await store.query('blog_posts', {
        where: [['status', '==', 'published']],
        orderBy: 'created',
        orderDirection: 'desc',
        limit: 20
      })

      if (posts?.error) return { error: posts.error }
      return { posts }
    `,
    fuel: 200,
  },
  {
    id: 'blog-api-post',
    name: 'Blog Post by ID',
    urlPattern: '/api/blog/posts/:id',
    contentType: 'application/json',
    public: true,
    code: `
      const post = await store.get('blog_posts', id)

      if (post?.error) return { error: post.error }
      if (!post) return { error: 'Post not found' }

      if (post.status !== 'published' && !_uid) {
        return { error: 'Post not found' }
      }

      return { post }
    `,
    fuel: 100,
  },
  {
    id: 'blog-api-tags',
    name: 'Blog Tags API',
    urlPattern: '/api/blog/tags',
    contentType: 'application/json',
    public: true,
    code: `
      const tags = await store.query('blog_tags', {
        orderBy: 'count',
        orderDirection: 'desc',
        limit: 50
      })

      if (tags?.error) return { error: tags.error }
      return { tags }
    `,
    fuel: 100,
  },
  {
    id: 'blog-api-comments',
    name: 'Blog Comments API',
    urlPattern: '/api/blog/posts/:postId/comments',
    contentType: 'application/json',
    public: true,
    code: `
      const comments = await store.query('blog_comments', {
        where: [['postId', '==', postId]],
        orderBy: 'created',
        orderDirection: 'asc',
        limit: 100
      })

      if (comments?.error) return { error: comments.error }
      return { comments }
    `,
    fuel: 150,
  },
]

async function seed() {
  console.log('Seeding security rules...')
  console.log('  (Meta-rules first - these protect themselves)\n')

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
    const ruleType =
      collection.startsWith('security') || collection.startsWith('stored')
        ? '🔒'
        : '📄'
    console.log(`  ${ruleType} ${rule.name} (${collection})`)
  }

  console.log('\nSeeding stored functions...')

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

  console.log('\n✅ Done!')
  console.log('\nAPI endpoints:')
  console.log('  curl https://page-ldh7npl2bq-uc.a.run.app/api/blog/posts')
  console.log('  curl https://page-ldh7npl2bq-uc.a.run.app/api/blog/tags')
}

seed().catch(console.error)
