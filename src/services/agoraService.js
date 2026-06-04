// Agora.io streaming service
// App ID: 90bb7ae75fde493691603e2797fb3c72
// Mode: Testing (no token server needed)

export const AGORA_APP_ID = '90bb7ae75fde493691603e2797fb3c72';

// Each event gets a unique channel name
export function getChannelName(eventId) {
  return `ce-${eventId}`.slice(0, 64); // Agora max 64 chars
}

// Load Agora Web SDK dynamically (CDN — no npm install needed)
let agoraSDK = null;
export async function loadAgora() {
  if (agoraSDK) return agoraSDK;
  // Load from CDN
  await new Promise((resolve, reject) => {
    if (window.AgoraRTC) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js';
    script.onload  = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  agoraSDK = window.AgoraRTC;
  return agoraSDK;
}
