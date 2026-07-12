const CHUNK_INTERVAL_MS = 1000;
const AUDIO_BITRATE = 128000;
const IS_ANDROID = /android/i.test(navigator.userAgent);
const ANDROID_RECORDING_FPS = 24;
const ANDROID_VIDEO_BITRATE = 2200000;
const RELAY_HTTP_URL = import.meta.env.VITE_NATIVE_STREAM_RELAY_HTTP_URL
  || 'https://native-stream-relay-209723097611.australia-southeast1.run.app';

export const QUALITY_PROFILES = {
  '1080p': { label: '1080p HD', width: 1920, height: 1080, videoBitrate: 6000000 },
  '720p':  { label: '720p HD',  width: 1280, height: 720,  videoBitrate: 4500000 },
  '480p':  { label: '480p',     width: 854,  height: 480,  videoBitrate: 2200000 },
};
const QUALITY_ORDER = ['480p', '720p', '1080p'];

function getBestMimeType() {
  const candidates = IS_ANDROID
    ? [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
      ]
    : [
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
    this._audioContext = null;
    this._audioSource = null;
    this._audioGain = null;
    this._audioDestination = null;
    this._micMeterContext = null;
    this._micMeterSource = null;
    this._micMeterAnalyser = null;
    this._micMeterTimer = null;
    this._lastStats = null;
    this._drawFrame = null;
    this._animationFrame = null;
    this._streamOrientationLock = null;
    this._forcedStreamOrientation = null;
    this._landscapeRotation = 'ccw';
    this._orientationWarningAt = 0;
    this._physicalOrientation = null;
    this._lockedSourceIsLandscape = null;
    this._lastOrientationMismatch = false;
    this.qualityProfile = '720p';
    this.audioMode = 'natural';
    this.uploadMbps = null;
    this._qualityChanging = false;
    this._congestedChecks = 0;
    this._stableChecks = 0;
    this._wsUrl = '';
    this._streamToken = '';
    this._rtmpUrl = 'OAUTH';
    this._reconnecting = false;
    this._reconnectStartedAt = 0;

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

  setAudioMode(mode) {
    this.audioMode = mode === 'speech' ? 'speech' : 'natural';
  }

  setQualityProfile(profile) {
    if (QUALITY_PROFILES[profile]) this.qualityProfile = profile;
  }

  async detectQuality() {
    const bytes = 512 * 1024;
    const body = new Uint8Array(bytes);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const started = performance.now();
    try {
      const response = await fetch(`${RELAY_HTTP_URL}/speed-test`, {
        method: 'POST', body, signal: controller.signal,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      if (!response.ok) throw new Error(`Upload test failed (${response.status})`);
      const seconds = Math.max((performance.now() - started) / 1000, 0.1);
      this.uploadMbps = (bytes * 8) / seconds / 1000000;
      this.qualityProfile = this.uploadMbps >= 8 ? '1080p' : this.uploadMbps >= 5.5 ? '720p' : '480p';
    } catch (error) {
      console.warn('[NativeStream] Upload test unavailable:', error.message);
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const effective = connection?.effectiveType;
      this.qualityProfile = effective === '4g' ? '720p' : effective === '3g' || effective === '2g' ? '480p' : '720p';
    } finally {
      clearTimeout(timer);
    }
    // Android Chrome/Samsung Internet must decode camera, draw to canvas,
    // encode WebM, and upload while the relay transcodes again. 720p/1080p can
    // overload mobile encoders and produces blocky frames or missing audio.
    if (IS_ANDROID) this.qualityProfile = '480p';
    const selected = QUALITY_PROFILES[this.qualityProfile];
    this.onStatus(`Network quality: ${this.uploadMbps ? `${this.uploadMbps.toFixed(1)} Mbps - ` : ''}${selected.label}`);
    return { profile: this.qualityProfile, uploadMbps: this.uploadMbps, ...selected };
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
    const quality = QUALITY_PROFILES[this.qualityProfile];
    const speechMode = this.audioMode === 'speech';

    const constraints = {
      video: {
        facingMode,
        width: { ideal: preferPortrait ? quality.height : quality.width, min: preferPortrait ? 540 : 960 },
        height: { ideal: preferPortrait ? quality.width : quality.height, min: preferPortrait ? 960 : 540 },
        aspectRatio: { ideal: preferPortrait ? 9 / 16 : 16 / 9 },
        frameRate: { ideal: 30, min: 15 },
      },
      audio: IS_ANDROID ? true : {
        echoCancellation: speechMode,
        noiseSuppression: speechMode,
        autoGainControl: speechMode,
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 },
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

  _hasLiveCamera() {
    if (!this.stream?.active) return false;
    const videoTrack = this.stream.getVideoTracks()[0];
    const audioTrack = this.stream.getAudioTracks()[0];
    return videoTrack?.readyState === 'live' && audioTrack?.readyState === 'live';
  }

  async _prepareCameraForRecording() {
    // PreCheckCard already owns a working camera. Releasing and immediately
    // reopening it is unreliable on Android Chrome and can leave YouTube with
    // a waiting broadcast but no media. Keep that live stream and adjust its
    // constraints in place where the browser supports it.
    if (this._hasLiveCamera()) {
      const quality = QUALITY_PROFILES[this.qualityProfile];
      const preferPortrait = this._forcedStreamOrientation === 'portrait';
      const speechMode = this.audioMode === 'speech';

      const videoTrack = this.stream.getVideoTracks()[0];
      const audioTrack = this.stream.getAudioTracks()[0];
      await videoTrack.applyConstraints?.({
        width: { ideal: preferPortrait ? quality.height : quality.width },
        height: { ideal: preferPortrait ? quality.width : quality.height },
        aspectRatio: { ideal: preferPortrait ? 9 / 16 : 16 / 9 },
        frameRate: { ideal: 30, min: 15 },
      }).catch(error => console.warn('[NativeStream] Video constraints unchanged:', error.message));
      if (!IS_ANDROID) {
        await audioTrack.applyConstraints?.({
          echoCancellation: speechMode,
          noiseSuppression: speechMode,
          autoGainControl: speechMode,
          channelCount: { ideal: 1 },
        }).catch(error => console.warn('[NativeStream] Audio constraints unchanged:', error.message));
      }

      this.onStatus('Using checked camera for streaming');
      return this.stream;
    }

    // If Android has already released the preview track, retry acquisition on
    // this same relay/YouTube session instead of forcing the host to start over.
    let lastError;
    for (const delay of [0, 350, 900]) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      try {
        return await this.requestCamera(this.currentFacingMode || 'environment');
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Camera could not be prepared for streaming.');
  }

  async connect(wsUrl, streamToken) {
    this._wsUrl = wsUrl;
    this._streamToken = streamToken;
    return this._connectSocket();
  }

  async _connectSocket() {
    this.onStatus('Connecting to streaming server...');

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this._wsUrl);
      let authenticated = false;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        this.ws = ws;
        ws.send(JSON.stringify({ type:'authenticate', token:this._streamToken }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'authenticated') {
            authenticated = true;
            if (msg.qualityProfile && QUALITY_PROFILES[msg.qualityProfile]) {
              this.qualityProfile = msg.qualityProfile;
            }
            this.onStatus('Server authenticated');
            resolve();
          }

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
              this.onStatus('Stream interrupted - reconnecting');
              this._beginReconnect();
            }
          }
        } catch {
          // Binary/unknown messages are ignored.
        }
      };

      ws.onerror = (event) => {
        const err = new Error(event.message || 'WebSocket connection failed.');
        if (!authenticated) reject(err);
      };

      ws.onclose = (event) => {
        if (this.active && !this.ending) {
          this._clearStartWaiters();
          this.onStatus(`Connection interrupted (code ${event.code}) - reconnecting`);
          this._beginReconnect();
        } else if (!authenticated) {
          reject(new Error(`Connection closed before authentication (code ${event.code})`));
        }
      };
    });
  }

  async startRecording(rtmpUrl) {
    if (!this.ws) throw new Error('WebSocket not ready');

    this._rtmpUrl = rtmpUrl || 'OAUTH';
    this.onStatus('Preparing camera for streaming...');
    await this._prepareCameraForRecording();

    this._mimeType = getBestMimeType();
    this.onStatus(`Encoding: ${this._mimeType || 'browser default'}`);

    this.ws.send(JSON.stringify({
      type: 'start', rtmpUrl, mimeType: this._mimeType,
      qualityProfile: this.qualityProfile,
    }));

    this.active = true;
    this.ending = false;
    this.chunkCount = 0;
    this.bytesSent = 0;
    this.startTime = Date.now();

    await this._startRecorder();
    await this._acquireWakeLock();

    this._statsTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      const bufferedAmount = this.ws?.bufferedAmount || 0;
      this.onStats({
        elapsed, chunks: this.chunkCount, bytesSent: this.bytesSent,
        bufferedAmount, qualityProfile: this.qualityProfile,
        micLevel: this._lastStats?.micLevel || 0,
        micActive: !!this._lastStats?.micActive,
        micMuted: !!this._lastStats?.micMuted,
        micTrackState: this._lastStats?.micTrackState || 'unknown',
      });
      if (bufferedAmount > 4000000) {
        this._congestedChecks++;
        this._stableChecks = 0;
      } else if (bufferedAmount < 200000) {
        this._stableChecks++;
        this._congestedChecks = 0;
      }
      if (this._congestedChecks >= 4) {
        this._congestedChecks = 0;
        this._downgradeQuality();
      }
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

  async _beginReconnect() {
    if (this._reconnecting || this.ending) return;
    this._reconnecting = true;
    this._reconnectStartedAt = Date.now();
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch {}
    }
    this.recorder = null;
    this._stopRecordingComposition();
    try { this.ws?.close(); } catch {}

    const delays = [1000, 2000, 4000, 8000, 15000, 20000, 30000];
    let lastError = null;
    for (const delay of delays) {
      if (this.ending || Date.now() - this._reconnectStartedAt > 120000) break;
      this.onStatus(`Reconnecting in ${Math.ceil(delay / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      if (this.ending) break;
      try {
        await this._connectSocket();
        this.ws.send(JSON.stringify({
          type:'start', rtmpUrl:this._rtmpUrl, mimeType:this._mimeType,
          qualityProfile:this.qualityProfile,
        }));
        await this._startRecorder();
        await this._waitForRelayReady(25000);
        this._reconnecting = false;
        this.onStatus('Streaming to YouTube - reconnected');
        return;
      } catch (error) {
        lastError = error;
      }
    }
    this._reconnecting = false;
    if (!this.ending) this.onError(`Could not reconnect to the same stream. ${lastError?.message || ''}`.trim());
  }

  retryReconnect() {
    if (this.ending) return;
    this._beginReconnect();
  }

  async _startRecorder() {
    const recOptions = {};
    if (this._mimeType) recOptions.mimeType = this._mimeType;
    recOptions.videoBitsPerSecond = IS_ANDROID
      ? Math.min(QUALITY_PROFILES[this.qualityProfile].videoBitrate, ANDROID_VIDEO_BITRATE)
      : QUALITY_PROFILES[this.qualityProfile].videoBitrate;
    if (AUDIO_BITRATE) recOptions.audioBitsPerSecond = AUDIO_BITRATE;

    const recorderStream = await this._createRecordingStream();
    const audioTrack = recorderStream?.getAudioTracks?.()[0];
    if (!audioTrack || audioTrack.readyState !== 'live') {
      throw new Error('Microphone audio is unavailable. Check microphone permission and try again.');
    }
    audioTrack.enabled = true;
    this.onStatus(`Microphone ready - ${audioTrack.getSettings?.().sampleRate || 'default'} Hz`);
    this._startMicLevelMonitor(this.stream || recorderStream);
    const recorder = new MediaRecorder(recorderStream, recOptions);

    recorder.ondataavailable = (event) => {
      if (this.ending || this.recorder !== recorder) return;
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

  async _createRecordingStream() {
    this._stopRecordingComposition();

    if (!this.stream || !HTMLCanvasElement.prototype.captureStream) {
      return this.stream;
    }

    const quality = QUALITY_PROFILES[this.qualityProfile];
    const streamWidth = quality.width;
    const streamHeight = quality.height;
    const canvas = document.createElement('canvas');
    canvas.width = streamWidth;
    canvas.height = streamHeight;

    const ctx = canvas.getContext('2d', { alpha: false });
    const video = document.createElement('video');
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.play().catch(() => {});

    const draw = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, streamWidth, streamHeight);

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
        ? Math.max(streamWidth / renderWidth, streamHeight / renderHeight)
        : Math.min(streamWidth / renderWidth, streamHeight / renderHeight);
      const drawWidth = renderWidth * scale;
      const drawHeight = renderHeight * scale;
      const x = (streamWidth - drawWidth) / 2;
      const y = (streamHeight - drawHeight) / 2;

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

    const canvasStream = canvas.captureStream(IS_ANDROID ? ANDROID_RECORDING_FPS : 30);
    const audioTracks = await this._createRecordingAudioTracks();
    audioTracks.forEach(track => { track.enabled = true; });
    const recordingStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks,
    ]);

    this._canvas = canvas;
    this._canvasVideo = video;
    this._drawFrame = draw;
    this.recordingStream = recordingStream;
    return recordingStream;
  }

  async _createRecordingAudioTracks() {
    const liveTracks = this.stream?.getAudioTracks?.().filter(track => track.readyState === 'live') || [];
    if (!liveTracks.length) return [];
    liveTracks.forEach(track => { track.enabled = true; });
    return liveTracks;
  }

  _startMicLevelMonitor(stream) {
    this._stopMicLevelMonitor();
    const audioTrack = stream?.getAudioTracks?.()[0];
    if (!audioTrack || audioTrack.readyState !== 'live') {
      this._lastStats = {
        ...(this._lastStats || {}),
        micLevel: 0,
        micActive: false,
        micMuted: true,
        micTrackState: audioTrack?.readyState || 'missing',
      };
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this._micMeterContext = new AudioContextClass();
      this._micMeterSource = this._micMeterContext.createMediaStreamSource(new MediaStream([audioTrack]));
      this._micMeterAnalyser = this._micMeterContext.createAnalyser();
      this._micMeterAnalyser.fftSize = 1024;
      this._micMeterAnalyser.smoothingTimeConstant = 0.65;
      this._micMeterSource.connect(this._micMeterAnalyser);
      if (this._micMeterContext.state === 'suspended') this._micMeterContext.resume().catch(() => {});

      const samples = new Uint8Array(this._micMeterAnalyser.fftSize);
      const tick = () => {
        if (!this._micMeterAnalyser) return;
        this._micMeterAnalyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const centered = samples[i] - 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / samples.length);
        const level = Math.min(1, rms / 35);
        const micState = {
          micLevel: level,
          micActive: level > 0.035 && audioTrack.enabled && audioTrack.readyState === 'live',
          micMuted: !audioTrack.enabled,
          micTrackState: audioTrack.readyState,
        };
        this._lastStats = { ...(this._lastStats || {}), ...micState };
        this.onStats({
          elapsed: this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0,
          chunks: this.chunkCount,
          bytesSent: this.bytesSent,
          bufferedAmount: this.ws?.bufferedAmount || 0,
          qualityProfile: this.qualityProfile,
          ...micState,
        });
      };
      tick();
      this._micMeterTimer = setInterval(tick, 500);
    } catch (error) {
      console.warn('[NativeStream] Mic level monitor unavailable:', error.message);
    }
  }

  _stopMicLevelMonitor() {
    if (this._micMeterTimer) {
      clearInterval(this._micMeterTimer);
      this._micMeterTimer = null;
    }
    try { this._micMeterSource?.disconnect(); } catch {}
    this._micMeterSource = null;
    this._micMeterAnalyser = null;
    if (this._micMeterContext) {
      try { this._micMeterContext.close(); } catch {}
      this._micMeterContext = null;
    }
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

    this._stopMicLevelMonitor();

    try { this._audioSource?.disconnect(); } catch {}
    this._audioSource = null;

    try { this._audioGain?.disconnect(); } catch {}
    this._audioGain = null;

    if (this._audioDestination) {
      this._audioDestination.stream.getTracks().forEach(track => track.stop());
      this._audioDestination = null;
    }

    if (this._audioContext) {
      try { this._audioContext.close(); } catch {}
      this._audioContext = null;
    }

    this._canvas = null;
    this._drawFrame = null;
  }

  async _downgradeQuality() {
    if (this._qualityChanging || !this.active) return;
    const currentIndex = QUALITY_ORDER.indexOf(this.qualityProfile);
    if (currentIndex <= 0) return;
    const nextProfile = QUALITY_ORDER[currentIndex - 1];
    this._qualityChanging = true;
    this.onStatus(`Network congestion detected - reducing quality to ${QUALITY_PROFILES[nextProfile].label}`);
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
      this.recorder = null;
      this.qualityProfile = nextProfile;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'quality-change',
          mimeType: this._mimeType,
          qualityProfile: nextProfile,
        }));
        await new Promise(resolve => setTimeout(resolve, 800));
        this._startRecorder();
      }
    } catch (error) {
      console.warn('[NativeStream] Quality downgrade failed:', error.message);
    } finally {
      this._qualityChanging = false;
    }
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
