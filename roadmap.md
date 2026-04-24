# Packout Web — Enterprise Roadmap

---

## Executive Summary

*For administrators and decision-makers. No technical background required.*

**What is this application?**
Packout Web is an interactive 3D display configurator. Sales teams and clients use it to design retail product displays — placing products on fixtures, adjusting materials and branding, and exporting photorealistic images or augmented-reality previews. It runs entirely in a web browser with no installation required.

**What is the current state?**
The application works well as a design and demonstration tool. However, it is currently hosted on GitHub Pages — a free, public, static file host with no user accounts, no security controls, and no ability to save work to a shared server. This means:

- Anyone with the URL can access it
- Work saved by one user is invisible to everyone else — it exists only in that user's browser
- There is no way to know who is using the tool or how
- Custom products and configurations uploaded by a client cannot be shared with their team
- There is no access control — no way to restrict who can view, edit, or manage content

**What needs to happen to make this production-ready for clients?**
Four things are required, in plain terms:

| # | What | Why it matters |
|---|------|---------------|
| 1 | **User accounts with single sign-on (SSO)** | Clients log in with their existing Microsoft/corporate credentials. No new passwords. Access can be granted or revoked instantly. |
| 2 | **Cloud storage for products and configurations** | Work saved by one user is immediately visible to their whole team. Custom product uploads are stored securely in the cloud, not in a single browser. |
| 3 | **Role-based access control** | Different people get different permissions. A client administrator can manage their own product library. A viewer can only browse and configure. Your team controls everything. |
| 4 | **Professional cloud hosting on Microsoft Azure** | The app moves from a free public host to enterprise infrastructure with security, uptime guarantees, monitoring, and the ability to scale as client numbers grow. |

**What does this cost and how long does it take?**
At expected usage volumes, Azure infrastructure costs are modest — typically in the range of **$50–$200/month** depending on the number of active clients and how much 3D model data is stored. The migration work is estimated at **6–10 weeks of development time**, broken into five phases described later in this document.

**What do you need to decide before work begins?**
One key business question must be answered first: *How are products scoped?* Specifically — when a client uploads a custom product, should it be visible only to that client's organization, or can it be shared across all clients? This decision shapes the data architecture and cannot easily be changed later.

---

## Technical Architecture

### System Diagram

```
Browser (React / Vite / Three.js)
    │
    │  Login via Microsoft Entra ID (SSO)
    ▼
Azure Static Web Apps  ──── Global CDN ────▶ all users
    │
    │  /api/* routes (serverless, built into Static Web Apps)
    ▼
Azure Functions (Node.js — the application's backend)
    │              │                  │
    ▼              ▼                  ▼
Cosmos DB     Blob Storage       Microsoft Entra ID
(products,    (3D models,        (login, user roles,
 sessions)     textures,          access control)
               thumbnails)
                   │
                   ▼
             Key Vault          Application Insights
             (secrets)          (monitoring & alerts)
```

### Component Responsibilities

**Azure Static Web Apps**
Hosts the compiled React/Vite application. Provides a global CDN so the app loads fast for users anywhere. Automatically issues and renews SSL certificates. Creates a live preview URL for every pull request, so new features can be reviewed before going live. Replaces GitHub Pages with zero changes to the frontend build process.

**Azure Functions**
The serverless backend. Handles all write operations: saving products to the database, storing uploaded 3D model files, managing display thumbnails. Each operation validates the user's identity token before doing anything. During local development, the existing Vite dev-server middleware continues to handle these routes — no disruption to the development workflow.

**Azure Cosmos DB**
The product database. Replaces the current `products.json` flat file. Products are scoped by organisation, so each client sees only their own library. The app's existing local IndexedDB cache continues to work as a fast offline layer on top of Cosmos.

**Azure Blob Storage**
File storage for all uploaded assets: GLB 3D models, PNG textures, display thumbnails. Replaces the current local `public/products/` directory. Files are served via CDN-backed URLs that work exactly like the current relative paths.

**Microsoft Entra ID**
Identity and access management. Handles login via SSO (Microsoft accounts, corporate Azure AD, or external accounts via Entra External ID). Issues JWT tokens that the Functions validate on every request. App Roles (`Admin`, `Editor`, `Viewer`) control what each user can do.

**Azure Key Vault**
Stores secrets (database connection strings, storage keys) so they never appear in code or environment variable files. Functions access Key Vault via Managed Identity — no passwords in the application itself.

**Application Insights + Log Analytics**
Observability. Tracks errors, performance, and usage across both the frontend and backend. Alerts can be configured for failures or unusual activity.

---

## What Changes in the Codebase

### 1. Authentication (`src/main.jsx`, `src/App.jsx`)

Add the Microsoft Authentication Library (`@azure/msal-browser`, `@azure/msal-react`). Wrap the application in an `MsalProvider` with the Entra App Registration configuration. Add `AuthenticatedTemplate` / `UnauthenticatedTemplate` wrappers so unauthenticated users see a login screen instead of the configurator.

