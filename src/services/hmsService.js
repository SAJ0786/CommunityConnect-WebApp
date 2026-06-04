// 100ms Live Streaming Service — per-event dynamic rooms
const HMS_ACCESS_KEY  = '6a1a128d3894cc965ea4d4ad';
const HMS_APP_SECRET  = '1SsEdbdCC3Zxa88SElnygEQdjm6QDSPlXPWJ57-oeoy5-gLX4pq2CD9SuBawi-OGIzx5FAp2eNYmoUnhjvV69Y06Br0lcoPshYJAnawGpc3MyCn04SHcOXnKk5knG2-BvJEoR95PsRBMZpFM3rP0WjVw-39bZF6RHDpTKGRt0Yg=';
const HMS_SUBDOMAIN   = 'community-events-livestream';
const HMS_TEMPLATE_ID = '6a1aac6d6a2d2723ac9ef7fe'; // community-events template ID

// Default room for backwards compatibility
export const HMS_ROOM_ID         = '6a1aac6ed63b6068ded6fb07';
export const HMS_HOST_ROOM_CODE  = 'gop-dyjb-ixt';
export const HMS_CO_HOST_ROOM_CODE = 'wsl-iamw-obp';
export const HMS_VIEWER_ROOM_CODE  = 'eyt-ijtn-xrs';

// Base64url helper
function b64url(str) {
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

// Generate management token for server-side API calls
async function generateMgmtToken() {
  const now     = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg:'HS256', typ:'JWT' }));
  const payload = b64url(JSON.stringify({
    access_key: HMS_ACCESS_KEY,
    type:       'management',
    version:    2,
    iat:        now,
    exp:        now + 86400,
    jti:        `${now}-${Math.random().toString(36).slice(2)}`,
  }));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(HMS_APP_SECRET),
    { name:'HMAC', hash:'SHA-256' }, false, ['sign']
  );
  const sig    = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`));
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${payload}.${sigB64}`;
}

// Generate auth token for a specific room
export async function generateHMSToken(userId, role, roomId = HMS_ROOM_ID) {
  const now     = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg:'HS256', typ:'JWT' }));
  const payload = b64url(JSON.stringify({
    access_key: HMS_ACCESS_KEY,
    room_id:    roomId,
    user_id:    userId || `user_${Date.now()}`,
    role,
    type:       'app',
    version:    2,
    iat:        now,
    exp:        now + 21600,
    jti:        `${now}-${Math.random().toString(36).slice(2)}`,
  }));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(HMS_APP_SECRET),
    { name:'HMAC', hash:'SHA-256' }, false, ['sign']
  );
  const sig    = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`));
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${payload}.${sigB64}`;
}

// Create a new 100ms room for an event
export async function createEventRoom(eventId, eventName) {
  const token = await generateMgmtToken();
  const res = await fetch('https://api.100ms.live/v2/rooms', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name:        `event-${eventId}-${Date.now()}`,
      description: eventName || 'Community Event Live Stream',
      template_id: HMS_TEMPLATE_ID,
      region:      'in',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to create room');
  console.log('[HMS] Created room:', data.id, 'for event:', eventId);
  return data.id; // returns room UUID
}

// Get or create room codes for a specific room
export async function getRoomCodes(roomId) {
  const token = await generateMgmtToken();
  // First try to get existing codes
  const res = await fetch(`https://api.100ms.live/v2/room-codes/room/${roomId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  if (res.ok && data.data?.length > 0) {
    const hostCode   = data.data.find(c => c.role === 'broadcaster')?.code;
    const viewerCode = data.data.find(c => c.role === 'viewer-near-realtime')?.code;
    return { hostCode, viewerCode };
  }
  // Create new codes if none exist
  const createRes = await fetch(`https://api.100ms.live/v2/room-codes/room/${roomId}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  const created = await createRes.json();
  const hostCode   = created.data?.find(c => c.role === 'broadcaster')?.code;
  const viewerCode = created.data?.find(c => c.role === 'viewer-near-realtime')?.code;
  return { hostCode, viewerCode };
}

// Host URL — creates a new room for this event or uses existing one
export async function getHostUrl(userId, eventName, eventId, existingRoomId) {
  let roomId = existingRoomId;

  // Create a new room if this event doesn't have one yet
  if (!roomId) {
    roomId = await createEventRoom(eventId, eventName);
  }

  const token = await generateHMSToken(userId, 'broadcaster', roomId);
  const name  = encodeURIComponent(eventName || 'Live Event');

  // Use room ID directly in URL — each event has its own unique room
  return {
    url:    `https://${HMS_SUBDOMAIN}.app.100ms.live/meeting/${roomId}?auth_token=${token}&name=${name}&skip_preview=false`,
    roomId,
  };
}

// Viewer URL for a specific event's room
export async function getViewerUrl(userId, roomId) {
  if (!roomId) roomId = HMS_ROOM_ID;
  const token = await generateHMSToken(userId, 'viewer-near-realtime', roomId);
  const { viewerCode } = await getRoomCodes(roomId);
  const code = viewerCode || HMS_VIEWER_ROOM_CODE;
  return `https://${HMS_SUBDOMAIN}.app.100ms.live/meeting/${code}?auth_token=${token}&skip_preview=true&name=Viewer&ui_mode=hls-only&skip_setup=true&logo=false`;
}
