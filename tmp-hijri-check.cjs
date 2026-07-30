const { getHijriDisplay, getHijriParts, hijriToGregorian } = require('./src/services/hijriService.js');
console.log('2026-07-16 =>', getHijriDisplay('2026-07-16', []));
console.log('2026-07-16 parts =>', JSON.stringify(getHijriParts('2026-07-16', []))); 
console.log('1 Safar 1448 =>', hijriToGregorian(1,2,1448, []));
