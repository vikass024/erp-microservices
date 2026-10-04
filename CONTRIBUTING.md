# Contributing Guide

## Branches
- `main` — stable, working code only
- `develop` — integration branch, all work merges here first
- `feature/<service>-<task>` — one branch per task, e.g. `feature/auth-login-api`

## Workflow
1. `git checkout develop && git pull origin develop`
2. `git checkout -b feature/<service>-<task>`
3. Make your changes, test locally with `docker compose up --build`
4. `git add . && git commit -m "<service>: <what changed>"`
5. `git push origin feature/<service>-<task>`
6. Open a Pull Request into `develop` (not `main`)

## Rules
- No direct commits to `main`.
- Pull the latest `develop` before starting new work.
- Never commit `.env` files or secrets — use `.env.example` instead.
- Commit messages follow `service: short description`.