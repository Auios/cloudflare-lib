// I generated this entire file with AI. I have no idea what's happening here.
// I didn't even need this but I just wanted a dummy test file to use in the future.
// The tests are passing but while this comment is here, ignore everything here.

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { Database, Stage } from '../src';
import { D1Database, D1PreparedStatement, D1Result, D1ExecResult, D1DatabaseSession } from '@cloudflare/workers-types';

// Mock D1Database
class MockD1Database implements D1Database {
  private data: Record<string, any[]> = {};
  private lastQuery: string = '';
  private lastParams: unknown[] = [];

  prepare(sql: string) {
    this.lastQuery = sql;
    const statement = {
      bind: (...params: unknown[]) => {
        this.lastParams = params;
        return statement;
      },
      first: async <T>() => {
        const results = this.getResults(sql);
        return results[0] || null;
      },
      run: async () => ({
        success: true as const,
        meta: {
          duration: 0,
          changes: 1,
          size_after: 0,
          rows_read: 0,
          rows_written: 1,
          last_row_id: 0,
          changed_db: false
        },
        results: []
      }),
      all: async <T>() => ({
        success: true as const,
        meta: {
          duration: 0,
          changes: 0,
          size_after: 0,
          rows_read: 0,
          rows_written: 0,
          last_row_id: 0,
          changed_db: false
        },
        results: this.getResults(sql)
      }),
      raw: async () => [[] as string[], ...this.getResults(sql)] as [string[], ...any[]]
    };
    return statement;
  }

  private getResults(sql: string): any[] {
    // Handle sequence query
    if (sql.includes('SQLITE_SEQUENCE')) {
      const tableName = this.lastParams[0] as string;
      const key = `SELECT seq FROM SQLITE_SEQUENCE WHERE name = '${tableName}'`;
      return this.data[key] || [];
    }

    // Handle SELECT queries
    if (sql.startsWith('SELECT')) {
      // Always use the base key for the table
      const table = sql.split('FROM')[1].split(/WHERE|LIMIT/)[0].trim();
      const key = `SELECT * FROM ${table}`;
      let results = this.data[key] || [];

      // Handle WHERE clause with parameter order
      if (sql.includes('WHERE')) {
        const whereClause = sql.split('WHERE')[1].split('LIMIT')[0].trim();
        const conditions = whereClause.split('AND').map(cond => cond.trim());
        let paramIdx = 0;
        results = results.filter((row: any) => {
          return conditions.every(condition => {
            const [column] = condition.split('=');
            const col = column.trim();
            const value = this.lastParams[paramIdx++];
            return row[col] === value;
          });
        });
      }
      // Only apply LIMIT after filtering (or if no WHERE, just slice)
      if (sql.includes('LIMIT')) {
        const limit = parseInt(sql.split('LIMIT')[1].trim());
        results = results.slice(0, limit);
      }
      return results;
    }

    // Handle INSERT queries with RETURNING
    if (sql.startsWith('INSERT') && sql.includes('RETURNING')) {
      const table = sql.split('INTO')[1].split('(')[0].trim();
      const columns = sql.split('(')[1].split(')')[0].split(',').map(c => c.trim());
      const values = this.lastParams.slice(0, columns.length);
      const newRow: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        // Try to parse JSON if possible
        try {
          newRow[col] = typeof values[i] === 'string' && values[i]?.startsWith('{') ? JSON.parse(values[i] as string) : values[i];
        } catch {
          newRow[col] = values[i];
        }
      });
      const key = `SELECT * FROM ${table}`;
      if (!this.data[key]) {
        this.data[key] = [];
      }
      this.data[key].push(newRow);
      return [newRow];
    }

    // Handle UPDATE queries with RETURNING
    if (sql.startsWith('UPDATE') && sql.includes('RETURNING')) {
      const table = sql.split(' ')[1];
      const setClause = sql.split('SET')[1].split('WHERE')[0].trim();
      const whereClause = sql.split('WHERE')[1].split('RETURNING')[0].trim();

      const setColumns = setClause.split(',').map(s => s.split('=')[0].trim());
      const setValues = this.lastParams.slice(0, setColumns.length);
      const whereColumns = whereClause.split('AND').map(w => w.split('=')[0].trim());
      const whereValues = this.lastParams.slice(setColumns.length);

      const key = `SELECT * FROM ${table}`;
      const rows = this.data[key] || [];

      const updatedRows = rows.map((row: any) => {
        const matchesWhere = whereColumns.every((col, i) => row[col] === whereValues[i]);
        if (matchesWhere) {
          return { ...row, ...Object.fromEntries(setColumns.map((col, i) => [col, setValues[i]])) };
        }
        return row;
      });

      this.data[key] = updatedRows;
      return updatedRows.filter((row: any) =>
        whereColumns.every((col, i) => row[col] === whereValues[i])
      );
    }

    return [];
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return Promise.resolve([]);
  }

  exec(query: string): Promise<D1ExecResult> {
    return Promise.resolve({
      success: true as const,
      meta: {
        duration: 0,
        changes: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false
      },
      results: [],
      count: 0,
      duration: 0
    });
  }

  withSession(constraintOrBookmark?: string): D1DatabaseSession {
    return {
      prepare: this.prepare.bind(this),
      batch: this.batch.bind(this),
      getBookmark: () => constraintOrBookmark || ''
    };
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }
}

