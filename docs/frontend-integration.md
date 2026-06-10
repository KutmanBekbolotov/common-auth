# Frontend Integration

Документация описывает, как фронт должен работать с `common-auth` вместо Firebase Auth/Firestore.

## Base URL

Dev через Docker:

```text
http://localhost:3000
```

Swagger:

```text
http://localhost:3000/docs
```

CORS открыт для всех origins. Авторизация делается через access token в HTTP header.

## Главное правило

Все backend-запросы, кроме публичных endpoint-ов, должны отправлять:

```http
Authorization: Bearer <accessToken>
```

Клиентские роли (`userRole`, меню, routes) используются только для UX. Реальную проверку доступа делает backend.

## Роли

Поддерживаемые роли:

```text
admin | ceo | license | spec | hr | ovk | TV | Practice | Terminal | SuperAdmin | Manager | Auditor | Operator | System | PRESSA
```

Для пользователя с ролью `spec` обязательны `orgId` и `departmentId`. Для `Practice` они не обязательны. Списки ролей и scope-значений фронт должен получать из `GET /admin/users/scope-options`.

## Permissions

Auth response содержит объект `permissions`. Для доступа к облаку фронт должен проверять:

```ts
permissions.cloud === true;
```

Сейчас доступ к облаку получают:

```text
admin | ovk | SuperAdmin | System
```

То есть `ovk`, `SuperAdmin` и `System` должны видеть облако так же, как `admin`.

## Auth Flow

1. Пользователь вводит `email` и `password`.
2. Фронт вызывает `POST /auth/login`.
3. Backend возвращает `accessToken`, auth context и ставит `httpOnly` refresh cookie.
4. Фронт сохраняет `accessToken`.
5. Все API-запросы отправляются с `Authorization: Bearer <accessToken>`.
6. Если access token истек, фронт вызывает `POST /auth/refresh`, получает новый `accessToken` и повторяет исходный запрос.
7. При старте приложения, если token есть, фронт вызывает `GET /auth/me`.
8. Если refresh тоже истек или невалиден, фронт удаляет локальный token и отправляет пользователя на `/login`.

## Token Storage

Backend выдает access token в response body и refresh token в `httpOnly` cookie.

Практичный dev-вариант:

```ts
localStorage.setItem('accessToken', accessToken);
```

Refresh cookie браузер отправляет сам, поэтому фронту достаточно хранить только `accessToken`.

При logout:

```ts
localStorage.removeItem('accessToken');
```

Если не хочется хранить `accessToken` в `localStorage`, можно на старте приложения вызывать `POST /auth/refresh` и восстанавливать сессию только из cookie.

## Auth Endpoints

### POST /auth/login

Публичный endpoint.

Request:

