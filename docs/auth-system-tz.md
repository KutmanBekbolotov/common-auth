# ТЗ: система авторизации common-auth

## 1. Назначение

`common-auth` - центральный сервис аутентификации, авторизации и администрирования пользователей для подключаемых frontend/backend-сервисов.

Сервис заменяет Firebase Auth/Firestore-профили и предоставляет:

- вход по `email` и `password`;
- короткоживущий JWT access token для API-запросов;
- долгоживущий refresh token в `httpOnly` cookie;
- контекст текущего пользователя: роль, организация, отдел, permissions;
- административный CRUD пользователей;
- справочники допустимых `role`, `orgId`, `departmentId`;
- совместимость со старым frontend-кодом через поля `uid`, `userProfile`, `ProfilePic`.

## 2. Технологический стек

- Runtime/API: NestJS.
- Database: PostgreSQL.
- ORM: Prisma.
- Password hashing: bcrypt.
- Token format: JWT.
- API docs: Swagger по пути `/docs` или значению `SWAGGER_PATH`.
- CORS: включен с `credentials: true`.

## 3. Модель данных

### User

Таблица: `users`.

Поля:

- `id: string` - UUID, primary key.
- `email: string` - уникальный email, хранится в нижнем регистре.
- `passwordHash: string` - bcrypt-хеш пароля, наружу не возвращается.
- `refreshTokenHash: string | null` - SHA-256 хеш последнего refresh token, наружу не возвращается.
- `role: UserRole` - роль пользователя.
- `username: string | null` - отображаемое имя.
- `orgId: string | null` - организация/регион.
- `departmentId: string | null` - отдел/подразделение.
- `position: string | null` - должность сотрудника.
- `photoUrl: string | null` - URL аватара.
- `legacyFirebaseUid: string | null` - уникальный старый Firebase UID.
- `disabled: boolean` - отключенный пользователь не может логиниться и проходить guard.
- `createdAt`, `updatedAt`.

Индексы:

- `role`;
- `orgId`;
- unique `email`;
- unique `legacyFirebaseUid`.

### ScopeOption

Таблица: `scope_options`.

Поля:

- `id: string` - UUID.
- `type: ScopeOptionType` - `orgId` или `departmentId`.
- `value: string` - значение справочника.
- `createdAt`, `updatedAt`.

Ограничения:

- unique пара `[type, value]`;
- индекс по `type`.

## 4. Роли и permissions

Поддерживаемые роли:

```text
admin | ceo | license | spec | hr | ovk | TV | Practice | Terminal | SuperAdmin | INVENTORY_IT | INVENTORY_AHO | INVENTORY_ACCOUNTANT | INVENTORY_AUDITOR | Manager | Auditor | Operator | System | PRESSA | General-department | Citizen
```

Правила:

- административные endpoint-ы доступны только ролям `admin` и `SuperAdmin`;
- пользователи с ролью `spec` обязаны иметь `orgId` и `departmentId`;
- inventory-роли не требуют `orgId`/`departmentId`; складовой доступ вычисляет inventory-service по роли;
- роль `General-department` предназначена для центрального аппарата и не требует `orgId`/`departmentId`;
- роль `Practice` предназначена для display-only/табло-сценариев и не должна использоваться для admin/distribution flow;
- доступ к облаку определяется полем `permissions.cloud`;
- `permissions.cloud = true` для ролей `admin`, `ovk`, `SuperAdmin`, `System`;
- клиентские проверки ролей нужны только для UX, финальное решение о доступе всегда принимает backend.

## 5. Token/session model

### Access token

Access token возвращается в body ответа `POST /auth/register`, `POST /auth/login` и `POST /auth/refresh`.

JWT payload:

```json
{
  "sub": "user-id",
  "sid": "session-id",
  "email": "user@example.com",
  "type": "access"
}
```

Правила:

- подписывается секретом `JWT_SECRET`;
- TTL задается `JWT_ACCESS_TTL`, значение по умолчанию `15m`;
- используется в заголовке `Authorization: Bearer <accessToken>`;
- refresh token нельзя использовать вместо access token;
- role/scope не включены в JWT, их надо получать из auth context.

