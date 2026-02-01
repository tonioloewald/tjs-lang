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
 * Roles (available in rules as _roles, _isAdmin, _isAuthor):
 * - admin: full access to everything
 * - author: can create/edit own posts and assets
 * - (authenticated): can create/edit own comments
 */
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({ projectId: 'tjs-platform' })
const db = getFirestore()

// Security Rules - use _isAdmin, _isAuthor, _roles from context
const securityRules = [
  {
    collection: 'users',
    name: 'Users RBAC',
    description:
      'Users can read any profile, only edit their own. Admins can edit anyone.',
    code: `
      // Admins can do anything
      if (_isAdmin) return true

      // Anyone authenticated can read user profiles
      if (_method === 'read') return !!_uid

      // Must be logged in for write
      if (!_uid) return false

      // Users can only edit their own profile
      return _docId === _uid
    `,
    fuel: 50,
  },
  {
    collection: 'blog_posts',
    name: 'Blog Posts RBAC',
    description:
      'Authors can create/edit own posts. Admins can do anything. Anyone can read published.',
    code: `
      // Admins can do anything
      if (_isAdmin) return true

      // Read access
      if (_method === 'read') {
        // Published posts are public
        if (doc?.status === 'published') return true
        // Draft posts only visible to author
        if (!_uid) return false
        if (doc?.authorId === _uid) return true
        // For queries, allow authenticated users (filter in app)
        if (_isQuery) return !!_uid
        return false
      }

      // Must be logged in for write/delete
      if (!_uid) return false

      // Must be an author to create/edit posts
      if (!_isAuthor) {
        return { allow: false, reason: 'Must have author role to create/edit posts' }
      }

      // New post: must set self as author
      if (_method === 'write' && !doc) {
        if (newData?.authorId !== _uid) {
          return { allow: false, reason: 'Must set yourself as author' }
        }
        return true
      }

      // Edit/delete: must be own post
      if (doc?.authorId !== _uid) {
        return { allow: false, reason: 'Can only edit/delete your own posts' }
      }
      return true
    `,
    fuel: 80,
  },
  {
    collection: 'blog_comments',
    name: 'Blog Comments RBAC',
    description:
      'Authenticated users can create/edit own comments. Admins can do anything.',
    code: `
      // Admins can do anything
      if (_isAdmin) return true

      // Anyone can read comments
      if (_method === 'read') return true

      // Must be logged in for write/delete
      if (!_uid) return false

      // New comment: must set self as author and link to a post
      if (_method === 'write' && !doc) {
        if (!newData?.postId) {
          return { allow: false, reason: 'Comment must be linked to a post' }
        }
        if (newData?.authorId !== _uid) {
          return { allow: false, reason: 'Must set yourself as author' }
        }
        return true
      }

      // Edit/delete: must be own comment
      if (doc?.authorId !== _uid) {
        return { allow: false, reason: 'Can only edit/delete your own comments' }
      }
      return true
    `,
    fuel: 60,
  },
  {
    collection: 'blog_tags',
    name: 'Blog Tags RBAC',
    description:
      'Anyone can read tags. Only admins can write directly (normal tag sync via stored functions).',
    code: `
      // Anyone can read tags
      if (_method === 'read') return true

      // Only admins can write tags directly
      // (Normal flow: tags managed by sync-tags stored function)
      return _isAdmin
    `,
    fuel: 20,
  },
  {
    collection: 'blog_assets',
    name: 'Blog Assets RBAC',
    description:
      'Authors can upload assets with size limits. Admins can do anything.',
    code: `
      // Size limits (in bytes)
      const MAX_IMAGE_SIZE = 5 * 1024 * 1024   // 5MB
      const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB

      // Admins can do anything
      if (_isAdmin) return true

      // Anyone can read assets (they're public URLs anyway)
      if (_method === 'read') return true

      // Must be logged in for write/delete
      if (!_uid) return false

      // Must be an author to upload assets
      if (!_isAuthor) {
        return { allow: false, reason: 'Must have author role to upload assets' }
      }

      // New asset: check size limits and set self as author
      if (_method === 'write' && !doc) {
        if (newData?.authorId !== _uid) {
          return { allow: false, reason: 'Must set yourself as author' }
        }

        const size = newData?.size || 0
        const type = newData?.type || ''

        if (type.startsWith('image/') && size > MAX_IMAGE_SIZE) {
          return { allow: false, reason: 'Image exceeds 5MB limit' }
        }
        if (type.startsWith('video/') && size > MAX_VIDEO_SIZE) {
          return { allow: false, reason: 'Video exceeds 100MB limit' }
        }

        return true
      }

      // Replace: must be author of existing asset, check size
      if (_method === 'write' && doc) {
        if (doc.authorId !== _uid) {
          return { allow: false, reason: 'Can only replace your own assets' }
        }

        const size = newData?.size || 0
        const type = newData?.type || doc.type

        if (type.startsWith('image/') && size > MAX_IMAGE_SIZE) {
          return { allow: false, reason: 'Image exceeds 5MB limit' }
        }
        if (type.startsWith('video/') && size > MAX_VIDEO_SIZE) {
          return { allow: false, reason: 'Video exceeds 100MB limit' }
        }

        return true
      }

      // Delete: must be author
      if (doc?.authorId !== _uid) {
        return { allow: false, reason: 'Can only delete your own assets' }
      }
      return true
    `,
    fuel: 80,
  },
]

