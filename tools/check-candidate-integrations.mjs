// Compile gated production routes without enabling a release or contacting Firebase.
import { build } from 'vite';
import path from 'node:path';
import config from '../vite.config.js';
await build({ ...config, configFile:false, plugins:config.plugins.slice(0,1),
  resolve:{ ...config.resolve,preserveSymlinks:true },
  define:{ ...config.define,'import.meta.env.VITE_EVENT_REGISTRATION_ENABLED':'"true"',
    'import.meta.env.VITE_DYNAMIC_CITY_CATALOGUE_ENABLED':'"true"','import.meta.env.VITE_CITY_MANAGEMENT_ENABLED':'"true"',
    'import.meta.env.VITE_PROMOTION_AUDIENCE_ENABLED':'"true"','import.meta.env.VITE_READ_ONLY_PREVIEW':'"false"' },
  build:{ ...config.build,outDir:path.resolve('.qa-integration-candidate'),emptyOutDir:true },
});
