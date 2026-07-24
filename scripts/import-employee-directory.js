const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Client } = require('pg');

const EMPLOYEE_DATABASE_URL =
  process.env.EMPLOYEE_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:55432/employee_analysis';
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
const SOURCE_REPORT =
  process.argv.includes('--source-report') ||
  process.argv.includes('--employee-report');
const PRESERVE_EXISTING_DISABLED =
  process.env.EMPLOYEE_IMPORT_PRESERVE_DISABLED !== 'false';
const PRESERVE_MANUAL_ROLES =
  process.env.EMPLOYEE_IMPORT_OVERWRITE_MANUAL_ROLES !== 'true';

const ROLE = Object.freeze({
  AUDITOR: 'Auditor',
  CEO: 'ceo',
  CITIZEN: 'Citizen',
  GENERAL_DEPARTMENT: 'General-department',
  HR: 'hr',
  LICENSE: 'license',
  MANAGER: 'Manager',
  OPERATOR: 'Operator',
  OVK: 'ovk',
  PRACTICE_MANAGER: 'practice_manager',
  PRESSA: 'PRESSA',
});

const MANUAL_AUTH_ROLES = new Set([
  'admin',
  'SuperAdmin',
  'System',
  'TV',
  'Terminal',
  'Practice',
  ROLE.PRACTICE_MANAGER,
  ROLE.AUDITOR,
  'INVENTORY_IT',
  'INVENTORY_AHO',
  'INVENTORY_ACCOUNTANT',
  'INVENTORY_AUDITOR',
]);

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

const DEPARTMENT_ROLE_RULES = [
  {
    role: ROLE.HR,
    reason: 'department:hr',
    patterns: [/управлен.*человеческ.*ресурс/, /кадр/],
  },
  {
    role: ROLE.OVK,
    reason: 'department:ovk',
    patterns: [/внутренн.*контрол/, /противодейств.*коррупц/],
  },
  {
    role: ROLE.LICENSE,
    reason: 'department:license',
    patterns: [/лиценз/],
  },
  {
    role: ROLE.PRESSA,
    reason: 'department:pressa',
    patterns: [/связ.*обществен/, /пресс/],
  },
];

const LEADERSHIP_POSITION_PATTERNS = [
  /директор/,
  /заместител/,
  /начальник/,
  /завед/,
  /руководител/,
];

const OPERATOR_POSITION_PATTERNS = [
  /администратор/,
  /инспектор/,
  /консультант/,
  /оператор/,
  /регистратор/,
  /специалист/,
];

const SUPPORT_POSITION_PATTERNS = [
  /(^|[^а-я])водител/,
  /дворник/,
  /кочегар/,
  /охран/,
  /сантех/,
  /сторож/,
  /убор/,
  /электрик/,
];

const INACTIVE_STATUS_PATTERNS = [
  /уволен/,
  /увольн/,
  /неактив/,
  /отстран/,
  /расторг/,
  /terminated/,
  /inactive/,
  /dismiss/,
];

const ACTIVE_STATUS_PATTERNS = [
  /актив/,
  /работ/,
  /действ/,
  /active/,
  /employed/,
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

function normalizeForMatch(value) {
  return clean(value)?.toLowerCase().replace(/ё/g, 'е') ?? '';
}

function matchesAny(value, patterns) {
  const normalized = normalizeForMatch(value);

  if (!normalized) {
    return false;
  }

  return patterns.some((pattern) => pattern.test(normalized));
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

  if (isCentralDepartment(department)) {
    return 'Central';
  }

  for (const item of REGION_PATTERNS) {
    if (item.patterns.some((pattern) => pattern.test(department))) {
      return item.region;
    }
  }

  return null;
}

function isCentralDepartment(department) {
  const cleanedDepartment = cleanDepartment(department);

  return Boolean(
    cleanedDepartment && CENTRAL_DEPARTMENTS.has(cleanedDepartment),
  );
}

function classifyEmployeeRole(employee) {
  const department = cleanDepartment(employee.department);
  const position = clean(employee.position);

  if (
    department === 'Руководящий отдел' &&
    matchesAny(position, LEADERSHIP_POSITION_PATTERNS)
  ) {
    return {
      role: ROLE.CEO,
      reason: 'department:leadership',
    };
  }

  for (const rule of DEPARTMENT_ROLE_RULES) {
    if (matchesAny(department, rule.patterns)) {
      return {
        role: rule.role,
        reason: rule.reason,
      };
    }
  }

  if (matchesAny(position, SUPPORT_POSITION_PATTERNS)) {
    return {
      role: null,
      reason: 'position:support',
    };
  }

  if (isCentralDepartment(department)) {
    return {
      role: ROLE.GENERAL_DEPARTMENT,
      reason: 'department:central',
    };
  }

  if (matchesAny(position, LEADERSHIP_POSITION_PATTERNS)) {
    return {
      role: ROLE.MANAGER,
      reason: 'position:manager',
    };
  }

  if (matchesAny(position, OPERATOR_POSITION_PATTERNS)) {
    return {
      role: ROLE.OPERATOR,
      reason: 'position:operator',
    };
  }

  return {
    role: null,
    reason: 'unmapped',
  };
}

function parseSourceBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  const normalized = normalizeForMatch(value);

  if (!normalized) {
    return null;
  }

  if (['1', 'true', 't', 'yes', 'y', 'да'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'f', 'no', 'n', 'нет'].includes(normalized)) {
    return false;
  }

  return null;
}

