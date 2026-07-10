const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Client } = require('pg');

const EMPLOYEE_DATABASE_URL =
  process.env.EMPLOYEE_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/employee';
const AUTH_DATABASE_URL =
  process.env.AUTH_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/common_auth?schema=public';

const GENERATED_EMAIL_DOMAIN =
  process.env.EMPLOYEE_IMPORT_EMAIL_DOMAIN ?? 'employee.local';
const LEGACY_UID_PREFIX =
  process.env.EMPLOYEE_IMPORT_UID_PREFIX ?? 'employee-directory';
const DEFAULT_PASSWORD = process.env.EMPLOYEE_IMPORT_DEFAULT_PASSWORD;
const SALT_ROUNDS = Number(process.env.PASSWORD_SALT_ROUNDS ?? 12);
const DRY_RUN = process.argv.includes('--dry-run');

const CENTRAL_DEPARTMENTS = new Set([
  'Административно-хозяйственный сектор',
  'Отдел внутреннего контроля',
  'Отдел внутреннего контроля, противодействия коррупции',
  'Отдел выездной регистрации',
  'Отдел государственных номерных знаков',
  'Отдел документационного обеспечения',
  'Отдел лицензирования',
  'Отдел правового обеспечения и международного сотрудничества',
  'Отдел регистрации водительского состава',
  'Отдел регистрации транспортных средств',
  'Отдел технической поддержки',
  'Отдел управления человеческими ресурсами',
  'Руководящий отдел',
  'Сектор государственных закупок',
  'Сектор мониторинга',
  'Сектор организационной работы',
  'Сектор по связям с общественностью',
  'Сектор экономического планирования',
  'Финансовый отдел',
]);

const REGION_PATTERNS = [
  {
    region: 'Bishkek',
    patterns: [/бишкек/i, /биримдик/i, /восточ/i, /северн/i, /межрегион/i],
  },
  {
    region: 'Chuy',
    patterns: [
      /аламудун/i,
      /иссык[- ]?ат/i,
      /ысык[- ]?ат/i,
      /ч[уү]й[- ]?кемин/i,
      /сокулук/i,
      /москов/i,
      /жайыл/i,
      /панфил/i,
      /таш[- ]?доб/i,
    ],
  },
  {
    region: 'Talas',
    patterns: [/талас/i, /кара[- ]?буура/i],
  },
  {
    region: 'Naryn',
    patterns: [/нарын/i, /жумгал/i, /кочкор/i],
  },
  {
    region: 'Issyk-Kul',
    patterns: [/балыкч/i, /каракол/i, /чолпон/i, /тон/i],
  },
  {
    region: 'Osh',
    patterns: [/ош/i, /алай/i, /кара[- ]?су/i, /ноокат/i, /узген/i],
  },
  {
    region: 'Batken',
    patterns: [/баткен/i, /кадамжай/i, /кызыл[- ]?кий/i, /сул[юү]кт/i],
  },
  {
    region: 'Manas',
    patterns: [
      /джалал[- ]?абад/i,
      /акс/i,
      /базар[- ]?коргон/i,
      /кара[- ]?к[уү]л/i,
      /ноокен/i,
      /токтогул/i,
      /таш[- ]?комур/i,
      /ала[- ]?бу/i,
    ],
  },
];