```json
{
  "email": "admin@example.com",
  "password": "password"
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

Notes:

- `currentUser.uid` равен `currentUser.id`, чтобы фронту было проще мигрировать с Firebase.
- `userProfile` дублирует `user`.
- `ProfilePic` дублирует `photoUrl` для совместимости со старым фронтом; если аватара нет, приходит пустая строка.
- `scope` собирает роль, организацию, отдел и permissions в одном объекте.
- `permissions.cloud` показывает, можно ли пользователю открывать облако.
- `passwordHash` и `refreshTokenHash` никогда не возвращаются.

Possible errors:

- `401` - неверные email/password или истекший/битый token.
- `403` - пользователь отключен.

### POST /auth/refresh

Требует валидный `httpOnly` refresh cookie.

Response такой же, как `POST /auth/login`.

Поведение:

- backend проверяет refresh token;
- если токен валиден, backend выдает новый `accessToken`;
- refresh cookie ротируется на каждом успешном обновлении.

### GET /auth/me

Требует `Authorization`.

Response такой же, как `POST /auth/login`, но без `accessToken`.

Использование:

- вызывать при старте приложения, если token есть;
- вызывать после refresh страницы;
- использовать как замену `onAuthStateChanged`.

### POST /auth/logout

Требует `Authorization`.

Response:

```json
{
  "success": true
}
```

Frontend должен удалить локальный `accessToken`, а backend инвалидирует сохраненный refresh token и очищает cookie.

## Admin User Endpoints

Все endpoint-ы ниже требуют:

```http
Authorization: Bearer <adminAccessToken>
```

И доступны роли `admin` и `SuperAdmin`.

### GET /admin/users

Response:

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

### GET /admin/users/scope-options

Возвращает справочники для селектов `role`, `orgId` и `departmentId`, а также список записей с `id` для admin CRUD.

Response:

```json
{
  "items": [
    {
      "id": "scope-option-org-id",
      "type": "orgId",
      "value": "Bishkek"
    },
    {
      "id": "scope-option-department-id",
      "type": "departmentId",
      "value": "Osh-City"
    }
  ],
  "roles": [
    "admin",
    "ceo",
    "license",
    "spec",
    "hr",
    "ovk",
    "TV",
    "Practice",
    "Terminal",
    "SuperAdmin",
    "Manager",
    "Auditor",
    "Operator",
    "System",
    "PRESSA"
  ],
  "orgIds": [
    "Bishkek",
    "Chuy",
    "Talas",
    "Naryn",
    "Issyk-Kul",
    "Manas",
    "Osh",
    "Batken"
  ],
  "departmentIds": [
    "Osh-City",
    "Kemin",
    "NarynReg",
    "Sokuluk",
    "Yssyk-Ata",
    "Toktogul",
    "Sulukta",
    "Bazarkorgon",
    "Nooken",
    "Aksy",
    "Tash-Komur",
    "Ala-Buka",
    "Karakul",
    "Karasuu",
    "Nookat",
    "Alay",
    "Kochkor",
    "Zhumgal",
    "Kadamzhay",
    "Talas",
    "Uzgen",
    "Ton",
    "Cholpon-Ata",
    "Balykchy",
    "Kyzyl-Kia",
    "Batken",
    "Zhalal-Abad",
    "Karakol",
    "Kara-Balta",
    "Oshreg",
    "Alamudun",
    "Tash-Dobo",
    "Vostok",
    "Kara-Buura"
  ]
}
```

### POST /admin/users/scope-options

Создает новую запись справочника.

Request:

```json
{
  "type": "orgId",
  "value": "Jalal-Abad"
}
```

Response:

```json
{
  "item": {
    "id": "scope-option-id",
    "type": "orgId",
    "value": "Jalal-Abad"
  }
}
```

### PATCH /admin/users/scope-options/:id

Переименовывает запись справочника.

Request:

```json
{
  "value": "Jalal-Abad Region"
}
```

Response:

```json
{
  "item": {
    "id": "scope-option-id",
    "type": "orgId",
    "value": "Jalal-Abad Region"
  }
}
```

Notes:

- если значение уже назначено пользователям, backend обновит у них `orgId` или `departmentId` в той же операции;
- если новое значение уже существует в том же типе, backend вернет `409`.

### DELETE /admin/users/scope-options/:id

Удаляет запись справочника.

Response:

```json
{
  "success": true
}
```

Ограничение:

- если значение уже назначено пользователям, backend вернет `409` и не даст удалить запись.

### POST /admin/users

Создает пользователя. Публичной регистрации нет.

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

Response:

```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "role": "spec",
    "username": "User",
    "orgId": "Bishkek",
    "departmentId": "Osh-City",
    "photoUrl": null,
    "ProfilePic": "",
    "scope": {
      "role": "spec",
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
}
```

Validation rules:

- `email` обязателен и уникален.
- `password` минимум 8 символов.
- `role` должен быть одним из разрешенных.
- если `role = spec`, обязательны `orgId` и `departmentId`.
- `role`, `orgId` и `departmentId` должны браться из `GET /admin/users/scope-options`.
- `ProfilePic` необязателен. Его можно отправлять вместо `photoUrl`; пустая строка очищает аватар.

### PATCH /admin/users/:id

Меняет Firestore-like профиль и область доступа пользователя.

Request:

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

Все поля optional. Можно отправлять только то, что меняется.

Response:

```json
{
  "user": {
    "...": "updated user"
  }
}
```

Ограничения:

- admin и SuperAdmin не могут менять свою собственную административную роль;
- admin не может отключить сам себя через `disabled: true`;
- если итоговая роль `spec`, итоговые `orgId` и `departmentId` обязательны.
- если переданы `orgId` или `departmentId`, они должны быть из `GET /admin/users/scope-options`.

### PATCH /admin/users/:id/role

Меняет только роль пользователя. Endpoint оставлен для совместимости.

Request:

```json
{
  "role": "Operator"
}
```

Response:

```json
{
  "user": {
    "...": "updated user"
  }
}
```

Ограничения:

- admin и SuperAdmin не могут менять свою собственную административную роль;
- если новая роль `spec`, у пользователя уже должны быть `orgId` и `departmentId`.

### DELETE /admin/users/:id

Удаляет пользователя.

Response:

```json
{
  "success": true
}
```

Ограничение:

- admin не может удалить сам себя.

## Axios Example

```ts
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_AUTH_API_URL ?? 'http://localhost:3000',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config as
      | (typeof error.config & { _retry?: boolean })
      | undefined;
    const isRefreshRequest = request?.url?.endsWith('/auth/refresh');
    const isLoginRequest = request?.url?.endsWith('/auth/login');

    if (
      error.response?.status === 401 &&
      request &&
      !request._retry &&
      !isRefreshRequest &&
      !isLoginRequest
    ) {
      request._retry = true;

      try {
        const { data } = await api.post('/auth/refresh');
        localStorage.setItem('accessToken', data.accessToken);
        request.headers = request.headers ?? {};
        request.headers.Authorization = `Bearer ${data.accessToken}`;
        return api.request(request);
      } catch {
        localStorage.removeItem('accessToken');
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  },
);
```

## useAuth Contract

Фронт может сохранить старый внешний контракт:

```ts
type AuthContextValue = {
  currentUser: {
    id: string;
    uid: string;
    email: string;
  } | null;
  userRole:
    | 'admin'
    | 'ceo'
    | 'license'
    | 'spec'
    | 'hr'
    | 'ovk'
    | 'TV'
    | 'Practice'
    | 'Terminal'
    | 'SuperAdmin'
    | 'Manager'
    | 'Auditor'
    | 'Operator'
    | 'System'
    | 'PRESSA'
    | null;
  userProfile: UserProfile | null;
  orgId: string | null;
  departmentId: string | null;
  scope: {
    role:
      | 'admin'
      | 'ceo'
      | 'license'
      | 'spec'
      | 'hr'
      | 'ovk'
      | 'TV'
      | 'Practice'
      | 'Terminal'
      | 'SuperAdmin'
      | 'Manager'
      | 'Auditor'
      | 'Operator'
      | 'System'
      | 'PRESSA';
    orgId: string | null;
    departmentId: string | null;
    permissions: {
      cloud: boolean;
    };
  } | null;
  permissions: {
    cloud: boolean;
  };
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
};
```

Пример реализации:

```ts
async function login(email: string, password: string) {
  const { data } = await api.post('/auth/login', { email, password });

  localStorage.setItem('accessToken', data.accessToken);

  setCurrentUser(data.currentUser);
  setUserProfile(data.userProfile);
  setUserRole(data.userRole);
  setOrgId(data.orgId);
  setDepartmentId(data.departmentId);
  setScope(data.scope);
  setPermissions(data.permissions);
}

