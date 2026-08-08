import { DatabaseSync } from "node:sqlite";
import { getMigrationsPath } from "@shall/schema";
import { drizzle, type RemoteCallback } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";

export async function initializeProjectDatabase(
  databasePath: string,
): Promise<void> {
  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec("PRAGMA journal_mode = WAL;");
    const callback: RemoteCallback = async (sql, params, method) => {
      const statement = sqlite.prepare(sql);
      if (method === "values") {
        statement.setReturnArrays(true);
      }

      if (method === "run") {
        statement.run(...params);
        return { rows: [] };
      }

      if (method === "get") {
        const row = statement.get(...params);
        return { rows: row === undefined ? [] : [row] };
      }

      return { rows: statement.all(...params) };
    };

    const database = drizzle(callback);
    await migrate(
      database,
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