function clean(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function cleanDepartment(value) {
  const department = clean(value);
  return department && department !== '-' ? department : null;
}

function fullName(employee) {
  return clean(
    [employee.last_name, employee.first_name, employee.middle_name]
      .map(clean)
      .filter(Boolean)
      .join(' '),
  );
}

function inferRegion(department) {
  if (!department) {
    return null;
  }

  if (CENTRAL_DEPARTMENTS.has(department)) {
    return 'Central';
  }

  for (const item of REGION_PATTERNS) {
    if (item.patterns.some((pattern) => pattern.test(department))) {
      return item.region;
    }
  }

  return null;
}

function classifyRole(position) {
  const normalized = clean(position)?.toLowerCase() ?? '';

  if (normalized.includes('завед') || normalized.includes('директор')) {
    return 'Manager';
  }

  if (normalized.includes('специалист') || normalized.includes('оператор')) {
    return 'Operator';
  }

  return null;
}

function phoneKey(phone) {
  const firstPhone = clean(phone)?.split(/[;,]/)[0];

  if (!firstPhone) {
    return null;
  }

  let digits = firstPhone.replace(/\D/g, '');

  if (digits.length === 13 && digits.startsWith('9960')) {
    digits = `996${digits.slice(4)}`;
  } else if (digits.length === 10 && digits.startsWith('0')) {
    digits = `996${digits.slice(1)}`;
  } else if (digits.length === 9) {
    digits = `996${digits}`;
  }

  if (!digits) {
    return null;
  }

  if (digits.length >= 12 && digits.startsWith('996')) {
    return `+${digits.slice(0, 12)}`;
  }

  return `+${digits}`;
}

function generatedEmail(employeeId) {
  return `${LEGACY_UID_PREFIX}-${employeeId}@${GENERATED_EMAIL_DOMAIN}`;
}

function legacyUid(employeeId) {
  return `${LEGACY_UID_PREFIX}:${employeeId}`;
}

async function fetchEmployees(client) {
  const result = await client.query(`
    select
      e.id::text,
      e.first_name,
      e.last_name,
      e.middle_name,
      e.phone_number,
      e.status,
      e.active,
      d.name as department,
      p.title as position
    from employees e
    left join departments d on d.id = e.department_id
    left join positions p on p.id = e.position_id
    order by e.id
  `);

  return result.rows;
}

async function fetchAuthUsers(client) {
  const result = await client.query(`
    select
      id,
      email,
      role::text as role,
      phone,
      disabled,
      "legacyFirebaseUid"
    from users
  `);

  return result.rows;
}

function buildAuthIndexes(users) {
  const byLegacyUid = new Map();
  const phoneEntries = new Map();

  for (const user of users) {
    if (user.legacyFirebaseUid) {
      byLegacyUid.set(user.legacyFirebaseUid, user);
    }

    const key = phoneKey(user.phone);

    if (!key) {
      continue;
    }

    const existing = phoneEntries.get(key);

    if (existing) {
      phoneEntries.set(key, null);
      continue;
    }

    phoneEntries.set(key, user);
  }

  const byPhone = new Map();

  for (const [key, user] of phoneEntries.entries()) {
    if (user) {
      byPhone.set(key, user);
    }
  }

  return { byLegacyUid, byPhone };
}

function toImportRows(employees, authIndexes) {
  return employees.map((employee) => {
    const departmentId = cleanDepartment(employee.department);
    const position = clean(employee.position);
    const role = classifyRole(position);
    const uid = legacyUid(employee.id);
    const existingByLegacy = authIndexes.byLegacyUid.get(uid);
    const existingByPhone = authIndexes.byPhone.get(
      phoneKey(employee.phone_number),
    );
    const existing =
      existingByLegacy ??
      (existingByPhone &&
      (!existingByPhone.legacyFirebaseUid ||
        existingByPhone.legacyFirebaseUid === uid)
        ? existingByPhone
        : null);
    const isMappedRole = Boolean(role);

    return {
      employeeId: employee.id,
      email: generatedEmail(employee.id),
      username: fullName(employee),
      phone: clean(employee.phone_number),
      orgId: inferRegion(departmentId),
      departmentId,
      position,
      legacyFirebaseUid: uid,
      role: role ?? existing?.role ?? 'Citizen',
      disabled: isMappedRole ? false : (existing?.disabled ?? true),
      matchedBy: existingByLegacy ? 'legacy' : existing ? 'phone' : null,
      existingUserId: existing?.id ?? null,
      sourceStatus: clean(employee.status),
      sourceActive: Boolean(employee.active),
    };
  });
}

async function ensureScopeOptions(client, rows) {
  const scopeOptions = [];
  const seen = new Set();

  for (const row of rows) {
    for (const [type, value] of [
      ['orgId', row.orgId],
      ['departmentId', row.departmentId],
    ]) {
      if (!value) {
        continue;
      }

      const key = `${type}:${value}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      scopeOptions.push({ type, value });
    }
  }

  for (const option of scopeOptions) {
    await client.query(
      `
        insert into scope_options (id, type, value, "createdAt", "updatedAt")
        values (gen_random_uuid()::text, $1::"ScopeOptionType", $2, now(), now())
        on conflict (type, value) do nothing
      `,
      [option.type, option.value],
    );
  }

  return scopeOptions.length;
}

async function updateExistingUser(client, row) {
  await client.query(
    `
      update users
      set
        role = $2::"UserRole",
        username = $3,
        phone = $4,
        "orgId" = $5,
        "departmentId" = $6,
        position = $7,
        "legacyFirebaseUid" = $8,
        disabled = $9,
        "updatedAt" = now()
      where id = $1
    `,
    [
      row.existingUserId,
      row.role,
      row.username,
      row.phone,
      row.orgId,
      row.departmentId,
      row.position,
      row.legacyFirebaseUid,
      row.disabled,
    ],
  );
}

async function insertUser(client, row, passwordHash) {
  await client.query(
    `
      insert into users (
        id,
        email,
        "passwordHash",
        role,
        username,
        phone,
        "orgId",
        "departmentId",
        position,
        "legacyFirebaseUid",
        disabled,
        "createdAt",
        "updatedAt"
      )
      values (
        gen_random_uuid()::text,
        $1,
        $2,
        $3::"UserRole",
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        now(),
        now()
      )
    `,
    [
      row.email,
      passwordHash,
      row.role,
      row.username,
      row.phone,
      row.orgId,
      row.departmentId,
      row.position,
      row.legacyFirebaseUid,
      row.disabled,
    ],
  );
}

function summarize(rows) {
  const summary = {
    total: rows.length,
    create: rows.filter((row) => !row.existingUserId).length,
    updateByLegacy: rows.filter((row) => row.matchedBy === 'legacy').length,
    updateByPhone: rows.filter((row) => row.matchedBy === 'phone').length,
    operator: rows.filter((row) => row.role === 'Operator').length,
    manager: rows.filter((row) => row.role === 'Manager').length,
    disabled: rows.filter((row) => row.disabled).length,
    missingRegion: rows.filter((row) => !row.orgId).length,
    missingDepartment: rows.filter((row) => !row.departmentId).length,
  };
  const unmappedPositions = new Map();

  for (const row of rows) {
    if (row.role === 'Operator' || row.role === 'Manager') {
      continue;
    }

    const key = row.position ?? '<empty>';
    unmappedPositions.set(key, (unmappedPositions.get(key) ?? 0) + 1);
  }

  return {
    ...summary,
    unmappedPositions: [...unmappedPositions.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ),
  };
}

async function main() {
  const employeeClient = new Client({
    connectionString: EMPLOYEE_DATABASE_URL,
  });
  const authClient = new Client({ connectionString: AUTH_DATABASE_URL });

  await employeeClient.connect();
  await authClient.connect();

  try {
    const [employees, authUsers] = await Promise.all([
      fetchEmployees(employeeClient),
      fetchAuthUsers(authClient),
    ]);
    const rows = toImportRows(employees, buildAuthIndexes(authUsers));
    const summary = summarize(rows);

    console.log(JSON.stringify(summary, null, 2));

    if (DRY_RUN) {
      console.log('Dry run only. No data was written.');
      return;
    }

    const passwordHash = await bcrypt.hash(
      DEFAULT_PASSWORD ?? crypto.randomBytes(32).toString('hex'),
      SALT_ROUNDS,
    );

    await authClient.query('begin');

    const scopeOptionCount = await ensureScopeOptions(authClient, rows);

    for (const row of rows) {
      if (row.existingUserId) {
        await updateExistingUser(authClient, row);
      } else {
        await insertUser(authClient, row, passwordHash);
      }
    }

    await authClient.query('commit');
    console.log(`Imported ${rows.length} employees.`);
    console.log(`Ensured ${scopeOptionCount} scope option values.`);
  } catch (error) {
    if (!DRY_RUN) {
      await authClient.query('rollback').catch(() => undefined);
    }

    throw error;
  } finally {
    await employeeClient.end();
    await authClient.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
