# CampusFlow frontend

A small React and Vite interface for demonstrating the College ERP services. The browser uses the Vite `/api` development proxy, which forwards requests to the API Gateway at `http://localhost:8080`. It does not connect directly to individual services.

## Run locally

Use Node.js 20.19+ or 22.12+ for the frontend toolchain.

Start the backend stack from the repository root:

```powershell
docker compose up --build
```

Then start the frontend in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`) and sign in with an account registered in the auth service. The login response's JWT and user record are saved in browser local storage; sign out removes both. The development proxy target is configured in `vite.config.js`.

The exam service hosts results at its own `/results` path. Since the gateway strips the `/results` proxy prefix, the frontend uses `/exams/results`, which the `/exams` gateway proxy forwards to the correct exam-service route.

## Available sections

The dashboard reads counts from real service list responses. Management pages use the fields, routes, and role permissions defined by the backend. Unsupported actions (such as editing notifications) are not shown. Service errors and empty responses are displayed in the interface.
