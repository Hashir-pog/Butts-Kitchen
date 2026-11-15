// Netlify Server entry. The build (scripts/build-server.mjs) bundles src/server.js and its
// dependencies into server.bundle.cjs, which runs the migration and listens on process.env.PORT.
import './server.bundle.cjs';
