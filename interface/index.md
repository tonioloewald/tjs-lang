# Store Interface

Abstract storage interface that can be backed by Firestore, IndexedDB,
Postgres, filesystem, or any other storage backend.

This enables:
1. Testing RBAC logic without Firebase
2. Running locally with IndexedDB
3. Self-hosted deployments with Postgres/SQLite
4. "Directory full of crap" development mode
