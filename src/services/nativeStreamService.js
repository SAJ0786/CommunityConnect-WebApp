const CHUNK_INTERVAL_MS = 1000;
const STREAM_WIDTH = 1280;
const STREAM_HEIGHT = 720;
const VIDEO_BITRATE = 4000000;
const AUDIO_BITRATE = 192000;

function getBestMimeType() {
  const candidates = [
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }

  return '';
}

export class NativeStreamer {
  constructor(onStatus, onError, onStats) {
    this.onStatus = onStatus || (() => {});
    this.onError = onError || (() => {});
    this.onStats = onStats || (() => {});
    this.stream = null;
    this.recordingStream = null;
    this.currentFacingMode = null;
    this.recorder = null;
    this.ws = null;
    this.sessionId = null;
    this.active = false;
    this.ending = false;
    this.chunkCount = 0;
    this.bytesSent = 0;
    this.startTime = null;
    this._statsTimer = null;
    this._wakeLock = null;
    this._mimeType = '';
    this._switching = false;
    this._readyTimer = null;
    this._readyResolver = null;
    this._readyRejecter = null;
    this._lastRelayMessage = '';
    this._orientationTimer = null;
    this._lastOrientation = this._getOrientationKey();
    this._canvas = null;
    this._canvasVideo = null;
    this._drawFrame = null;
    this._animationFrame = null;
    this._streamOrientationLock = null;
    this._forcedStreamOrientation = null;
    this._landscapeRotation = 'ccw';
    this._orientationWarningAt = 0;
    this._physicalOrientation = null;
    this._lockedSourceIsLandscape = null;
    this._lastOrientationMismatch = false;

    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.active) this._acquireWakeLock();
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    this._onDeviceOrientation = (event) => {
      const gamma = typeof event.gamma === 'number' ? Math.abs(event.gamma) : 0;
      const beta = typeof event.beta === 'number' ? Math.abs(event.beta) : 0;

      if (gamma > 45 && gamma >= beta * 0.65) {
        this._physicalOrientation = 'landscape';
      } else if (beta > 35) {
        this._physicalOrientation = 'portrait';
      }
    };
    window.addEventListener('deviceorientation', this._onDeviceOrientation);

