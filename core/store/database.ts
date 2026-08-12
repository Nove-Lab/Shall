import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  drizzle,
  type RemoteCallback,
  type SqliteRemoteDatabase,
} from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";

export type ProjectDatabase = SqliteRemoteDatabase;

/**
 * The migrations are the schema's only source, so they stay beside the source
 * rather than being copied into the build — this resolves from `dist/store`.
 */
function getMigrationsPath(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../store/migrations",
  );
}

/**
 * drizzle's proxy driver reads rows by column position, so every read hands
 * back arrays. `get` is the odd one out — drizzle takes the `rows` array as
 * the row itself and cannot tell "no match" from "a row of nulls", so the
 * queries above this select with `all` and take the first element instead.
 */
function connect(sqlite: DatabaseSync): ProjectDatabase {
  const callback: RemoteCallback = async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (method === "run") {
      statement.run(...params);
      return { rows: [] };
    }

    statement.setReturnArrays(true);
    if (method === "get") {
      const row = statement.get(...params) as unknown[] | undefined;
      return { rows: row ?? [] };
    }

    return { rows: statement.all(...params) };
  };

  return drizzle(callback);
}

export async function initializeProjectDatabase(
  databasePath: string,
): Promise<void> {
  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec("PRAGMA journal_mode = WAL;");
    await migrate(
      connect(sqlite),
      async (queries) => {
        sqlite.exec("BEGIN");
        try {
          for (const query of queries) {
            sqlite.exec(query);
          }
          sqlite.exec("COMMIT");
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
      { migrationsFolder: getMigrationsPath() },
    );
  } finally {
    sqlite.close();
  }
}

/**
 * shall.db is git-ignored, so a project cloned from a repo arrives with a
 * project.json and no database at all. The first read of a project brings its
 * database up to date; the rest of the daemon run trusts it.
 *
 * What is remembered is the migration itself and not the fact that one
 * finished, so a caller that arrives while one is running joins it instead of
 * starting a second. Remembering only the finished fact let two reads of a
 * fresh project — the pair a screen makes when it asks for nodes and edges at
 * once — both find nothing recorded, both migrate, and the slower one fail on
 * a table the faster one had just created.
 */
const migrations = new Map<string, Promise<void>>();

/**
 * The database file is derived and git-ignored, so it can go away under a
 * running daemon — a `git clean`, a branch switch, someone clearing the cache.
 * node:sqlite would then quietly make an empty file with no tables in it, and
 * every later call for that project would fail on a missing table until the
 * daemon restarted. So the memo only counts while the file it was taken from is
 * still there, and a migration that fails is forgotten rather than remembered
 * as done, so the next caller retries it.
 */
async function migrateOnce(databasePath: string): Promise<void> {
  let pending = migrations.get(databasePath);
  if (!pending || !existsSync(databasePath)) {
    pending = initializeProjectDatabase(databasePath);
    migrations.set(databasePath, pending);
  }

  try {
    await pending;
  } catch (error) {
    if (migrations.get(databasePath) === pending) {
      migrations.delete(databasePath);
    }
    throw error;
  }
}

async function openAndRun<T>(
  databasePath: string,
  run: (database: ProjectDatabase) => Promise<T>,
): Promise<T> {
  await migrateOnce(databasePath);

  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec("PRAGMA journal_mode = WAL;");
    return await run(connect(sqlite));
  } finally {
    sqlite.close();
  }
}

/** The tail of the queue for each database, so the next call can join it. */
const queues = new Map<string, Promise<unknown>>();

/**
 * One call at a time per database, because a call is the unit of work and
 * sqlite gives its write lock to one connection at a time.
 *
 * A single statement never needed this: node:sqlite runs it synchronously, so
 * it is over before anything else can start. A transaction is a different
 * animal — the awaits between its statements are gaps another call would slip
 * into, and a second connection meeting the held lock does not wait its turn,
 * it fails on the spot with "database is locked". Queuing removes the gaps
 * rather than teaching every caller to retry, and it is what the architecture
 * already claims: the daemon is the single writer of this file.
 *
 * Nothing inside `run` may call back in here — the queue would be waiting on
 * itself. Store functions take the database they were handed instead.
 */
export async function withProjectDatabase<T>(
  databasePath: string,
  run: (database: ProjectDatabase) => Promise<T>,
): Promise<T> {
  const ahead = queues.get(databasePath) ?? Promise.resolve();
  // A call that failed is still a call that finished, so the queue moves on.
  const turn = ahead
    .catch(() => undefined)
    .then(() => openAndRun(databasePath, run));
  queues.set(databasePath, turn);
  return turn;
}
