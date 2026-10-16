import { freshData } from './model.mjs';
export function useCityCatalogue() { return 0; }
export function useCityCatalogueRefresh() { return 0; }
function data() { try { return JSON.parse(sessionStorage.getItem('directory-workspace-demo')) || freshData(); } catch { return freshData(); } }
export function listenPublicBusinesses(onData) { const timer = setTimeout(() => onData({ businesses: data().publicBusinesses, fromCache: false }),20); return () => clearTimeout(timer); }
export function listenPublicPromotions(onData) { const timer = setTimeout(() => onData({ promotions: data().publicPromotions, fromCache: false }),20); return () => clearTimeout(timer); }