    this._onOrientationChange = () => {
      const nextOrientation = this._getOrientationKey();
      if (nextOrientation === this._lastOrientation) return;
      this._lastOrientation = nextOrientation;

      clearTimeout(this._orientationTimer);
      this._orientationTimer = setTimeout(() => {
        if (!this.active || this.ending) return;
      }, 600);
    };
    window.addEventListener('orientationchange', this._onOrientationChange);
    window.addEventListener('resize', this._onOrientationChange);
  }

  _getOrientationKey() {
    if (this._physicalOrientation) return this._physicalOrientation;

    const legacyAngle = typeof window.orientation === 'number' ? window.orientation : null;
    if (legacyAngle === 90 || legacyAngle === -90) return 'landscape';
    if (legacyAngle === 0 || legacyAngle === 180 || legacyAngle === -180) return 'portrait';

    const angle = window.screen?.orientation?.angle;
    if (angle === 90 || angle === 270) return 'landscape';
    if (angle === 0 || angle === 180) return 'portrait';

    const type = window.screen?.orientation?.type;
    if (type?.startsWith('portrait')) return 'portrait';
    if (type?.startsWith('landscape')) return 'landscape';
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  setStreamOrientation(orientation, landscapeRotation = 'ccw') {
    this._forcedStreamOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    this._landscapeRotation = landscapeRotation === 'cw' ? 'cw' : 'ccw';
    this._streamOrientationLock = this._forcedStreamOrientation;
    this.onStatus(`Stream orientation locked to ${this._streamOrientationLock}`);
  }

  async requestOrientationPermission() {
    const orientationEvent = window.DeviceOrientationEvent;
    if (typeof orientationEvent?.requestPermission !== 'function') return true;

    try {
      const permission = await orientationEvent.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.warn('[NativeStream] Device orientation permission unavailable:', e.message);
      return false;
    }
  }

  async _acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this._wakeLock = await navigator.wakeLock.request('screen');
        this._wakeLock.addEventListener('release', () => {
          this._wakeLock = null;
        });
      }
    } catch (e) {
      console.warn('[NativeStream] Wake Lock unavailable:', e.message);
    }
  }

  _releaseWakeLock() {
    try { this._wakeLock?.release(); } catch {}
    this._wakeLock = null;
  }

  async requestCamera(facingMode = 'environment') {
    this.onStatus('Requesting camera access...');
    this.currentFacingMode = facingMode;
    const preferPortrait = this._forcedStreamOrientation === 'portrait';

    const constraints = {
      video: {
        facingMode,
        width: { ideal: preferPortrait ? 720 : 1280 },
        height: { ideal: preferPortrait ? 1280 : 720 },
        aspectRatio: { ideal: preferPortrait ? 9 / 16 : 16 / 9 },
        frameRate: { ideal: 30, min: 15 },
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 2 },
        latency: { ideal: 0 },
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.stream = stream;

    const settings = stream.getVideoTracks()[0]?.getSettings() || {};
    this._lastOrientation = this._getOrientationKey();
    this.onStatus(`Camera ready - ${settings.width || '?'}x${settings.height || '?'} @ ${settings.frameRate || '?'}fps`);
    return stream;
  }

  async reacquireCamera() {
    const facingMode = this.currentFacingMode || 'environment';
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    return this.requestCamera(facingMode);
  }

  async connect(wsUrl) {
    this.onStatus('Connecting to streaming server...');

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        this.ws = ws;
        this.onStatus('Server connected');
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'session') {
            this.sessionId = msg.sessionId;
            this.onStatus(`Session: ${msg.sessionId}`);
          }

          if (msg.type === 'ready') {
            this.onStatus('Streaming to YouTube');
            this._readyResolver?.();
            this._clearStartWaiters();
          }

          if (msg.type === 'error') {
            const err = new Error(msg.message || 'Streaming server error.');
            this._readyRejecter?.(err);
            this._clearStartWaiters();
            this.onError(err.message);
          }

          if (msg.type === 'stats') {
            this.onStats(msg);
          }

          if (msg.type === 'log') {
            this._lastRelayMessage = msg.message || '';
          }

          if (msg.type === 'ended') {
            if (!this.ending) {
              const detail = this._lastRelayMessage ? ` Last relay message: ${this._lastRelayMessage}` : '';
              const err = new Error(`Stream ended unexpectedly - the server closed the connection.${detail}`);
              this._readyRejecter?.(err);
              this._clearStartWaiters();
              this.onStatus('Stream ended by server');
              this.onError(err.message);
            }
            this.stop();
          }
        } catch {
          // Binary/unknown messages are ignored.
        }
      };

      ws.onerror = (event) => {
        const err = new Error(event.message || 'WebSocket connection failed.');
        if (!this.ending) {
          this._readyRejecter?.(err);
          this._clearStartWaiters();
          this.onError(err.message);
        }
        reject(err);
      };

      ws.onclose = (event) => {
        if (this.active && !this.ending) {
          const err = new Error(`Connection closed (code ${event.code})`);
          this._readyRejecter?.(err);
          this._clearStartWaiters();
          this.onError(err.message);
          this.stop();
        }
      };
    });
  }

  async startRecording(rtmpUrl) {
    if (!this.ws) throw new Error('WebSocket not ready');

    this.onStatus('Preparing camera for streaming...');
    await this.reacquireCamera();

    this._mimeType = getBestMimeType();
    this.onStatus(`Encoding: ${this._mimeType || 'browser default'}`);

    this.ws.send(JSON.stringify({ type: 'start', rtmpUrl, mimeType: this._mimeType }));

    this.active = true;
    this.ending = false;
    this.chunkCount = 0;
    this.bytesSent = 0;
    this.startTime = Date.now();

    this._startRecorder();
    await this._acquireWakeLock();

    this._statsTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      this.onStats({ elapsed, chunks: this.chunkCount, bytesSent: this.bytesSent });
    }, 5000);

    this.onStatus('Waiting for YouTube stream confirmation...');
    await this._waitForRelayReady();
  }

  _waitForRelayReady(timeoutMs = 20000) {
    if (this.ending) return Promise.reject(new Error('Stream was stopped before confirmation.'));

    return new Promise((resolve, reject) => {
      this._readyResolver = resolve;
      this._readyRejecter = reject;
      this._readyTimer = setTimeout(() => {
        this._clearStartWaiters();
        reject(new Error('Streaming server did not confirm YouTube connection within 20 seconds.'));
      }, timeoutMs);
    });
  }

  _clearStartWaiters() {
    clearTimeout(this._readyTimer);
    this._readyTimer = null;
    this._readyResolver = null;
    this._readyRejecter = null;
  }

  _startRecorder() {
    const recOptions = {};
    if (this._mimeType) recOptions.mimeType = this._mimeType;
    if (VIDEO_BITRATE) recOptions.videoBitsPerSecond = VIDEO_BITRATE;
    if (AUDIO_BITRATE) recOptions.audioBitsPerSecond = AUDIO_BITRATE;

    const recorderStream = this._createRecordingStream();
    const recorder = new MediaRecorder(recorderStream, recOptions);

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0 || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      event.data.arrayBuffer().then(buffer => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(buffer);
          this.chunkCount++;
          this.bytesSent += buffer.byteLength;
        }
      });
    };

    recorder.onerror = (event) => {
      if (!this.ending) this.onError('Recorder error: ' + (event.error?.message || 'unknown'));
    };

    recorder.start(CHUNK_INTERVAL_MS);
    this.recorder = recorder;
  }

  _createRecordingStream() {
    this._stopRecordingComposition();

    if (!this.stream || !HTMLCanvasElement.prototype.captureStream) {
      return this.stream;
    }

    const canvas = document.createElement('canvas');
    canvas.width = STREAM_WIDTH;
    canvas.height = STREAM_HEIGHT;

    const ctx = canvas.getContext('2d', { alpha: false });
    const video = document.createElement('video');
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.play().catch(() => {});

    const draw = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, STREAM_WIDTH, STREAM_HEIGHT);

      const sourceWidth = video.videoWidth || 0;
      const sourceHeight = video.videoHeight || 0;
      if (!sourceWidth || !sourceHeight) {
        this._animationFrame = requestAnimationFrame(draw);
        return;
      }

      const sourceIsLandscape = sourceWidth >= sourceHeight;

      if (!this._streamOrientationLock) {
        this._streamOrientationLock = this._forcedStreamOrientation || this._getOrientationKey();
        this.onStatus(`Stream orientation locked to ${this._streamOrientationLock}`);
      }

      const lockedIsLandscape = this._streamOrientationLock === 'landscape';
      const currentOrientation = this._physicalOrientation || (sourceIsLandscape ? 'landscape' : 'portrait');
      const orientationMismatch = currentOrientation !== this._streamOrientationLock;
      if (orientationMismatch) {
        const now = Date.now();
        if (!this._lastOrientationMismatch || now - this._orientationWarningAt > 5000) {
          this._orientationWarningAt = now;
          this.onStatus(`Rotate phone back to ${this._streamOrientationLock}`);
        }
      } else if (this._lastOrientationMismatch || this._orientationWarningAt) {
        this._orientationWarningAt = 0;
        this.onStatus('Orientation OK');
      }
      this._lastOrientationMismatch = orientationMismatch;

      const shouldRotateToLandscape = lockedIsLandscape && !sourceIsLandscape;
      const renderWidth = shouldRotateToLandscape ? sourceHeight : sourceWidth;
      const renderHeight = shouldRotateToLandscape ? sourceWidth : sourceHeight;
      const scale = lockedIsLandscape
        ? Math.max(STREAM_WIDTH / renderWidth, STREAM_HEIGHT / renderHeight)
        : Math.min(STREAM_WIDTH / renderWidth, STREAM_HEIGHT / renderHeight);
      const drawWidth = renderWidth * scale;
      const drawHeight = renderHeight * scale;
      const x = (STREAM_WIDTH - drawWidth) / 2;
      const y = (STREAM_HEIGHT - drawHeight) / 2;

      if (shouldRotateToLandscape) {
        ctx.save();
        ctx.translate(x + drawWidth / 2, y + drawHeight / 2);
        ctx.rotate(this._landscapeRotation === 'cw' ? Math.PI / 2 : -Math.PI / 2);
        ctx.drawImage(video, -drawHeight / 2, -drawWidth / 2, drawHeight, drawWidth);
        ctx.restore();
      } else {
        ctx.drawImage(video, x, y, drawWidth, drawHeight);
      }

      this._animationFrame = requestAnimationFrame(draw);
    };

    draw();

    const canvasStream = canvas.captureStream(30);
    this.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));

    this._canvas = canvas;
    this._canvasVideo = video;
    this._drawFrame = draw;
    this.recordingStream = canvasStream;
    return canvasStream;
  }

  _stopRecordingComposition() {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }

    if (this._canvasVideo) {
      this._canvasVideo.pause();
      this._canvasVideo.srcObject = null;
      this._canvasVideo = null;
    }

    if (this.recordingStream) {
      this.recordingStream.getVideoTracks().forEach(track => track.stop());
      this.recordingStream = null;
    }

    this._canvas = null;
    this._drawFrame = null;
  }

  stop() {
    this.ending = true;
    this.active = false;
    clearInterval(this._statsTimer);
    this._clearStartWaiters();
    this._releaseWakeLock();
    clearTimeout(this._orientationTimer);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    window.removeEventListener('orientationchange', this._onOrientationChange);
    window.removeEventListener('resize', this._onOrientationChange);

    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch {}
    }
    this._stopRecordingComposition();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'stop' }));
        this.ws.close(1000, 'done');
      } catch {}
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.recorder = null;
    this.ws = null;
    this._streamOrientationLock = null;
    this._forcedStreamOrientation = null;
    this._landscapeRotation = 'ccw';
    this._orientationWarningAt = 0;
    this._physicalOrientation = null;
    this._lockedSourceIsLandscape = null;
    this._lastOrientationMismatch = false;
    this.onStatus('Stopped');
  }

  async switchCamera() {
    if (this._switching) return this.stream;

    this._switching = true;
    this.onStatus('Switching camera...');

    const current = this.stream?.getVideoTracks()[0]?.getSettings()?.facingMode || 'environment';
    const next = current === 'environment' ? 'user' : 'environment';
    const wasActive = this.active && this.recorder && this.recorder.state === 'recording';

    try {
      if (wasActive) {
        try { this.recorder.stop(); } catch {}
        this.recorder = null;
      }

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      const newStream = await this.requestCamera(next);

      if (wasActive && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'switch-camera', mimeType: this._mimeType }));
        await new Promise(resolve => setTimeout(resolve, 700));
      }

      if (wasActive) this._startRecorder();

      this.onStatus(`Camera switched to ${next === 'user' ? 'front' : 'back'}`);
      return newStream;
    } finally {
      this._switching = false;
    }
  }

  async refreshOrientation() {
    if (this._switching) return this.stream;

    this._switching = true;
    this.onStatus('Updating camera orientation...');

    const facingMode = this.currentFacingMode
      || this.stream?.getVideoTracks()[0]?.getSettings()?.facingMode
      || 'environment';
    const wasActive = this.active && this.recorder && this.recorder.state === 'recording';

    try {
      if (wasActive) {
        try { this.recorder.stop(); } catch {}
        this.recorder = null;
      }

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      const newStream = await this.requestCamera(facingMode);

      if (wasActive && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'switch-camera', mimeType: this._mimeType }));
        await new Promise(resolve => setTimeout(resolve, 700));
      }

      if (wasActive) this._startRecorder();

      this.onStatus(`Camera orientation updated to ${this._getOrientationKey()}`);
      return newStream;
    } finally {
      this._switching = false;
    }
  }
}