### Refresh token

Refresh token выдается в cookie:

```text
refresh_token=<opaque-random-token>
```

Cookie options:

- `httpOnly: true`;
- `sameSite: lax`;
- `secure: true` только при `NODE_ENV=production`;
- `path: /auth`;
- `maxAge` равен `JWT_REFRESH_TTL`, по умолчанию `30d`.

Правила:

- является непрозрачной случайной строкой, а не JWT;
- в БД хранится только SHA-256 хеш refresh token;
- при каждом успешном login/refresh создается новая session pair;
- новый login/refresh перезаписывает `refreshTokenHash`, то есть старый refresh token пользователя становится невалидным;
- logout очищает cookie и устанавливает `refreshTokenHash = null` и `sessionId = null`;
- при невалидном refresh сервис очищает refresh cookie.

## 6. Основной auth flow

1. Пользователь вводит email/password.
2. Frontend вызывает `POST /auth/login` или `POST /auth/register`.
3. Backend проверяет email, bcrypt password hash и `disabled` для login или создает `Citizen` для register.
4. Backend возвращает `accessToken` и auth context.
5. Backend ставит `httpOnly` refresh cookie.
6. Frontend хранит access token и отправляет его во все backend-сервисы:

```http
Authorization: Bearer <accessToken>
```

7. Если API вернул `401` из-за истекшего access token, frontend вызывает `POST /auth/refresh`.
8. Если refresh успешен, frontend сохраняет новый access token и повторяет исходный запрос.
9. Если refresh неуспешен, frontend удаляет локальный access token и отправляет пользователя на login.
10. При logout frontend вызывает `POST /auth/logout` и удаляет локальный access token.

## 7. Auth API

Base URL в dev:

```text
http://localhost:3000
```

### GET /

Health endpoint.

### POST /auth/login

Публичный endpoint.

Request:

```json
{
  "email": "admin@example.com",
  "password": "change-me-admin-password"
}
```

Response:

```json
{
  "accessToken": "jwt-token",
  "currentUser": {
    "id": "user-id",
    "uid": "user-id",
    "email": "admin@example.com"
  },
  "user": {
    "id": "user-id",
    "email": "admin@example.com",
    "role": "admin",
    "username": "Admin",
    "orgId": null,
    "departmentId": null,
    "photoUrl": null,
    "ProfilePic": "",
    "scope": {
      "role": "admin",
      "orgId": null,
      "departmentId": null,
      "permissions": {
        "cloud": true
      }
    },
    "legacyFirebaseUid": null,
    "disabled": false,
    "createdAt": "2026-04-22T00:00:00.000Z",
    "updatedAt": "2026-04-22T00:00:00.000Z"
  },
  "userProfile": {
    "...": "same shape as user"
  },
  "userRole": "admin",
  "orgId": null,
  "departmentId": null,
  "scope": {
    "role": "admin",
    "orgId": null,
    "departmentId": null,
    "permissions": {
      "cloud": true
    }
  },
  "permissions": {
    "cloud": true
  }
}
```

Ошибки:

- `401` - неверные email/password;
- `403` - пользователь отключен.

### POST /auth/register

Публичный endpoint для самостоятельной регистрации гражданина с сайта без CRM и без admin token.

Request:

```json
{
  "email": "user@example.com",
  "password": "strong-password",
  "fullName": "Бакыт Жумабеков",
  "phone": "+996 555 12-34-56",
  "pin": "20105199500123"
}
```

Правила:

- `email` обязателен, валидный, уникальный и нормализуется к lowercase;
- `password` минимум 8 символов;
- `fullName` минимум 2 символа и сохраняется в `username`;
- `phone` и `pin` optional;
- клиент не может передавать `role`; backend назначает `Citizen`;
- `disabled` по умолчанию `false`;
- refresh cookie устанавливается так же, как в `POST /auth/login`;
- есть in-memory rate limit по IP и email;
- CAPTCHA/Turnstile и email verification можно добавить отдельным шагом после MVP.

Response такой же, как `POST /auth/login`.

Ошибки:

- `400` - невалидные данные или лишние поля в body;
- `409` - email уже существует;
- `429` - слишком много попыток регистрации.

