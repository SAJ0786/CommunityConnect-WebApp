import { getHijriDisplay, getHijriParts } from './src/services/hijriService.js';
console.log('2026-07-16 =>', getHijriDisplay('2026-07-16', []));
console.log('2026-07-16 parts =>', getHijriParts('2026-07-16', []));
console.log('2026-07-16 with sample overrides =>', getHijriDisplay('2026-07-16', [{ hYear: 1448, hMonth: 1, gDate: '2025-07-16' }]));
