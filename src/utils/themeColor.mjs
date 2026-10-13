// Standalone SVG images cannot inherit page CSS variables. Resolve at render time
// so Google Maps pins follow the same central palette as their HTML legend.
export function resolveThemeColor(value) {
  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}