### POST /auth/refresh

Требует валидный `refresh_token` cookie.

Response такой же, как `POST /auth/login`.

Ошибки:

- `401` - cookie отсутствует, токен истек, токен битый, пользователь отключен/удален, refresh hash не совпадает.

### GET /auth/me

Требует access token:

```http
Authorization: Bearer <accessToken>
```

Response такой же, как `POST /auth/login`, но без `accessToken`.

Назначение:

- восстановить состояние frontend при старте;
- заменить Firebase `onAuthStateChanged`;
- дать backend-сервисам актуальный role/scope context, если они не подключены к auth DB.

### POST /auth/logout

Требует access token.

Response:

```json
{
  "success": true
}
```

Backend очищает refresh cookie и удаляет `refreshTokenHash` в БД.

## 8. Admin API

Все admin endpoint-ы требуют:

```http
Authorization: Bearer <adminOrSuperAdminAccessToken>
```

И доступны только ролям `admin` и `SuperAdmin`.

### GET /admin/users

Возвращает пользователей:

```json
{
  "users": [
    {
      "id": "user-id",
      "email": "user@example.com",
      "role": "Manager",
      "username": "User",
      "orgId": "Bishkek",
      "departmentId": "Osh-City",
      "photoUrl": null,
      "ProfilePic": "",
      "scope": {
        "role": "Manager",
        "orgId": "Bishkek",
        "departmentId": "Osh-City",
        "permissions": {
          "cloud": false
        }
      },
      "legacyFirebaseUid": null,
      "disabled": false,
      "createdAt": "2026-04-22T00:00:00.000Z",
      "updatedAt": "2026-04-22T00:00:00.000Z"
    }
  ]
}
```

### POST /admin/users

Создает пользователя через admin flow. Для самостоятельной регистрации сайта используйте `POST /auth/register`.

Request:

```json
{
  "email": "user@example.com",
  "password": "strong-password",
  "role": "spec",
  "username": "User",
  "orgId": "Bishkek",
  "departmentId": "Osh-City",
  "photoUrl": null,
  "legacyFirebaseUid": null,
  "disabled": false
}
```

Правила:

- `email` обязателен, валидный и уникальный;
- `password` минимум 8 символов;
- `role` обязателен и должен быть одним из `UserRole`;
- если `role` равен `spec`, обязательны `orgId` и `departmentId`;
- значения `Manager` и `Operator` регистрозависимые; `manager` и `operator` невалидны;
- если `orgId`/`departmentId` переданы, они должны существовать в справочниках;
- `photoUrl` или `ProfilePic` должны быть URL, если не пустые;
- пустые optional строки нормализуются в `null`;
- password сохраняется только как bcrypt hash.

### PATCH /admin/users/:id

Обновляет профиль и scope. Все поля optional.

Request example:

```json
{
  "email": "kara-buura@gmail.com",
  "role": "spec",
  "username": "Kara-Buura",
  "orgId": "Manas",
  "departmentId": "Tash-Komur",
  "ProfilePic": "",
  "disabled": false
}
```

Правила:

- нельзя передать `role: null`;
- если итоговая роль `spec`, итоговые `orgId` и `departmentId` обязательны;
- admin/SuperAdmin не может изменить собственную административную роль;
- admin/SuperAdmin не может отключить сам себя;
- если нет изменяемых полей, возвращается текущий пользователь;
- `email` и `legacyFirebaseUid` остаются уникальными.

### PATCH /admin/users/:id/role

Endpoint совместимости, меняет только роль.

Request:

```json
{
  "role": "Operator"
}
```

Правила:

- роль должна быть из `UserRole`;
- нельзя изменить собственную административную роль;
- если новая роль `spec`, у пользователя уже должны быть `orgId` и `departmentId`.

### DELETE /admin/users/:id

Удаляет пользователя.

Правила:

- admin/SuperAdmin не может удалить сам себя.

Response:

```json
{
  "success": true
}
```

## 9. Scope options API

Endpoint-ы доступны только `admin` и `SuperAdmin`.

### GET /admin/users/scope-options

Возвращает справочники для admin forms:

