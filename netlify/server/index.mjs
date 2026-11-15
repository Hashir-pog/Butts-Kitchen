// Netlify Server entry: start the existing Express app. src/server.js runs the
// database migration, then listens on process.env.PORT, which Netlify sets.
import '../../src/server.js';
