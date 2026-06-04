// YouTube Data API v3 — Live stream detection
const YT_API_KEY    = import.meta.env.VITE_YOUTUBE_API_KEY;
const YT_CHANNEL_ID = import.meta.env.VITE_YOUTUBE_CHANNEL_ID;

// Returns the live video URL if channel is actively streaming, otherwise null
export async function getChannelLiveUrl() {
  if (!YT_API_KEY || !YT_CHANNEL_ID) {
    console.warn('[YouTube] API key or channel ID missing');
    return null;
  }
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YT_CHANNEL_ID}&eventType=live&type=video&key=${YT_API_KEY}`
    );
    const data = await res.json();
    console.log('[YouTube] Live check response:', res.status, JSON.stringify(data).slice(0, 200));
    if (!res.ok) {
      // If API call fails (e.g. domain restriction on preview), fall back to channel live page
      console.warn('[YouTube] API error, falling back to channel live page:', data?.error?.message);
      return getChannelLivePage();
    }
    const videoId = data.items?.[0]?.id?.videoId;
    if (!videoId) return null;
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch (e) {
    console.warn('[YouTube] Live check failed:', e.message);
    return null;
  }
}

// Returns true only if channel is actively live on YouTube right now
export async function isChannelLive() {
  const url = await getChannelLiveUrl();
  return url !== null;
}

// Returns the channel live page URL (always works, shows live if active)
export function getChannelLivePage() {
  return `https://www.youtube.com/channel/${YT_CHANNEL_ID}/live`;
}

// Returns a YouTube embed URL for a live stream video
export function getEmbedUrl(videoId) {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
}
