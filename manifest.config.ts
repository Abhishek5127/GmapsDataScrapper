import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

/**
 * Manifest V3 configuration for MapHarvest.
 *
 * @crxjs/vite-plugin consumes this object, bundles the referenced
 * TypeScript entry points (service worker, content scripts, HTML pages)
 * and emits a fully-formed manifest.json into the build output.
 *
 * Only the permissions strictly required by the feature set are requested.
 */
export default defineManifest({
  manifest_version: 3,
  name: 'MapHarvest',
  version: pkg.version,
  description: pkg.description,

  // Minimal permission surface.
  permissions: ['activeTab', 'storage', 'tabs', 'scripting'],

  // Google Maps for the dedicated scraper + all URLs for the generic
  // website scraper. Host permissions are required so content scripts and
  // chrome.scripting can run on these origins.
  host_permissions: ['https://www.google.com/maps/*', '<all_urls>'],

  action: {
    default_title: 'MapHarvest',
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'icons/icon16.png',
      '32': 'icons/icon32.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  },

  icons: {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },

  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },

  options_page: 'src/options/index.html',

  content_scripts: [
    {
      // Dedicated Google Maps scraper.
      matches: ['https://www.google.com/maps/*'],
      js: ['src/content/maps-scraper.ts'],
      run_at: 'document_idle',
    },
    {
      // Generic website scraper for everything else.
      matches: ['<all_urls>'],
      js: ['src/content/website-scraper.ts'],
      run_at: 'document_idle',
    },
  ],

  web_accessible_resources: [
    {
      resources: ['src/dashboard/index.html'],
      matches: ['<all_urls>'],
    },
  ],
});
