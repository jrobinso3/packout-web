# Packout Web — 3D Display Configurator

Packout Web is an enterprise-grade, interactive 3D application designed for sales teams and retail planners to visualize, configure, and optimize product displays in a photorealistic browser environment.

## Key Functions

- **Interactive 3D Workspace**: Real-time placement and manipulation of products on standard retail fixtures.
- **Library Management**: Intelligent product and display galleries supporting custom GLB model uploads and texture application.
- **Refine Asset Studio**: Precision control over asset orientation, scaling, and material properties.
- **Provide Structured Reference for Generative AI to Apply Art**: PNG export creates clean images that can be manipulated by AI to apply art to displays as part of a large Hub Workflow.
- **Persistant Sessions**: Browser-based state management ensures configurations are saved locally via IndexedDB.
- **High-Quality Export**: Capture and download high-fidelity renders for presentations.

## Technical Architecture

The application is built on a modern, modular stack designed for high performance and visual fidelity:

- **Frontend**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **3D Engine**: [Three.js](https://threejs.org/) via [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) and [@react-three/drei](https://github.com/pmndrs/drei)
- **State Management**: Context-driven modular architecture (`ConfiguratorContext`)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Persistence**: [IndexedDB (IDB)](https://github.com/jakearchibald/idb) for local asset and configuration storage
- **Data Engineering**: Integration with `xlsx` for bulk product metadata management

## Azure Migration & Enterprise Roadmap

Currently hosted on GitHub Pages for rapid iteration, the application is designed for seamless migration to a secure, multi-tenant enterprise environment on Microsoft Azure.

Detailed instructions and the phased transition plan can be found in the:
**[Enterprise Roadmap & Azure Migration Guide](./roadmap.md)**

### Proposed Azure Stack:
- **Hosting**: Azure Static Web Apps (CDN-backed frontend)
- **Backend**: Azure Functions (Serverless Node.js API)
- **Database**: Azure Cosmos DB (Multi-tenant product libraries)
- **Storage**: Azure Blob Storage (3D assets and textures)
- **Identity**: Microsoft Entra ID (Single Sign-On / SSO)

---

## Getting Started

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build
```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

