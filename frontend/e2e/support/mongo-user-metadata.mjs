// G4 only: node frontend/e2e/support/mongo-user-metadata.mjs --approved-metadata
// Requires per-run approval for the Mongo-container credential-scope exception.
// Credentials are referenced ONLY inside mongosh's existing container env;
// never returned, put in command arguments, read from .env, or logged.
// No user documents/password hashes are fetched; output is counts/index flags.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '')
const marker = 'QA_USER_METADATA:'
const script = String.raw`
try {
  if (!process.env.MONGO_INITDB_ROOT_USERNAME || !process.env.MONGO_INITDB_ROOT_PASSWORD) {
    print('QA_USER_METADATA:' + JSON.stringify({ failure: 'QA_CONTAINER_CREDENTIALS_MISSING' })); quit(1);
  }
  const admin = db.getSiblingDB('admin');
  const authenticated = admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD);
  if (!(authenticated === 1 || authenticated?.ok === 1)) {
    print('QA_USER_METADATA:' + JSON.stringify({ failure: 'QA_MONGO_AUTH_FAILED' })); quit(1);
  }
  const databases = admin.runCommand({ listDatabases: 1, nameOnly: true, authorizedDatabases: true });
  if (databases.ok !== 1) throw new Error();
  const candidates = databases.databases.filter(item => !['admin', 'config', 'local'].includes(item.name))
    .filter(item => {
      const collections = db.getSiblingDB(item.name).runCommand({ listCollections: 1, nameOnly: true,
        filter: { name: { $in: ['products', 'users'] } }, maxTimeMS: 3000 });
      if (collections.ok !== 1) throw new Error();
      const names = collections.cursor.firstBatch.map(collection => collection.name);
      return names.includes('products') && names.includes('users');
    });
  if (candidates.length !== 1) {
    print('QA_USER_METADATA:' + JSON.stringify({ failure: 'QA_APP_DATABASE_NOT_UNIQUE', candidates: candidates.length })); quit(1);
  }
  const application = db.getSiblingDB(candidates[0].name);
  const users = application.getCollection('users');
  const count = filter => users.countDocuments(filter, { maxTimeMS: 3000 });
  const duplicates = users.aggregate([
    { $group: { _id: '$username', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $count: 'groups' }
  ], { maxTimeMS: 3000 }).toArray();
  const uniqueIndex = users.getIndexes().some(index => index.unique === true
    && !index.sparse && !index.partialFilterExpression
    && Object.keys(index.key).length === 1 && index.key.username === 1);
  print('QA_USER_METADATA:' + JSON.stringify({ database: candidates[0].name,
    productsCount: application.getCollection('products').countDocuments({}, { maxTimeMS: 3000 }),
    usersCount: count({}), adminCount: count({ username: 'admin' }), userCount: count({ username: 'user' }),
    duplicateUsernameGroups: duplicates[0]?.groups || 0, uniqueUsernameIndex: uniqueIndex }));
} catch {
  print('QA_USER_METADATA:' + JSON.stringify({ failure: 'QA_MONGO_METADATA_OPERATION_FAILED' })); quit(1);
}`

try {
  if (!process.argv.includes('--approved-metadata')) throw new Error('QA_METADATA_APPROVAL_REQUIRED')
  const listed = await execute('docker', ['ps', '--filter', `label=com.docker.compose.project.working_dir=${root}`,
    '--filter', 'label=com.docker.compose.service=mongodb', '--format', '{{.ID}}'], { timeout: 10_000 })
  const ids = listed.stdout.trim().split('\n').filter(Boolean)
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) throw new Error('QA_CONTAINER_NOT_UNIQUE')
  let output
  try {
    output = (await execute('docker', ['exec', ids[0], 'mongosh', '--quiet', '--eval', script],
      { timeout: 30_000, maxBuffer: 32_768 })).stdout
  } catch (error) {
    // Ignore potentially sensitive CLI stderr; only parse our explicit marker.
    output = typeof error.stdout === 'string' ? error.stdout : ''
  }
  const line = output.split('\n').find(item => item.startsWith(marker))
  if (!line) throw new Error('QA_METADATA_RESULT_MISSING')
  const result = JSON.parse(line.slice(marker.length))
  if (result.failure) {
    const allowed = ['QA_CONTAINER_CREDENTIALS_MISSING', 'QA_MONGO_AUTH_FAILED',
      'QA_APP_DATABASE_NOT_UNIQUE', 'QA_MONGO_METADATA_OPERATION_FAILED']
    throw new Error(allowed.includes(result.failure) ? result.failure : 'QA_METADATA_RESULT_INVALID')
  }
  const keys = ['database', 'productsCount', 'usersCount', 'adminCount', 'userCount',
    'duplicateUsernameGroups', 'uniqueUsernameIndex']
  if (Object.keys(result).length !== keys.length || !keys.every(key => Object.hasOwn(result, key))
    || typeof result.database !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(result.database)
    || !keys.slice(1, -1).every(key => Number.isSafeInteger(result[key]) && result[key] >= 0)
    || typeof result.uniqueUsernameIndex !== 'boolean') throw new Error('QA_METADATA_RESULT_INVALID')
  console.log(JSON.stringify({ item: 'G4', ...result }))
} catch (error) {
  const allowed = new Set(['QA_METADATA_APPROVAL_REQUIRED', 'QA_CONTAINER_NOT_UNIQUE',
    'QA_METADATA_RESULT_MISSING', 'QA_METADATA_RESULT_INVALID', 'QA_CONTAINER_CREDENTIALS_MISSING',
    'QA_MONGO_AUTH_FAILED', 'QA_APP_DATABASE_NOT_UNIQUE', 'QA_MONGO_METADATA_OPERATION_FAILED'])
  console.log(JSON.stringify({ item: 'G4', failure: allowed.has(error.message) ? error.message : 'QA_METADATA_OPERATION_FAILED' }))
  process.exitCode = 1
}
