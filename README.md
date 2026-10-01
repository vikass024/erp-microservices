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

Each module of the ERP (Auth, Students, Courses, Attendance, Faculty, Exams, Fees, Notifications) runs as its own microservice with its own database, so services can be built, tested, and deployed independently. An API Gateway is the single entry point that routes requests to the correct service.

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** PostgreSQL (one per service)
- **Auth:** JWT, bcrypt
- **Containers:** Docker, Docker Compose
- **CI:** GitHub Actions

## Getting Started

```bash
git clone https://github.com/vikass024/erp-microservices.git
cd erp-microservices
docker compose up --build
```

Health check: `GET http://localhost:8080/health`

## API Endpoints (Auth Service, via Gateway)

| Method | Endpoint | Description |
|---|---|---|
| POST | /auth/register | Create a new user |
| POST | /auth/login | Returns a JWT on success |

## Project Status

Phase 1 (Foundation + Auth) complete. Phases 2–4 in progress.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch naming and PR rules.

## License

MIT — see [LICENSE](./LICENSE).