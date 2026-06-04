// Daily.co streaming service
const DAILY_API_KEY    = '353a255ae48c3435554a69e0677351a4f5159bde70067af992630667ebd7e9f0';
const DAILY_DOMAIN     = 'communityevents.daily.co';
const DAILY_API_BASE   = 'https://api.daily.co/v1';

// Create a new Daily.co room for an event
export async function createStreamRoom(eventId) {
  const roomName = `ce-event-${eventId}`;
  const res = await fetch(`${DAILY_API_BASE}/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      name: roomName,
      properties: {
        enable_chat: false,
        enable_knocking: false,
        // Viewers start with cam/mic off and cannot turn them on
        start_video_off: true,
        start_audio_off: true,
        exp: Math.floor(Date.now() / 1000) + (6 * 60 * 60), // 6 hours
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Room may already exist — return existing URL
    if (err.error === 'invalid-request-error' || err.info?.includes('already exists')) {
      return getRoomUrl(roomName);
    }
    throw new Error(err.info || 'Failed to create room');
  }
  const data = await res.json();
  return data.url;
}

// Get existing room URL
export async function getRoomUrl(roomName) {
  const res = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
    headers: { 'Authorization': `Bearer ${DAILY_API_KEY}` },
  });
  if (!res.ok) throw new Error('Room not found');
  const data = await res.json();
  return data.url;
}

// Create a meeting token for the HOST (cam + mic enabled)
export async function createHostToken(roomName) {
  const res = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: true,
        start_video_off: false,
        start_audio_off: false,
        enable_recording: 'local',
        exp: Math.floor(Date.now() / 1000) + (6 * 60 * 60),
      },
    }),
  });
  if (!res.ok) throw new Error('Failed to create host token');
  const data = await res.json();
  return data.token;
}

// Create a meeting token for a VIEWER (cam + mic locked off)
export async function createViewerToken(roomName) {
  const res = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: false,
        start_video_off: true,
        start_audio_off: true,
        // Viewers cannot unmute themselves
        enable_screenshare: false,
        exp: Math.floor(Date.now() / 1000) + (6 * 60 * 60),
      },
    }),
  });
  if (!res.ok) throw new Error('Failed to create viewer token');
  const data = await res.json();
  return data.token;
}

// Delete room when stream ends
export async function deleteStreamRoom(eventId) {
  const roomName = `ce-event-${eventId}`;
  await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${DAILY_API_KEY}` },
  }).catch(() => {}); // silently ignore if room doesn't exist
}

// Build watch URL for viewers (with viewer token — no mic/camera)
export function getWatchUrl(roomUrl) {
  return roomUrl; // Daily.co handles viewer mode via UI
}

export { DAILY_DOMAIN };
