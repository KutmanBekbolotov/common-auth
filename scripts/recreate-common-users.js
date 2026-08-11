const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const { Client } = require('pg');

const AUTH_DATABASE_URL =
  process.env.AUTH_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5433/common_auth';
const OUTPUT_PATH = process.argv[2];
const SALT_ROUNDS = Number(process.env.PASSWORD_SALT_ROUNDS ?? 12);

if (!OUTPUT_PATH) {
  throw new Error('Usage: node scripts/recreate-common-users.js <output.csv>');
}

function csv(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function password() {
  return crypto.randomBytes(12).toString('base64url');
}

async function main() {
  const client = new Client({ connectionString: AUTH_DATABASE_URL });
  await client.connect();
  const temporaryOutput = `${OUTPUT_PATH}.tmp`;

  try {
    await client.query('begin');
    const existing = await client.query(`
      select *
      from users
      where role = 'common'::"UserRole"
      order by username, email
      for update
    `);

    if (existing.rowCount !== 433) {
      throw new Error(`Expected 433 common users, found ${existing.rowCount}`);
    }

    const credentials = [];
    await client.query(`delete from users where role = 'common'::"UserRole"`);

    for (const user of existing.rows) {
      const employeeId = user.legacyFirebaseUid?.split(':').at(-1);
      if (!employeeId) {
        throw new Error(`Missing employee link for ${user.email}`);
      }

      const login = `common-${employeeId}@employee.local`;
      const plainPassword = password();
      const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);

      await client.query(
        `
          insert into users (
            id, email, "passwordHash", "refresh_token_hash", session_id,
            role, username, phone, pin, "orgId", "departmentId", position,
            "photoUrl", "legacyFirebaseUid", disabled, "createdAt", "updatedAt"
          ) values (
            $1, $2, $3, null, null,
            'common'::"UserRole", $4, $5, $6, $7, $8, $9,
            $10, $11, false, now(), now()
          )
        `,
        [
          crypto.randomUUID(),
          login,
          passwordHash,
          user.username,
          user.phone,
          user.pin,
          user.orgId,
          user.departmentId,
          user.position,
          user.photoUrl,
          user.legacyFirebaseUid,
        ],
      );

      credentials.push([
        user.departmentId,
        user.username,
        user.position,
        login,
        plainPassword,
      ]);
    }

    const lines = [
      ['Отдел', 'Сотрудник', 'Должность', 'Логин', 'Пароль'],
      ...credentials,
    ].map((row) => row.map(csv).join(','));
    fs.writeFileSync(temporaryOutput, `${lines.join('\n')}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });

    const verification = await client.query(`
      select
        count(*)::int as total,
        count(*) filter (where disabled)::int as disabled,
        count(*) filter (where "refresh_token_hash" is not null)::int as sessions
      from users
      where role = 'common'::"UserRole"
    `);
    if (verification.rows[0].total !== 433) {
      throw new Error('Replacement verification failed');
    }

    await client.query('commit');
    fs.renameSync(temporaryOutput, OUTPUT_PATH);
    fs.chmodSync(OUTPUT_PATH, 0o600);
    console.log(JSON.stringify(verification.rows[0]));
  } catch (error) {
    await client.query('rollback').catch(() => {});
    fs.rmSync(temporaryOutput, { force: true });
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