// Stored functions for blog functionality
const storedFunctions = [
  {
    id: 'sync-tags',
    name: 'Sync Post Tags',
    urlPattern: '/_internal/sync-tags',
    contentType: 'application/json',
    public: false, // Requires auth
    description:
      'Syncs tags when a post is created/updated. Creates missing tags, updates counts.',
    code: `
      // Called after a post is saved with: { postId, oldTags, newTags }
      const { postId, oldTags = [], newTags = [] } = args

      if (!postId) return { error: 'postId required' }

      const results = { created: [], updated: [], removed: [] }

      // Tags to add (in newTags but not oldTags)
      const tagsToAdd = newTags.filter(t => !oldTags.includes(t))

      // Tags to remove (in oldTags but not newTags)
      const tagsToRemove = oldTags.filter(t => !newTags.includes(t))

      // Process additions
      for (const tagName of tagsToAdd) {
        const existing = await store.get('blog_tags', tagName)

        if (existing?.error || !existing) {
          // Create new tag
          await store.set('blog_tags', tagName, {
            name: tagName,
            postIds: [postId],
            count: 1,
            created: Date.now()
          })
          results.created.push(tagName)
        } else {
          // Add post to existing tag
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

      // Process removals
      for (const tagName of tagsToRemove) {
        const existing = await store.get('blog_tags', tagName)

        if (existing && !existing.error) {
          const postIds = (existing.postIds || []).filter(id => id !== postId)

          if (postIds.length === 0) {
            // Delete tag if no more posts
            await store.delete('blog_tags', tagName)
            results.removed.push(tagName)
          } else {
            // Update tag
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
    description: 'List published blog posts',
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
    description: 'Get a single blog post by ID',
    code: `
      const post = await store.get('blog_posts', id)

      if (post?.error) return { error: post.error }
      if (!post) return { error: 'Post not found' }

      // Only return published posts (drafts require auth check elsewhere)
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
    description: 'List all blog tags with counts',
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
    description: 'List comments for a post',
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
  console.log('Seeding blog security rules...')

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

  console.log('\nSeeding blog stored functions...')

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

  console.log('\nDone!')
  console.log('\nTo test the API endpoints:')
  console.log('  curl https://page-ldh7npl2bq-uc.a.run.app/api/blog/posts')
  console.log('  curl https://page-ldh7npl2bq-uc.a.run.app/api/blog/tags')
}

seed().catch(console.error)
