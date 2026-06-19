# Native Stream Relay — Deploy Guide

WebSocket → FFmpeg → YouTube RTMP bridge for Community Events Australia.
Runs on Google Cloud Run in australia-southeast1.

---

## Architecture

```
Phone browser (MediaRecorder chunks)
         ↓  WebSocket (binary)
  Cloud Run (this server)
         ↓  FFmpeg stdin pipe
  FFmpeg → libx264 + AAC → FLV
         ↓  RTMP
  YouTube Live (1080p 30fps)
```

---

## One-time setup

### 1 — Install Google Cloud CLI
Download from: https://cloud.google.com/sdk/docs/install

Then login:
```bash
gcloud auth login
gcloud config set project community-event-8b639
```

### 2 — Enable Cloud Run API
```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 3 — Deploy the container
```bash
cd streaming-relay
gcloud run deploy native-stream-relay \
  --source . \
  --region australia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 5 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --concurrency 10
```

Note the Service URL printed at the end — it will look like:
`https://native-stream-relay-xxxxxxxxxx-ts.a.run.app`

### 4 — Update the Cloud Function with the relay URL
In `functions/index.js`, find the `nativeStreamStart` function and update:
```javascript
const RELAY_URL = 'wss://native-stream-relay-xxxxxxxxxx-ts.a.run.app';
```
Note: use `wss://` (WebSocket secure) not `https://`

Then redeploy functions:
```bash
firebase deploy --only functions
```

### 5 — Grant Cloud Run access to Firestore
The relay server reads session tokens from Firestore.
Cloud Run uses its default service account automatically — no extra config needed
as long as the Firebase project matches.

---

## Cost estimate

Cloud Run charges only when actively processing (per-second billing):

| Usage | Estimated cost |
|---|---|
| 1 hour stream, 2 CPU, 2GB RAM | ~$0.15–0.25 AUD |
| 10 hours/month streaming | ~$1.50–2.50 AUD/month |
| Idle (min-instances=0) | $0.00 |

Vastly cheaper than StreamYard ($36/month) for the same or better quality.

---

## Testing locally (before deploying)

```bash
cd streaming-relay
npm install
# Set Firebase credentials for local testing
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
node server.js
```

Then in the Admin Dashboard test UI, use:
`ws://localhost:8080/stream?session=TEST`

---

## Updating after changes

```bash
cd streaming-relay
gcloud run deploy native-stream-relay --source . --region australia-southeast1
```

---

## Monitoring

View logs:
```bash
gcloud run logs tail native-stream-relay --region australia-southeast1
```

Or in Google Cloud Console → Cloud Run → native-stream-relay → Logs

---

## Firestore collection: nativeStreamSessions

Each stream session creates a document:
```json
{
  "uid":         "user-uid",
  "rtmpUrl":     "rtmp://a.rtmp.youtube.com/live2/KEY",
  "broadcastId": "youtube-broadcast-id",
  "watchUrl":    "https://youtu.be/...",
  "status":      "pending|connected|streaming|ended|error",
  "createdAt":   "ISO timestamp",
  "chunkCount":  1234,
  "bytesRecv":   5678900
}
```

Add a Firestore rule for this collection in firestore.rules:
```
match /nativeStreamSessions/{sessionId} {
  allow read, write: if request.auth != null && request.auth.uid == resource.data.uid;
}
```
