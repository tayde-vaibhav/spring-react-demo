# spring-react-demo
## Structure
- backend/ — Spring Boot API
- frontend/ — React application
- docs/ — project notes and decisions
## Setup

Start the backend first:

```bash
cd backend/springreactdemo
./mvnw spring-boot:run
```

Then start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend requests `GET /api/app-test`. Vite proxies that request to the
backend's `GET http://localhost:8080/app-test` endpoint during development.
For another backend URL, set `VITE_API_BASE_URL` before starting the frontend.
