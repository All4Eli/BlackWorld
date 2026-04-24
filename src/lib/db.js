import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/blackworld';

const pool = new Pool({
  connectionString,
  // Production pool config
  max: 20,                         // max simultaneous connections
  idleTimeoutMillis: 30000,        // close idle clients after 30s
  connectionTimeoutMillis: 5000,   // fail fast if can't connect in 5s
  statement_timeout: 10000,        // kill queries running > 10s
  query_timeout: 10000,            // client-side query timeout
});

// Serialize values for pg — JSONB columns need objects stringified
function serializeValue(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
    return JSON.stringify(val);
  }
  return val;
}

export class SupabaseQueryBuilder {
  constructor(table) {
    this.table = table;
    this.queryType = 'select';
    this.selectFields = '*';
    this.conditions = [];
    this.limitVal = null;
    this.orderVal = null;
    this.isSingle = false;
    this.updateData = null;
    this.insertData = null;
  }

  select(fields = '*') {
    // If called after update/insert, don't reset the query type
    // This mimics Supabase's .update({}).select() pattern
    if (this.queryType !== 'update' && this.queryType !== 'insert') {
      this.queryType = 'select';
    }
    this.selectFields = fields;
    return this;
  }

  update(data) {
    this.queryType = 'update';
    this.updateData = data;
    return this;
  }

  insert(data) {
    this.queryType = 'insert';
    this.insertData = data;
    return this;
  }

  delete() {
    this.queryType = 'delete';
    return this;
  }

  eq(column, value) {
    this.conditions.push({ type: 'eq', column, value });
    return this;
  }

  in(column, values) {
      this.conditions.push({ type: 'in', column, value: values });
      return this;
  }

  order(column, options = { ascending: true }) {
      this.orderVal = { column, ascending: options.ascending };
      return this;
  }

  limit(count) {
    this.limitVal = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async then(resolve, reject) {
    try {
      const result = await this.execute();
      resolve(result);
    } catch (error) {
      if (reject) reject(error);
      else throw error;
    }
  }

  async execute() {
    let sql = '';
    const values = [];
    let paramIndex = 1;

    try {
      if (this.queryType === 'select') {
        sql = `SELECT ${this.selectFields} FROM ${this.table}`;
      } else if (this.queryType === 'update') {
        const keys = Object.keys(this.updateData);
        if (keys.length === 0) return { data: null, error: null };
        const setClauses = keys.map(k => {
          values.push(serializeValue(this.updateData[k]));
          return `"${k}" = $${paramIndex++}`;
        });
        sql = `UPDATE ${this.table} SET ${setClauses.join(', ')}`;
      } else if (this.queryType === 'insert') {
          // Handle single object or array of objects
          const isArray = Array.isArray(this.insertData);
          const records = isArray ? this.insertData : [this.insertData];
          if (records.length === 0) return { data: null, error: null };

          const keys = Object.keys(records[0]);
          const keyString = keys.map(k => `"${k}"`).join(', ');

          const valueStrings = records.map(record => {
              const rowValues = keys.map(k => {
                 values.push(serializeValue(record[k]));
                 return `$${paramIndex++}`;
              });
              return `(${rowValues.join(', ')})`;
          });

          sql = `INSERT INTO ${this.table} (${keyString}) VALUES ${valueStrings.join(', ')} RETURNING *`;
      } else if (this.queryType === 'delete') {
          sql = `DELETE FROM ${this.table}`;
      }

      if (this.conditions.length > 0) {
        const whereClauses = this.conditions.map(cond => {
          if (cond.type === 'eq') {
              if (cond.column.includes('->>')) {
                  // JSONB extraction handling e.g. hero_data->>gold
                  const parts = cond.column.split('->>');
                  values.push(cond.value);
                  return `"${parts[0]}"->>'${parts[1]}' = $${paramIndex++}`;
              }
              values.push(cond.value);
              return `"${cond.column}" = $${paramIndex++}`;
          } else if (cond.type === 'in') {
              const placeholders = cond.value.map(() => `$${paramIndex++}`);
              values.push(...cond.value);
              return `"${cond.column}" IN (${placeholders.join(', ')})`;
          }
          return '';
        });
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      if (this.queryType === 'update') {
          sql += ` RETURNING *`; // ensure we return updated data
      }

      if (this.orderVal && this.queryType === 'select') {
          sql += ` ORDER BY "${this.orderVal.column}" ${this.orderVal.ascending ? 'ASC' : 'DESC'}`;
      }

      if (this.limitVal !== null && this.queryType === 'select') {
        sql += ` LIMIT ${this.limitVal}`;
      }

      // We need client to simulate the count property check some APIs use (e.g. for concurrency)
      const res = await pool.query(sql, values);
      
      let data = res.rows;
      if (this.isSingle) {
        if (data.length === 0) return { data: null, error: new Error('Row not found') };
        data = data[0];
      }

      return { data, count: res.rowCount, error: null };

    } catch (err) {
      console.error('[DB WRAPPER ERROR]:', err);
      return { data: null, count: 0, error: err };
    }
  }
}

export const supabase = {
  from: (table) => new SupabaseQueryBuilder(table),
  rpc: async (fnName, params) => {
      // Very basic local RPC mapping mock. Real RPCs should be implemented native if possible
      console.warn(`[Supabase RPC called locally]: ${fnName}`);
      return { data: null, error: null };
  }
};
