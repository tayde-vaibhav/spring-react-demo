# Application Architecture

This diagram describes the React, Spring Boot, and MongoDB application architecture based on the current source implementation.

```mermaid
flowchart TB
    Browser["Browser"]

    subgraph Frontend["React + TypeScript Frontend"]
        Pages["Login, Dashboard and Product Pages"]
        Auth["AuthContext"]
        API["API Client"]
        Cache["TanStack Query Cache"]
    end

    subgraph Backend["Spring Boot Backend"]
        Security["Spring Security Filter Chain"]
        JWT["Cookie-based JWT Authentication"]
        CSRF["CSRF Protection"]
        Access["Role-based Authorization"]

        AuthController["AuthController"]
        AuthService["AuthService"]

        ProductController["ProductController"]
        ProductService["ProductService"]
        ProductMapper["ProductMapper"]

        ProductRepo["ProductRepository"]
        UserRepo["UserRepository"]
        MongoTemplate["MongoTemplate"]
    end

    Mongo[("MongoDB")]

    Browser --> Pages
    Pages --> Auth
    Pages --> Cache
    Pages --> API
    Auth --> API

    API -->|"HTTP JSON; cookies included"| Security

    Security --> JWT
    Security --> CSRF
    Security --> Access

    Security --> AuthController
    Security --> ProductController

    AuthController --> AuthService
    AuthService --> UserRepo

    ProductController --> ProductService
    ProductService --> ProductMapper
    ProductService --> ProductRepo
    ProductService --> MongoTemplate

    UserRepo --> Mongo
    ProductRepo --> Mongo
    MongoTemplate --> Mongo
```

## Security boundaries

The frontend sends authenticated requests with browser-managed cookies. The backend resolves JWT authentication from cookies and applies CSRF protection to unsafe HTTP methods.

Spring Security enforces role-based authorization:

| Operation                                   | Required access |
| ------------------------------------------- | --------------- |
| Login and CSRF token retrieval              | Public          |
| Current user and logout                     | Authenticated   |
| Product listing and detail                  | USER or ADMIN   |
| Product creation, modification and deletion | ADMIN           |
| Product statistics                          | Authenticated   |

Authentication and authorization are enforced on the backend. Frontend role checks are user-interface controls, not substitutes for backend authorization. JWT authentication, CSRF validation, and authorization are conceptual responsibilities of the Spring Security processing chain, not independent network services.

## Scope

This is a logical component diagram, not a deployment topology. It does not assert that a reverse proxy, load balancer, external identity provider, or production infrastructure is deployed.
