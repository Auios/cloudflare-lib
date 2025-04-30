import { D1Database, D1Response } from "@cloudflare/workers-types";

class Database {
  d1: D1Database;

  constructor(d1: D1Database) {
    this.d1 = d1;
  }

  async getSequence(table: string): Promise<number | null> {
    const sql = "SELECT seq FROM SQLITE_SEQUENCE WHERE name = ?";
    const result = await this.first<{ seq: number }>(sql, [table]);
    return result ? result.seq : null;
  }

  async run(sql: string, params: unknown[] = []): Promise<D1Response> {
    return await this.d1
      .prepare(sql)
      .bind(...params)
      .run();
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (
      (
        await this.d1
          .prepare(sql)
          .bind(...params)
          .all<T>()
      ).results || []
    );
  }

  async first<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return await this.d1
      .prepare(sql)
      .bind(...params)
      .first<T>();
  }

  async fetch<T>(
    table: string,
    conditions?: Partial<T>,
    limit?: number,
  ): Promise<T[] | null> {
    let whereClause = "";
    let values: unknown[] = [];

    if (conditions && Object.keys(conditions).length > 0) {
      const columns = Object.keys(conditions);
      values = Object.values(conditions);
      whereClause = ` WHERE ${
        columns.map((column) => `${column} = ?`).join(" AND ")
      }`;
    }

    const limitClause = limit ? ` LIMIT ${limit}` : "";
    const sql = /*sql*/ `SELECT * FROM ${table}${whereClause}${limitClause}`;
    return await this.all<T>(sql, values);
  }

  async insert<T>(table: string, data: Partial<T>): Promise<T | null> {
    const columns = Object.keys(data);
    const values = Object.values(data).map((value) =>
      typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : value
    );
    const placeholders = columns.map(() => "?").join(", ");
    const sql = /*sql*/ `INSERT INTO ${table} (${
      columns.join(", ")
    }) VALUES (${placeholders}) RETURNING *`;
    return await this.first<T>(sql, values);
  }

  async update<T>(
    table: string,
    data: Partial<T>,
    conditions: Partial<T>,
  ): Promise<T[]> {
    const setColumns = Object.keys(data);
    const setValues = Object.values(data);
    const setClause = setColumns.map((column) => `${column} = ?`).join(", ");

    const conditionColumns = Object.keys(conditions);
    const conditionValues = Object.values(conditions);
    const whereClause = conditionColumns.map((column) => `${column} = ?`).join(
      " AND ",
    );

    const sql =
      `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
    const params = [...setValues, ...conditionValues];

    return await this.all<T>(sql, params);
  }
}

export default Database;