```json
{
  "items": [
    {
      "id": "scope-option-id",
      "type": "orgId",
      "value": "Bishkek"
    }
  ],
  "roles": [
    "admin",
    "SuperAdmin",
    "INVENTORY_IT",
    "INVENTORY_AHO",
    "INVENTORY_ACCOUNTANT",
    "INVENTORY_AUDITOR",
    "..."
  ],
  "orgIds": ["Bishkek", "Chuy"],
  "departmentIds": ["Osh-City", "Kemin"]
}
```

Если таблица пустая, сервис автоматически создает default options.

### POST /admin/users/scope-options

Создает значение справочника.

Request:

```json
{
  "type": "orgId",
  "value": "Jalal-Abad"
}
```

Правила:

- `type` должен быть `orgId` или `departmentId`;
- `value` trim-ится и не может быть пустым;
- дубликат `[type, value]` возвращает `409`.

### PATCH /admin/users/scope-options/:id

Переименовывает значение.

Правила:

- если значение назначено пользователям, у пользователей обновляется соответствующее поле в той же транзакции;
- дубликат `[type, value]` возвращает `409`.

### DELETE /admin/users/scope-options/:id

Удаляет значение.

Правила:

- если значение уже назначено пользователям, сервис возвращает `409` и не удаляет запись.

## 10. Интеграция frontend

Frontend должен:

- вызывать `POST /auth/login` с `credentials: 'include'`, чтобы браузер сохранил refresh cookie;
- хранить только `accessToken` в localStorage/sessionStorage/in-memory storage;
- не читать и не хранить refresh token вручную;
- отправлять access token во все backend-запросы через `Authorization: Bearer <token>`;
- при `401` вызывать `POST /auth/refresh` с `credentials: 'include'`;
- после успешного refresh обновлять access token и повторять исходный запрос;
- при неуспешном refresh удалять локальный access token и вести пользователя на login;
- при старте приложения либо вызывать `GET /auth/me`, если access token есть, либо `POST /auth/refresh`, если нужно восстановить сессию из cookie;
- использовать `permissions.cloud === true` для показа облака;
- брать значения dropdown-ов `role`, `orgId`, `departmentId` из `GET /admin/users/scope-options`;
- считать `userRole`, меню и routes клиентскими UX-проверками, а не безопасностью.

Пример `fetch`:

