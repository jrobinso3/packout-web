# GitHub Pages Deployment Configuration

This document outlines the final, fully automated continuous deployment (CD) configuration for the Packout 3D Configurator Vite application.

## Overview

The application is deployed using **GitHub Actions**. Any code pushed to the `main` branch is automatically built via Vite and published securely to the GitHub Pages environment.

## 1. Vite Configuration (`vite.config.js`)

When deploying a Vite application to a GitHub Pages subpath (e.g., `https://username.github.io/repo-name/`), the `base` path must be specified to ensure that Vite correctly links the compiled `.js` and `.css` files.

```javascript
export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: '/packout-web/', // Matches the GitHub repository name
})
```

## 2. Dynamic Asset Paths (`src/App.jsx`)

When fetching assets dynamically at runtime (like 3D models from the `public` folder) the raw string `/displays/Floorstand_3S.glb` will result in a 404 error on GitHub Pages because it targets the root URL instead of the repository's subpath.

To resolve this, we prepend Vite's built-in environment variable `import.meta.env.BASE_URL`, which dynamically calculates the correct root regardless of whether you are running the app locally or in production:

```javascript
const [displayUrl, setDisplayUrl] = useState(`${import.meta.env.BASE_URL}displays/Floorstand_3S.glb`)
```

## 3. GitHub Actions Workflow (`.github/workflows/deploy.yml`)

Instead of manually deploying via a `gh-pages` branch, we use an automated pipeline. This skips the need to run `npm run deploy` locally. 

The workflow performs the following steps:
1. **Checks out the repository.**
2. **Sets up Node.js 22** (using the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` flag to silence Node 20 deprecation warnings on older GitHub Actions components).
3. **Configures GitHub Pages** (`actions/configure-pages@v4`) - This binds the workflow securely to your repository's environment router.
4. **Installs Modules & Builds** (`npm install && npm run build`).
5. **Uploads the `dist/` directory** artifact securely to the GitHub runners.
6. **Deploys** the bundled asset directly to the live GitHub Pages site.

## 4. Repository Settings

For the automated workflow to successfully bind the web hosting to the repository, the following setting must be hard-locked in the repository settings:

1. Navigate to **Settings** > **Pages**
2. Under "Build and deployment", ensure the **Source** dropdown menu is set exclusively to **GitHub Actions**. *(If this is set to "Deploy from a branch", the live site will crash by attempting to serve raw uncompiled `.jsx` repository source code).*

---
**Deployment Workflow**: To publish a new update, simply commit your changes and run `git push`. The GitHub Action handles everything else automatically.
