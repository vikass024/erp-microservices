# ERP System Using Microservices Architecture

A student project building a modular ERP system for ICFAI Foundation for Higher Education (IcfaiTech, FST), using independent microservices instead of one large application.

## Team

| Member | Phase | Services |
|---|---|---|
| Vikas V | Phase 1 | API Gateway, Auth Service |
| Meda Avinash Reddy | Phase 2 | Student Management, Course Management |
| D Sandeep Manikanta | Phase 3 | Attendance, Faculty Management |
| T Vaishnavi | Phase 4 | Examination, Fees, Notification |

**Supervisors:** Dr. L. Sivaramakrishnan, Mr. Joy Deep Roy

## Architecture

The API Gateway is the public entry point. It routes `/auth` to the auth service, `/students` to the student service, `/courses` to the course service, and `/faculty` to the faculty service. Auth issues JWTs; protected services verify those tokens locally using the shared `JWT_SECRET`.

Each service has its own PostgreSQL database and migration directory. Compose starts a separate database container for each service on the shared `erp-network`.

| Component | Container port | Database |
|---|---:|---|
| API Gateway | 8080 | — |
| Auth Service | 4000 | `erp_auth` |
| Student Service | 4001 | `students_db` |
| Course Service | 4002 | `courses_db` |
| Faculty Service | 4004 | `faculty_db` |

## Tech Stack

- **Backend:** Node.js 20, Express
- **Database:** PostgreSQL (one per service)
- **Auth:** JWT, bcrypt
- **Containers:** Docker, Docker Compose
- **CI:** GitHub Actions

## Getting Started

Copy `.env.example` to `.env` and replace the local placeholder values, especially `DB_PASS` and `JWT_SECRET`. Then start the services:

```bash
docker compose up --build
```

The gateway health check is `GET http://localhost:8080/health`. Direct service health checks are available at ports 4000, 4001, and 4002 on `/health`.

## Demo data

With the Docker Compose services running, seed the gateway with a demo admin account and sample records across students, courses, attendance, faculty, exams, results, fees, and notifications. From the repository root, run this in PowerShell:

```powershell
.\scripts\seed-demo.ps1
```

The script waits for the gateway, registers (or reuses) `admin.demo@example.edu`, promotes that account in the auth database, and logs in before creating records. It skips matching records, so it can be rerun safely. Override the defaults when needed:

```powershell
.\scripts\seed-demo.ps1 -BaseUrl http://localhost:8080 -Email demo.admin@example.edu -Password 'YourDemoPassword123!' -Name 'Demo Administrator'
```

The chosen password must be at least eight characters. Keep demo credentials for local development only.

## API Endpoints

All paths below are through the gateway. Student and course endpoints require `Authorization: Bearer <token>`, except their public health checks. Reads accept any valid token. Create, update, and delete require a token with role `admin`.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a user |
| POST | `/auth/login` | Public | Log in and receive a JWT |
| GET | `/students/health` | Public | Student service and database health |
| POST | `/students` | Admin | Create a student |
| GET | `/students?page=1&limit=20` | Token | List students; supports `department`, `status`, `year_of_study`, and `q` filters |
| GET | `/students/:id` | Token | Get one student |
| PUT | `/students/:id` | Admin | Update a student |
| DELETE | `/students/:id` | Admin | Mark a student inactive |
| GET | `/courses/health` | Public | Course service and database health |
| POST | `/courses` | Admin | Create a course |
| GET | `/courses?page=1&limit=20` | Token | List courses; supports `department`, `semester`, `status`, and `q` filters |
| GET | `/courses/:id` | Token | Get one course |
| PUT | `/courses/:id` | Admin | Update a course |
| DELETE | `/courses/:id` | Admin | Archive a course |
| GET | `/faculty/health` | Public | Faculty service and database health |
| POST | `/faculty` | Admin | Create a faculty member |
| GET | `/faculty?page=1&limit=20` | Token | List active faculty; supports the `department` filter |
| GET | `/faculty/:id` | Token | Get one faculty member |
| PUT | `/faculty/:id` | Admin | Update a faculty member |
| DELETE | `/faculty/:id` | Admin | Archive a faculty member |

For example, after obtaining a JWT from `/auth/login`, list students with:

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:8080/students?page=1&limit=20"
```

## Tests

The student and course services use Jest and Supertest with mocked PostgreSQL connections:

```bash
npm ci --prefix services/student-service
npm test --prefix services/student-service
npm ci --prefix services/course-service
npm test --prefix services/course-service
npm ci --prefix services/faculty-service
npm test --prefix services/faculty-service
```

## Project Status

Phases 1 and 2 (foundation, auth, student management, and course management) are in progress. Phases 3 and 4 are planned.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch naming and PR rules.

## License

MIT — see [LICENSE](./LICENSE).

## Known limitations

- The auth service's `/register` endpoint currently lets the caller choose any role, including `admin`. Student and course services enforce admin-only writes correctly, but until registration is restricted, any caller can obtain an admin token. Planned fix: restrict role assignment in auth-service (separate PR).
- No automated tests exist yet for auth-service or the gateway.
