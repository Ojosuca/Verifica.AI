/* Local, inferred geometry for camera guidance. Never an identity/PAD decision. */
(function(root) {
  'use strict';
  const assetBase = typeof document === 'undefined' ? null : new URL('./', document.currentScript.src);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function projectPoint(point, sourceWidth, sourceHeight, width, height, mirror = true) {
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const drawnWidth = sourceWidth * scale, drawnHeight = sourceHeight * scale;
    return {x: (width - drawnWidth) / 2 + (mirror ? 1 - point.x : point.x) * drawnWidth,
      y: (height - drawnHeight) / 2 + point.y * drawnHeight};
  }

  function describeFace(faces) {
    if (faces.length !== 1) return {count: faces.length, action: 'unknown', aligned: false};
    const points = faces[0], left = points[468], right = points[473], nose = points[1];
    if (!left || !right || !nose || points.some(p => !Number.isFinite(p.x + p.y + p.z)))
      return {count: 0, action: 'unknown', aligned: false};
    const distance = Math.abs(left.x - right.x);
    if (distance < 0.025) return {count: 1, action: 'unknown', aligned: false, points};
    const offset = (nose.x - (left.x + right.x) / 2) / distance;
    const action = offset > 0.14 ? 'turn_left' : offset < -0.14 ? 'turn_right' : Math.abs(offset) < 0.10 ? 'center' : 'unknown';
    const xs = points.slice(0, 468).map(p => p.x), ys = points.slice(0, 468).map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const aligned = minX > 0.03 && maxX < 0.97 && minY > 0.03 && maxY < 0.97 && maxX - minX > 0.18;
    return {count: 1, action, aligned, points};
  }

  function projectDepth(points, aspect, width, height) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y), zs = points.map(p => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const rotated = points.map(p => {
      const x = cx - p.x, y = (p.y - cy) * aspect, z = p.z - cz;
      return {x: x * Math.cos(0.45) + z * Math.sin(0.45), y, z};
    });
    const extent = Math.max(...rotated.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))), 0.01);
    const scale = Math.min(width, height) * 0.41 / extent;
    return rotated.map(p => ({x: width / 2 + p.x * scale, y: height / 2 + p.y * scale, z: p.z}));
  }

  class FaceGuide {
    constructor({video, canvas, depthCanvas, status, feedback, camera, workerFactory, bitmapFactory}) {
      Object.assign(this, {video, canvas, depthCanvas, status, feedback, camera});
      this.workerFactory = workerFactory || (() => new Worker(new URL('worker.js', assetBase)));
      this.bitmapFactory = bitmapFactory || (source => createImageBitmap(source));
      this.generation = 0; this.active = false; this.available = false; this.target = null;
      this.snapshot = {count: 0, action: 'unknown', aligned: false}; this.sampleAt = 0;
      this.onVisibility = () => {if (document.hidden) {this.clear();this.setText(this.status, 'Prévia pausada');}};
    }

    setText(element, text) {if (element && element.textContent !== text) element.textContent = text;}

    async start() {
      this.stop();
      const generation = ++this.generation;
      this.active = true;
      this.setText(this.status, 'Carregando pontos faciais…');
      if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
        this.fail(); return false;
      }
      try {
        this.worker = this.workerFactory();
        const ready = await new Promise(resolve => {
          this.resolveReady = resolve;
          this.initTimer = setTimeout(() => {this.fail(); resolve(false);}, 15000);
          this.worker.onerror = () => {this.fail(); resolve(false);};
          this.worker.onmessage = ({data}) => {
            if (generation !== this.generation || !this.active) return;
            if (data.type === 'ready') {
              clearTimeout(this.initTimer);this.available = true;this.edges = data.edges;
              this.setText(this.status, 'Procurando um rosto…');resolve(true);this.schedule();
            } else if (data.type === 'landmarks') {
              this.busy = false;this.snapshot = describeFace(data.faces);this.sampleAt = performance.now();
              try{this.draw();this.ageTimer=setTimeout(()=>{this.clear();this.setText(this.status,'Aguardando imagem atual da câmera…');this.setText(this.feedback,'Mantenha o navegador em primeiro plano.');},1000);this.schedule();}catch(error){this.fail();}
            } else if (data.type === 'error') {this.fail();resolve(false);}
          };
          this.worker.postMessage({type: 'init'});
        });
        if (generation !== this.generation) return false;
        document.addEventListener('visibilitychange', this.onVisibility);
        return ready;
      } catch (error) {this.fail();return false;}
    }

    schedule() {
      clearTimeout(this.frameTimer);
      if (this.active && this.available) this.frameTimer = setTimeout(() => this.sendFrame(), 100);
    }

    async sendFrame() {
      if (!this.active || !this.available) return;
      if (document.hidden || !this.video.isConnected || this.video.readyState < 2 || this.busy || this.lastVideoTime === this.video.currentTime) {
        if (!this.video.isConnected) {this.stop();return;}
        this.schedule();return;
      }
      const generation = this.generation;this.busy = true;this.lastVideoTime = this.video.currentTime;
      try {
        // A single in-flight bitmap; never queue frames or block the UI with inference.
        if (!this.inputCanvas) this.inputCanvas = document.createElement('canvas');
        const width = Math.min(this.video.videoWidth, 480);
        this.inputCanvas.width = width;
        this.inputCanvas.height = Math.max(1, Math.round(width * this.video.videoHeight / this.video.videoWidth));
        this.inputCanvas.getContext('2d').drawImage(this.video, 0, 0, this.inputCanvas.width, this.inputCanvas.height);
        const frame = await this.bitmapFactory(this.inputCanvas);
        if (generation !== this.generation || !this.active) {frame.close();return;}
        this.worker.postMessage({type: 'frame', frame, timestamp: performance.now()}, [frame]);
        clearTimeout(this.staleTimer);
        this.staleTimer = setTimeout(() => {this.clear();this.fail();}, 3000);
      } catch (error) {if (generation === this.generation) this.fail();}
    }

    setTarget(action) {this.target = action;this.updateFeedback();}

    updateFeedback() {
      const face = this.snapshot;
      let message = 'Posicione seu rosto no centro da guia.', state = 'searching';
      if (face.count > 1) message = 'Deixe apenas uma pessoa diante da câmera.';
      else if (face.count === 1 && !face.aligned) message = 'Aproxime o rosto e mantenha-o inteiro na imagem.';
      else if (face.count === 1) {
        const matches = this.target && face.action === this.target;
        state = matches ? 'aligned' : 'tracking';
        message = matches ? 'Posição detectada na prévia. Mantenha por um instante.' : 'Rosto localizado. Siga a direção indicada.';
      }
      this.camera.dataset.tracking = state;
      this.setText(this.feedback, message);
    }

    prepareCanvas(canvas) {
      const rect = canvas.getBoundingClientRect(), ratio = Math.min(root.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {canvas.width = width;canvas.height = height;}
      const context = canvas.getContext('2d');if(!context)throw Error('Canvas indisponível');context.clearRect(0, 0, width, height);
      return {context, width, height, ratio};
    }

    drawMesh(context, points, ratio, depth = false) {
      context.strokeStyle = depth ? 'rgba(151,238,207,.38)' : 'rgba(164,245,218,.32)';
      context.lineWidth = Math.max(0.5, ratio * 0.55);context.beginPath();
      for (const [a,b] of this.edges || []) {
        if (!points[a] || !points[b]) continue;
        context.moveTo(points[a].x, points[a].y);context.lineTo(points[b].x, points[b].y);
      }
      context.stroke();
      for (const point of points) {
        const near = clamp(0.6 - (point.z || 0) * 3, 0.3, 0.95);
        context.fillStyle = `rgba(186,255,229,${near})`;context.beginPath();
        context.arc(point.x, point.y, ratio * (depth ? 0.65 : clamp(1 - (point.z || 0) * 3, 0.7, 1.6)), 0, Math.PI * 2);context.fill();
      }
    }

    draw() {
      clearTimeout(this.staleTimer);clearTimeout(this.ageTimer);
      const main = this.prepareCanvas(this.canvas), depth = this.prepareCanvas(this.depthCanvas);
      if (this.snapshot.count === 1 && this.snapshot.points) {
        const points = this.snapshot.points;
        const overlay = points.map(point => ({...projectPoint(point, this.video.videoWidth, this.video.videoHeight, main.width, main.height), z:point.z}));
        this.drawMesh(main.context, overlay, main.ratio);
        this.drawMesh(depth.context, projectDepth(points, this.video.videoHeight / this.video.videoWidth, depth.width, depth.height), depth.ratio, true);
        this.setText(this.status, `${points.length} pontos faciais · prévia local`);
      } else this.setText(this.status, this.snapshot.count > 1 ? 'Mais de um rosto detectado' : 'Procurando um rosto…');
      this.updateFeedback();
    }

    clear() {
      clearTimeout(this.ageTimer);
      this.snapshot = {count: 0, action: 'unknown', aligned: false};this.sampleAt = 0;
      for (const canvas of [this.canvas, this.depthCanvas]) {
        const context = canvas?.getContext('2d');context?.clearRect(0, 0, canvas.width, canvas.height);
      }
      this.camera.dataset.tracking = 'searching';
    }

    fail() {
      this.stop();
      this.setText(this.status, 'Pontos indisponíveis neste aparelho');
      this.setText(this.feedback, 'A orientação animada continua ativa. Siga as setas e o texto.');
    }

    stop() {
      this.active = false;this.available = false;this.generation++;
      clearTimeout(this.frameTimer);clearTimeout(this.initTimer);clearTimeout(this.staleTimer);clearTimeout(this.ageTimer);
      this.worker?.terminate();this.worker = null;this.busy = false;this.lastVideoTime = -1;
      this.resolveReady?.(false);this.resolveReady = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
      this.clear();
    }
  }
  root.VerificaFace = {FaceGuide, projectPoint, projectDepth, describeFace};
  if (typeof module !== 'undefined') module.exports = root.VerificaFace;
})(typeof window === 'undefined' ? globalThis : window);
