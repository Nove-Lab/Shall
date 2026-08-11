import { DatabaseSync } from "node:sqlite";
import { getMigrationsPath } from "@shall/schema";
import {
  drizzle,
  type RemoteCallback,
  type SqliteRemoteDatabase,
} from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";

export type ProjectDatabase = SqliteRemoteDatabase;

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
 */
const migrated = new Set<string>();

export async function withProjectDatabase<T>(
  databasePath: string,
  run: (database: ProjectDatabase) => Promise<T>,
): Promise<T> {
  if (!migrated.has(databasePath)) {
    await initializeProjectDatabase(databasePath);
    migrated.add(databasePath);
  }

  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec("PRAGMA journal_mode = WAL;");
    return await run(connect(sqlite));
  } finally {
    sqlite.close();
  }
}