### 2. API Calls (`src/hooks/useProductLibrary.js`, `src/components/CustomProductCreator.jsx`)

Every fetch call to `/api/*` gains an `Authorization: Bearer <token>` header, obtained from the MSAL hook. The endpoints themselves (`save-product`, `upload-texture`, `upload-model`, etc.) remain identical in name and contract — only the backend implementation changes.

### 3. Asset URL Resolution (`src/utils/textureUtils.js`)

`resolveAssetUrl` already handles absolute `http` URLs correctly. Blob Storage URLs are absolute, so no changes are required here.

### 4. Product Library (`src/hooks/useProductLibrary.js`)

`fetchLibrary` currently reads from a local `products.json` file. It will instead call a `GET /api/products` Function that queries Cosmos DB for the authenticated user's organisation. The local IndexedDB cache layer remains in place for performance.

### 5. Session Persistence (`src/utils/idbUtility.js`, `src/App.jsx`)

Browser IndexedDB session storage (placements, material configs, pricing) can remain local for single-user continuity, or optionally be synced to Cosmos DB to enable cross-device session roaming. This is a product decision.

### 6. Vite Config (`vite.config.js`)

`base` is already configurable via `VITE_BASE_URL` environment variable. On Azure Static Web Apps, this is set to `/`. The Vite dev-server middleware (`configureServer`) continues to serve the persistence API routes during local development, unchanged.

---

## Migration Phases

### Phase 1 — Azure Static Web Apps Deployment
*~1 week*

Deploy the existing application to Azure Static Web Apps with a GitHub Actions workflow. The app functions identically to the current GitHub Pages deployment, but is now on Azure infrastructure with CI/CD, PR preview environments, and a foundation for everything that follows. No code changes.

**Outcome:** App lives on Azure. Every push to `main` deploys automatically. PRs get live preview URLs.

---

### Phase 2 — Identity & SSO
*~1–2 weeks*

Register the application in Microsoft Entra ID. Add MSAL to the React frontend. Users must log in to access the configurator. Sessions are tied to identity. No backend changes — the app still uses IDB and the dev-server API.

**Outcome:** The app is access-controlled. Only authorised users can open it. Login uses existing Microsoft credentials.

---

### Phase 3 — Functions + Blob Storage
*~2–3 weeks*

Migrate the six Vite dev-server middleware routes to Azure Functions. Uploaded textures and 3D models are stored in Azure Blob Storage instead of the local filesystem. The `finalUrl` stored in products becomes a Blob Storage URL.

**Outcome:** Uploaded files are stored in the cloud. They persist across sessions and are accessible from any device.

---

### Phase 4 — Cosmos DB (Cross-user Product Sync)
*~2 weeks*

Replace the `products.json` flat file with Cosmos DB. Products are scoped by organisation. When one user adds or edits a product, all users in their organisation see the change immediately. The IndexedDB cache continues to work as a fast local layer.

**Outcome:** Product libraries are shared across a client's whole team. Custom products uploaded by one user are visible to everyone in the same organisation.

---

### Phase 5 — Security Hardening & Observability
*~1 week*

- Apply Entra App Roles (`Admin`, `Editor`, `Viewer`) and enforce them in Functions
- Move all connection strings to Key Vault; use Managed Identity
- Add Content Security Policy headers via `staticwebapp.config.json`
- Add server-side file validation (MIME type, size limits) on upload Functions
- Instrument frontend and backend with Application Insights
- Configure alerts for errors and Cosmos RU spikes

**Outcome:** The application meets enterprise security standards. Usage and errors are fully visible. Secrets are never in code.

---

## Infrastructure Cost Estimate

| Service | Tier | Estimated monthly cost |
|---------|------|----------------------|
| Azure Static Web Apps | Standard | ~$9 |
| Azure Functions | Consumption (pay-per-call) | ~$0–$10 |
| Azure Cosmos DB | Serverless | ~$5–$30 (scales with usage) |
| Azure Blob Storage | LRS, hot tier | ~$2–$20 (scales with stored data) |
| Azure Key Vault | Standard | ~$1 |
| Application Insights | Pay-per-GB | ~$5–$20 |
| Microsoft Entra ID | Free tier (up to 50,000 MAU) | $0 |
| **Total** | | **~$22–$90/month** |

Costs scale with the number of active users and the volume of 3D model data stored. A deployment serving 10–50 active client users with a moderate product library is comfortably within the lower end of this range.

---

## Key Decision Required Before Starting

**Product visibility scope:** When a user within a client organisation uploads a custom product (a GLB model or texture), who should be able to see it?

- **Option A — Organisation-scoped:** All users in the same client org see all products uploaded by anyone in that org. Simplest to manage; best for team collaboration.
- **Option B — User-scoped with sharing:** Products are private by default; the owner can promote them to org-wide visibility. More control; more complexity.
- **Option C — Global catalogue:** All clients share one product library managed by your team. Custom client products are not supported. Simplest architecture.

This decision must be made before Phase 4 begins, as it determines the Cosmos DB data model and cannot be changed cheaply after data is in production.