async function loadMe() {
  const token = localStorage.getItem('accessToken');

  if (!token) {
    setLoading(false);
    return;
  }

  try {
    const { data } = await api.get('/auth/me');

    setCurrentUser(data.currentUser);
    setUserProfile(data.userProfile);
    setUserRole(data.userRole);
    setOrgId(data.orgId);
    setDepartmentId(data.departmentId);
    setScope(data.scope);
    setPermissions(data.permissions);
  } catch {
    localStorage.removeItem('accessToken');
    setCurrentUser(null);
    setUserProfile(null);
    setUserRole(null);
    setOrgId(null);
    setDepartmentId(null);
    setScope(null);
    setPermissions({ cloud: false });
  } finally {
    setLoading(false);
  }
}

async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    localStorage.removeItem('accessToken');
    setCurrentUser(null);
    setUserProfile(null);
    setUserRole(null);
    setOrgId(null);
    setDepartmentId(null);
    setScope(null);
    setPermissions({ cloud: false });
  }
}
```

## Migration From Firebase

Replace frontend calls as follows:

```text
signInWithEmailAndPassword -> POST /auth/login
onAuthStateChanged        -> GET /auth/me on app startup
signOut                   -> POST /auth/logout + remove local token
getDoc(users/{uid})       -> data from /auth/me
getDocs(users)            -> GET /admin/users
hardcoded scope lists     -> GET /admin/users/scope-options
updateDoc(profile/scope)  -> PATCH /admin/users/:id
updateDoc(role only)      -> PATCH /admin/users/:id/role
deleteDoc(users/{id})     -> DELETE /admin/users/:id
```

Do not send or trust role/org/department values from the browser as authorization proof. The backend derives permissions from the access token and database user.