```ts
const loginResponse = await fetch(`${AUTH_URL}/auth/login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const session = await loginResponse.json();
localStorage.setItem('accessToken', session.accessToken);
```

## 11. Интеграция backend-сервисов

Подключаемые сервисы должны принимать тот же access token, который frontend получил от `common-auth`.

Общий сценарий:

1. Frontend логинится в `common-auth`.
2. Frontend получает `accessToken`.
3. Frontend вызывает бизнес-сервис с заголовком:

```http
Authorization: Bearer <accessToken>
```

4. Бизнес-сервис валидирует пользователя и применяет свои правила доступа.

### Вариант A: сервису нужна только идентичность

Сервис может валидировать JWT локально:

- проверить подпись через `JWT_SECRET`;
- проверить срок действия `exp`;
- проверить `type === "access"`;
- использовать `sub` как `userId`, `email` как email.

Важно: локальная JWT-проверка не дает роль, `orgId`, `departmentId`, `permissions`, потому что текущий access token их не содержит.

### Вариант B: сервису нужна роль/scope/permissions

Сервис должен получить актуальный auth context:

- вызвать `GET /auth/me` в `common-auth` с тем же `Authorization` header;
- использовать из ответа `userRole`, `orgId`, `departmentId`, `position`, `scope`, `permissions`;
- кешировать результат максимум до истечения access token;
- при `401`/`403` от `common-auth` отклонять запрос.

Это рекомендуемый вариант для сервисов, где права зависят от роли, региона, отдела или `disabled`.

### Вариант C: общий guard/library

Для NestJS-сервисов рекомендуется вынести общий guard/interceptor:

- извлекает Bearer token;
- проверяет токен локально или через `common-auth`;
- кладет в request `authUser`;
- возвращает `401`, если токен отсутствует/истек/невалиден;
- возвращает `403`, если роль или scope не подходят endpoint-у.

### Правила авторизации в бизнес-сервисах

Каждый бизнес-сервис обязан сам проверять доступ к своим данным:

- `admin`/`SuperAdmin` обычно получают полный доступ;
- `spec` должен ограничиваться своими `orgId` и `departmentId`;
- `Practice` использовать только для display-only сценариев;
- остальные роли (`Manager`, `Auditor`, `Operator`, `ceo`, `license`, `hr`, `ovk`, `TV`, `Terminal`, `System`, `PRESSA`, `General-department`, `Citizen`) должны иметь явно описанные права внутри конкретного сервиса;
- нельзя полагаться только на скрытие кнопок во frontend.

### Интеграция backend электронной очереди

Backend электронной очереди должен считать `common-auth` единственным источником идентичности, роли, региона, отдела и должности сотрудника. Очередь не должна читать auth DB напрямую и не должна хранить собственные пароли сотрудников.

Обязательные env-переменные очереди:

```bash
COMMON_AUTH_URL="http://common-auth-api:3000"
JWT_SECRET="same-secret-as-common-auth"
AUTH_CONTEXT_CACHE_TTL_SECONDS="60"
```

`JWT_SECRET` нужен только если очередь сначала проверяет JWT локально. Даже при локальной проверке очередь должна вызывать `GET /auth/me`, если endpoint зависит от роли, `disabled`, `orgId`, `departmentId` или `position`.

Для создания сотрудников очередь должна иметь отдельный доступ к `common-auth`, а не использовать токен текущего менеджера:

```bash
COMMON_AUTH_MANAGEMENT_TOKEN="admin-or-service-access-token"
# или
COMMON_AUTH_PROVISIONING_EMAIL="provisioning-admin@example.com"
COMMON_AUTH_PROVISIONING_PASSWORD="strong-password"
```

Если эти значения не настроены, fallback на токен текущего пользователя приведет к `403` для `Manager`, потому что `/admin/users` доступен только `admin` и `SuperAdmin`.

Общий guard для protected endpoint-ов очереди:

1. Прочитать `Authorization: Bearer <accessToken>`.
2. Если header отсутствует или формат неверный, вернуть `401`.
3. Вызвать `GET {COMMON_AUTH_URL}/auth/me` с тем же `Authorization` header.
4. Если `common-auth` вернул `401` или `403`, вернуть `401`/`403` клиенту и не выполнять бизнес-логику.
5. Если `common-auth` недоступен, fail closed: вернуть `503 Service Unavailable`, а не пускать пользователя без проверки.
6. Положить в request auth context:

```ts
type QueueAuthUser = {
  id: string;
  email: string;
  role: UserRole;
  orgId: string | null;
  departmentId: string | null;
  position: string | null;
  permissions: {
    cloud: boolean;
  };
};
```

7. Для scoped-ролей проверить, что `orgId` и `departmentId` заполнены. Если у `Manager`, `Operator` или legacy `spec` нет scope, вернуть `403`.
8. Проверить, разрешена ли роль для конкретного endpoint-а.
9. Применить фильтр данных по `orgId` и `departmentId`.

Рекомендуемая матрица доступа для очереди:

| Зона                                                                                                                          | Роли                         | Scope                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| Полный админ-доступ к очередям, окнам, операторам, настройкам и отчетам                                                       | `admin`, `SuperAdmin`        | все регионы и отделы                                                                         |
| Служебные фоновые операции                                                                                                    | `System`                     | только явно разрешенные service-to-service endpoint-ы                                        |
| Управление очередью своего отдела: окна, операторы, вызовы, переносы, закрытие смены, отчеты отдела                           | `Manager`                    | только свой `orgId` + `departmentId`                                                         |
| Работа с талонами: взять следующий, вызвать, начать обслуживание, завершить, отложить, отменить в пределах своего окна/отдела | `Operator`                   | только свой `orgId` + `departmentId`                                                         |
| Legacy department accounts во время миграции                                                                                  | `spec`                       | только свой `orgId` + `departmentId`; желательно постепенно заменить на `Operator`/`Manager` |
| Read-only аудит отчетов                                                                                                       | `Auditor`                    | все или ограниченный scope, если очередь добавит такой режим                                 |
| Табло, терминалы, киоски                                                                                                      | `TV`, `Terminal`, `Practice` | только display/kiosk endpoint-ы без staff actions                                            |
| Граждане                                                                                                                      | `Citizen`, `citizen`         | только публичные endpoint-ы получения/проверки талона, если такие есть                       |

Для `Manager` и `Operator` роль является источником прав, а `position` используется только как справочная информация для отображения, аудита и дополнительных бизнес-правил. Нельзя выдавать доступ только по тексту должности.

Создание заведующих и операторов во frontend очереди должно идти только через backend очереди:

```http
POST /api/v1/staff
Authorization: Bearer <accessToken>
```

Payload:

```json
{
  "email": "vostok-operator1@gmail.com",
  "password": "12345678",
  "username": "Vostok-operator1",
  "role": "Operator",
  "queueDepartmentId": 5,
  "position": "Оператор",
  "active": true,
  "windowIds": [1],
  "serviceIds": [1]
}
```

Queue frontend не должен напрямую вызывать `common-auth` `POST /admin/users`. В queue endpoint-ах `departmentId` - это числовой id отдела очереди (`queueDepartmentId`), а строковый auth scope должен храниться на стороне queue department как `authDepartmentId`, например `authDepartmentId: "Восточный отдел"` вместе с `orgId: "Bishkek"`.

Все доменные сущности очереди, которые относятся к подразделению, должны хранить scope:

```ts
type QueueScopedEntity = {
  orgId: string;
  departmentId: string;
};
```

Правила scope:

- `Manager` и `Operator` видят и меняют только записи, где `entity.orgId === authUser.orgId` и `entity.departmentId === authUser.departmentId`;
- `admin` и `SuperAdmin` могут явно передавать `orgId`/`departmentId` в фильтрах и операциях;
- `System` не должен обходить scope автоматически, каждый service endpoint описывает допустимый scope отдельно;
- если endpoint принимает `orgId`/`departmentId` в query/body, backend обязан сверить их с auth context, а не доверять frontend;
- создание талона, назначение окна, вызов клиента, завершение обслуживания и отмена должны писать `actorUserId`, `actorRole`, `orgId`, `departmentId` в audit log.

Минимальный guard/interceptor для NestJS backend-а очереди:

```ts
async function loadAuthContext(token: string) {
  const response = await fetch(`${COMMON_AUTH_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    throw new UnauthorizedException();
  }

  if (response.status === 403) {
    throw new ForbiddenException();
  }

  if (!response.ok) {
    throw new ServiceUnavailableException('Auth service is unavailable');
  }

  const context = await response.json();

  return {
    id: context.currentUser.id,
    email: context.currentUser.email,
    role: context.userRole,
    orgId: context.orgId,
    departmentId: context.departmentId,
    position: context.position,
    permissions: context.permissions,
  };
}
```

Пример проверки scoped endpoint-а:

```ts
function assertQueueScope(authUser: QueueAuthUser, entity: QueueScopedEntity) {
  if (authUser.role === 'admin' || authUser.role === 'SuperAdmin') {
    return;
  }

  if (!['Manager', 'Operator', 'spec'].includes(authUser.role)) {
    throw new ForbiddenException();
  }

  if (!authUser.orgId || !authUser.departmentId) {
    throw new ForbiddenException('User scope is not assigned');
  }

  if (
    entity.orgId !== authUser.orgId ||
    entity.departmentId !== authUser.departmentId
  ) {
    throw new ForbiddenException('Queue item is outside user scope');
  }
}
```

Кеширование auth context допустимо только по access token и не дольше срока жизни токена. Практичный вариант для очереди: in-memory или Redis cache на 30-60 секунд. При logout/disabled пользователь может оставаться в кеше до истечения этого малого TTL, поэтому для критичных операций можно вызывать `/auth/me` без кеша.

Endpoint-ы очереди должны возвращать:

- `401` - нет access token, токен истек или `common-auth` отклонил пользователя;
- `403` - роль не разрешена, scope отсутствует или запрошен чужой регион/отдел;
- `503` - `common-auth` временно недоступен и невозможно подтвердить пользователя.

Frontend очереди должен делать refresh только после `401`. На `403` нужно показывать отказ прав без вызова `/auth/refresh`.

Чеклист внедрения в backend электронной очереди:

- удалить локальную авторизацию сотрудников и собственные staff passwords из очереди;
- заменить employee-directory lookup на `GET /auth/me`;
- добавить `orgId`, `departmentId`, `actorUserId`, `actorRole` в audit/event записи очереди;
- закрыть все staff endpoint-ы guard-ом;
- явно оставить публичными только health, display/kiosk и гражданские endpoint-ы;
- покрыть тестами `401`, `403`, `admin`, `Manager` своего/чужого отдела, `Operator` своего/чужого отдела и disabled user.

### Service-to-service сценарии

Текущая реализация не содержит отдельного OAuth/client-credentials flow.

Для фоновых задач допустимые варианты:

- создать технического пользователя с ролью `System` и хранить его credentials в secret storage;
- логиниться через `POST /auth/login` и использовать access token;
- не передавать refresh token бизнес-сервисам;
- в будущем добавить отдельный endpoint для service tokens, если появится много server-to-server интеграций.

## 12. Ошибки и статусы

Типовые статусы:

- `400 Bad Request` - невалидный body, пустое обязательное поле, нарушение бизнес-валидации;
- `401 Unauthorized` - нет Bearer token, access/refresh истек или невалиден, refresh session не совпала;
- `403 Forbidden` - пользователь отключен при login или недостаточно прав;
- `404 Not Found` - пользователь/справочник не найден;
- `409 Conflict` - конфликт уникальности или попытка удалить используемый scope option.

## 13. Переменные окружения

Обязательные/важные переменные:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/common_auth?schema=public"
JWT_SECRET="change-me"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="30d"
PASSWORD_SALT_ROUNDS="12"
PORT="3000"
SWAGGER_PATH="docs"
SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="change-me-admin-password"
SEED_ADMIN_USERNAME="Admin"
```

Для production:

- `JWT_SECRET` должен быть длинным случайным secret-ом;
- `NODE_ENV=production` включает `secure` cookie;
- API должен работать через HTTPS;
- CORS origin должен быть ограничен доверенными frontend-доменами;
- если frontend и auth находятся на разных site/domain, cookie policy может потребовать `sameSite: 'none'` и `secure: true`.

## 14. Запуск и обслуживание

Docker dev:

```bash
npm run docker:dev:build
```

Local dev:

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run start:dev
```

Проверки:

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npx prisma validate
```

## 15. Требования безопасности

- Не коммитить реальные secrets/tokens/passwords в репозиторий.
- Не логировать `password`, `accessToken`, `refreshToken`, `passwordHash`, `refreshTokenHash`.
- Использовать HTTPS в production.
- Ограничить CORS в production.
- Держать `PASSWORD_SALT_ROUNDS >= 12`, если производительность позволяет.
- Учитывать, что при локальной JWT-проверке внешние сервисы не узнают об отключении пользователя до истечения access token.
- Для критичных сервисов проверять пользователя через `GET /auth/me`.
- Добавить rate limiting/brute-force protection для `/auth/login`, если сервис доступен публично.
- При переходе на `sameSite: 'none'` добавить CSRF/origin protection для cookie-based refresh endpoint-ов.

## 16. Acceptance criteria

Система считается корректно интегрированной, если:

- пользователь логинится через `POST /auth/login`;
- frontend получает и хранит access token;
- refresh cookie устанавливается как `httpOnly`;
- все приватные запросы идут с `Authorization: Bearer`;
- истекший access token обновляется через `POST /auth/refresh`;
- logout инвалидирует refresh session;
- disabled user не может логиниться и проходить guard;
- admin/SuperAdmin управляют пользователями через admin API;
- роль `spec` не может быть создана без `orgId` и `departmentId`;
- business-сервисы проверяют access token и серверные права доступа;
- сервисы, которым нужны role/scope, получают auth context через `GET /auth/me` или общий guard;
- frontend использует `permissions.cloud`, а не hardcoded список ролей;
- Swagger доступен и соответствует контрактам API.
