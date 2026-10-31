// Reads a decrypted snapshot from stdin; never prints records or object names.
import { existsSync } from 'node:fs';
const installed = new URL('../tools/backup-validator/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url);
const cached = new URL('../.cache/sql-qa/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url);
const { PGlite } = await import((existsSync(installed) ? installed : cached).href);
globalThis.fetch = () => Promise.reject(new Error('network disabled during restore validation'));
let input = '';
for await (const chunk of process.stdin) input += chunk;
const backup = JSON.parse(input);
input = '';
if (backup.format !== 'labframe-backup-v2' || !backup.enums || !backup.schema_columns) {
  throw new Error('Snapshot lacks current schema metadata');
}
const ident = (x) => '"' + String(x).replaceAll('"', '""') + '"';
const literal = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const db = new PGlite();
let tables = 0;
let rows = 0;
try {
  for (const item of backup.enums) {
    await db.exec(
      `create type public.${ident(item.name)} as enum(${item.labels.map(literal).join(',')})`,
    );
  }
  const groups = Map.groupBy(backup.schema_columns, (c) => c.table);
  for (const [table, columns] of groups) {
    await db.exec(
      `create table public.${ident(table)} (${
        columns.map((c) => `${ident(c.name)} ${c.type}${c.notnull ? ' not null' : ''}`).join(',')
      })`,
    );
  }
  for (const [table, data] of Object.entries(backup.tables)) {
    if (!groups.has(table) || !Array.isArray(data) || data.length !== backup.counts[table]) {
      throw new Error('Snapshot table count mismatch');
    }
    // Explicitly typed populate_recordset preserves bigint, enums, arrays and timestamps.
    await db.query(
      `insert into public.${ident(table)} select * from jsonb_populate_recordset(null::public.${
        ident(table)
      },$1::jsonb)`,
      [JSON.stringify(data)],
    );
    const result = await db.query(`select count(*)::int as n from public.${ident(table)}`);
    if (result.rows[0].n !== data.length) throw new Error('Restored count mismatch');
    tables++;
    rows += data.length;
  }
  // Constraints are checked after the complete restore, including self references.
  const priority = { p: 0, u: 1, c: 2, x: 3, f: 4 };
  for (
    const constraint of [...backup.constraints ?? []].sort((a, b) =>
      (priority[a.type] ?? 9) - (priority[b.type] ?? 9)
    )
  ) {
    if (!['p', 'u', 'f', 'c', 'x'].includes(constraint.type)) continue;
    await db.exec(
      `alter table public.${ident(constraint.table)} add constraint ${
        ident(constraint.name)
      } ${constraint.definition}`,
    );
  }
  console.log(
    JSON.stringify({
      restoreValidation: 'passed',
      tables,
      rows,
      constraints: (backup.constraints ?? []).length,
      network: 'disabled',
      applicationStartupTested: false,
    }),
  );
} catch (error) {
  // Database errors can contain a failing row. Do not expose their message or detail.
  console.error(
    JSON.stringify({ restoreValidation: 'failed', code: error.code ?? 'validation_error' }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