describe('Database', () => {
  let db: Database;
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    db = new Database(mockD1);
    // Setup test data
    mockD1['data'] = {
      'SELECT seq FROM SQLITE_SEQUENCE WHERE name = \'test_table\'': [{ seq: 5 }],
      'SELECT * FROM test': [
        { id: 1, name: 'test1' },
        { id: 2, name: 'test2' }
      ]
    };
  });

  describe('getSequence', () => {
    it('should return sequence number for a table', async () => {
      const result = await db.getSequence('test_table');
      assert.strictEqual(result, 5);
    });

    it('should return null for non-existent table', async () => {
      const result = await db.getSequence('non_existent');
      assert.strictEqual(result, null);
    });
  });

  describe('run', () => {
    it('should execute SQL query with parameters', async () => {
      const result = await db.run('INSERT INTO test VALUES (?)', ['test']);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.meta.changes, 1);
    });
  });

  describe('all', () => {
    it('should return all results from query', async () => {
      const result = await db.all<{ id: number; name: string }>('SELECT * FROM test');
      assert.deepStrictEqual(result, [
        { id: 1, name: 'test1' },
        { id: 2, name: 'test2' }
      ]);
    });
  });

  describe('first', () => {
    it('should return first result from query', async () => {
      const result = await db.first<{ id: number; name: string }>('SELECT * FROM test');
      assert.deepStrictEqual(result, { id: 1, name: 'test1' });
    });
  });

  describe('fetch', () => {
    it('should fetch records with conditions', async () => {
      const result = await db.fetch<{ id: number; name: string }>(
        'test',
        { name: 'test1' },
        10
      );
      assert.deepStrictEqual(result, [{ id: 1, name: 'test1' }]);
    });

    it('should respect limit parameter', async () => {
      const result = await db.fetch<{ id: number; name: string }>(
        'test',
        undefined,
        1
      );
      assert.strictEqual(result?.length, 1);
    });
  });

  describe('insert', () => {
    it('should insert record and return inserted data', async () => {
      const data = { name: 'test3', value: 123 };
      const result = await db.insert<typeof data>('test', data);
      assert.deepStrictEqual(result, { name: 'test3', value: 123 });
    });

    it('should handle JSON data', async () => {
      const data = { name: 'test4', metadata: { key: 'value' } };
      const result = await db.insert<typeof data>('test', data);
      assert.deepStrictEqual(result, { name: 'test4', metadata: { key: 'value' } });
    });
  });

  describe('update', () => {
    it('should update records and return updated data', async () => {
      const data = { name: 'updated' };
      const conditions = { id: 1 };
      const result = await db.update<typeof data & typeof conditions>(
        'test',
        data,
        conditions
      );
      assert.deepStrictEqual(result, [{ id: 1, name: 'updated' }]);
    });

    it('should update multiple fields', async () => {
      const data = { name: 'updated', value: 456 };
      const conditions = { id: 1 };
      const result = await db.update<typeof data & typeof conditions>(
        'test',
        data,
        conditions
      );
      assert.deepStrictEqual(result, [{ id: 1, name: 'updated', value: 456 }]);
    });
  });
});

describe('Stage', () => {
  it('should have correct enum values', () => {
    assert.strictEqual(Stage.LOCAL, 'LOCAL');
    assert.strictEqual(Stage.PREVIEW, 'PREVIEW');
    assert.strictEqual(Stage.PRODUCTION, 'PRODUCTION');
  });
});
