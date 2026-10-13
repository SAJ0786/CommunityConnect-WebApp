// One-off mechanical migration of the shared shell and new directory. Deliberately
// does not rewrite older feature pages or third-party map/provider brand colours.
import fs from 'node:fs';
const groups = {
  background: ['#f8faf9','#f8f9fa','#f8fafc','#f6fbfa','#f8fcfb','#eef5f4','#e9eeed'],
  surface: ['#fff'],
  heading: ['#071733'],
  text: ['#172b36'],
  muted: ['#37534e','#455e68','#536772','#64748b','#7b8794'],
  'accent-strong': ['#0f766e','#0f817a','#0b5f59','#09645f','#0f4f4a','#0b5d57'],
  'accent-soft': ['#eaf7f5','#e6f4f1','#edf5f3','#e9fbf8','#f1f5f4'],
  border: ['#dce7e5','#b8c8c6','#cedcd9','#cce0db','#b8cbc6','#dce5e2','#e3ece9','#edf2f0','#e8edec','#e5e7eb'],
  'disabled-surface': ['#f0f2f5','#e4e7eb'],
  danger: ['#b42318','#8f1d14','#ef4444','#b91c1c','#991b1b','#7f1d1d','#dc2626','#e74c3c'],
  'danger-soft': ['#fff7f6','#fef2f2','#fee2e2'],
  'danger-border': ['#fecaca','#f2b8b8','#fca5a5'],
  primary: ['#2463eb'],
  'primary-soft': ['#eef4ff','#eff6ff'],
  'primary-border': ['#bfdbfe'],
  'primary-strong': ['#1e40af'],
  warning: ['#f59e0b'],
  'warning-strong': ['#b45309','#92400e'],
  'warning-soft': ['#fffbeb'],
  success: ['#16a34a'],
  'success-soft': ['#f0fdf4'],
  'accent-border': ['#a9dfbf','#acd9d5','#afc7c4','#bfd8d5','#c6dedb','#a9d8d3','#b7d8d4','#99d6cf','#bbf7d0'],
  'shadow-color': ['#133b3008','rgba(0,0,0,0.05)','rgba(26,26,46,0.08)'],
  'shadow-strong': ['rgba(15,118,110,.18)','rgba(15,118,110,0.28)','rgba(15,118,110,0.38)','rgba(15, 118, 110, 0.2)','rgba(15,118,110,0.4)','rgba(15,118,110,0.8)','rgba(15,118,110,0.22)','rgba(15,118,110,0.5)','rgba(15,118,110,0.9)','rgba(180,83,9,.5)','rgba(0,0,0,0.2)','rgba(0,0,0,0.22)','rgba(26,26,46,0.16)'],
  'focus-glow': ['rgba(15,118,110,0.12)','rgba(15, 118, 110, 0.12)'],
  'danger-glow': ['rgba(180,35,24,0.10)','rgba(231,76,60,0.28)'],
  'glass-border': ['rgba(255,255,255,0.82)'],
  glass: ['rgba(255,255,255,.72)'],
};
const lookup = Object.fromEntries(Object.entries(groups).flatMap(([token, colors]) => colors.map(color => [color.toLowerCase(), `var(--cc-${token})`])));
const files = ['src/styles/theme.css','src/styles/directory.css','src/App.jsx','src/components/Header.jsx','src/pages/AuthPage.jsx'];
const updates = files.map(file => {
  const source = fs.readFileSync(file, 'utf8');
  const next = source.replace(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g, color => {
    if (!lookup[color.toLowerCase()]) throw new Error(`Unmapped colour ${color} in ${file}`);
    return lookup[color.toLowerCase()];
  }).replace(/(['"])white\1/g, '$1var(--cc-on-primary)$1')
    .replace(/solid white/g, 'solid var(--cc-surface)')
    .replace(/(:\s*)white(?=\s*[;}])/g, '$1var(--cc-on-primary)')
    .replace(/(background:\s*['"]?)var\(--cc-on-primary\)/g, '$1var(--cc-surface)');
  return [file, next];
});
for (const [file, source] of updates) { fs.writeFileSync(file, source); console.log(`Tokenised ${file}`); }
