
// These candidate features remain off until separate backend/device release approval.
export const PROMOTION_AUDIENCE_ENABLED = import.meta.env?.VITE_PROMOTION_AUDIENCE_ENABLED === 'true' && import.meta.env?.VITE_READ_ONLY_PREVIEW !== 'true';
export const REGISTRATION_ENABLED = import.meta.env?.VITE_EVENT_REGISTRATION_ENABLED === 'true' && import.meta.env?.VITE_READ_ONLY_PREVIEW !== 'true';
export const CITY_CATALOGUE_ENABLED = import.meta.env?.VITE_DYNAMIC_CITY_CATALOGUE_ENABLED === 'true';
export const CITY_MANAGEMENT_ENABLED = CITY_CATALOGUE_ENABLED && import.meta.env?.VITE_CITY_MANAGEMENT_ENABLED === 'true' && import.meta.env?.VITE_READ_ONLY_PREVIEW !== 'true';