function isActiveEmployee(employee) {
  const active = parseSourceBoolean(employee.active);

  if (active === false) {
    return false;
  }

  if (matchesAny(employee.status, INACTIVE_STATUS_PATTERNS)) {
    return false;
  }

  if (active === true || matchesAny(employee.status, ACTIVE_STATUS_PATTERNS)) {
    return true;
  }

  return true;
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

function resolveRole(classification, existing) {
  if (
    existing?.role &&
    PRESERVE_MANUAL_ROLES &&
    MANUAL_AUTH_ROLES.has(existing.role)
  ) {
    return {
      role: existing.role,
      roleReason: 'existing:manual-role',
      classifiedRole: classification.role,
    };
  }

  return {
    role: classification.role ?? existing?.role ?? ROLE.CITIZEN,
    roleReason: classification.role
      ? classification.reason
      : existing?.role
        ? 'existing:role'
        : classification.reason,
    classifiedRole: classification.role,
  };
}

function resolveDisabled(existing, sourceIsActive, classifiedRole) {
  if (!sourceIsActive) {
    return true;
  }

  if (PRESERVE_EXISTING_DISABLED && existing?.disabled) {
    return true;
  }

  if (classifiedRole) {
    return false;
  }

  return existing?.disabled ?? true;
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
    const classification = classifyEmployeeRole(employee);
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
    const resolvedRole = resolveRole(classification, existing);
    const sourceIsActive = isActiveEmployee(employee);

    return {
      employeeId: employee.id,
      email: generatedEmail(employee.id),
      username: fullName(employee),
      phone: clean(employee.phone_number),
      orgId: inferRegion(departmentId),
      departmentId,
      position,
      legacyFirebaseUid: uid,
      role: resolvedRole.role,
      roleReason: resolvedRole.roleReason,
      classifiedRole: resolvedRole.classifiedRole,
      disabled: resolveDisabled(
        existing,
        sourceIsActive,
        resolvedRole.classifiedRole,
      ),
      matchedBy: existingByLegacy ? 'legacy' : existing ? 'phone' : null,
      existingUserId: existing?.id ?? null,
      sourceStatus: clean(employee.status),
      sourceActive: sourceIsActive,
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
  const roleCounts = countBy(rows, (row) => row.role);
  const roleReasons = countBy(rows, (row) => row.roleReason);
  const summary = {
    total: rows.length,
    active: rows.filter((row) => row.sourceActive).length,
    inactive: rows.filter((row) => !row.sourceActive).length,
    create: rows.filter((row) => !row.existingUserId).length,
    updateByLegacy: rows.filter((row) => row.matchedBy === 'legacy').length,
    updateByPhone: rows.filter((row) => row.matchedBy === 'phone').length,
    roleCounts,
    roleReasons,
    disabled: rows.filter((row) => row.disabled).length,
    missingRegion: rows.filter((row) => !row.orgId).length,
    missingDepartment: rows.filter((row) => !row.departmentId).length,
  };
  const unmappedPositions = new Map();
  const missingRegionDepartments = new Map();

  for (const row of rows) {
    if (!row.classifiedRole && row.sourceActive) {
      const key = row.position ?? '<empty>';
      unmappedPositions.set(key, (unmappedPositions.get(key) ?? 0) + 1);
    }

    if (!row.orgId && row.departmentId) {
      missingRegionDepartments.set(
        row.departmentId,
        (missingRegionDepartments.get(row.departmentId) ?? 0) + 1,
      );
      continue;
    }
  }

  return {
    ...summary,
    unmappedActivePositions: sortEntries(unmappedPositions),
    missingRegionDepartments: sortEntries(missingRegionDepartments),
  };
}

function countBy(rows, getKey) {
  const counts = {};

  for (const row of rows) {
    const key = getKey(row) ?? '<empty>';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(
      ([leftKey, leftCount], [rightKey, rightCount]) =>
        rightCount - leftCount || leftKey.localeCompare(rightKey),
    ),
  );
}

function sortEntries(map) {
  return [...map.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

async function main() {
  const employeeClient = new Client({
    connectionString: EMPLOYEE_DATABASE_URL,
  });
  const authClient = SOURCE_REPORT
    ? null
    : new Client({ connectionString: AUTH_DATABASE_URL });

  await employeeClient.connect();
  if (authClient) {
    await authClient.connect();
  }

  try {
    const employees = await fetchEmployees(employeeClient);

    if (SOURCE_REPORT) {
      const rows = toImportRows(employees, buildAuthIndexes([]));
      console.log(JSON.stringify(summarize(rows), null, 2));
      console.log(
        'Employee source report only. No auth data was read or written.',
      );
      return;
    }

    const authUsers = await fetchAuthUsers(authClient);
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
    if (authClient && !DRY_RUN) {
      await authClient.query('rollback').catch(() => undefined);
    }

    throw error;
  } finally {
    await employeeClient.end();
    if (authClient) {
      await authClient.end();
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  classifyEmployeeRole,
  inferRegion,
  isActiveEmployee,
  toImportRows,
};
