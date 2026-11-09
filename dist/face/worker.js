/* Face landmarks stay in this worker/browser. No frame is uploaded here. */
let landmarker;
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      const {FilesetResolver, FaceLandmarker} = await import('./vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(new URL('./wasm', self.location.href).href);
      landmarker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath: new URL('./face_landmarker.task', self.location.href).href, delegate: 'CPU'},
        runningMode: 'VIDEO', numFaces: 2,
        outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      self.postMessage({type: 'ready', edges: FaceLandmarker.FACE_LANDMARKS_TESSELATION.map(edge => [edge.start, edge.end])});
    } catch (error) {
      self.postMessage({type: 'error', message: 'Não foi possível carregar os pontos faciais neste aparelho.'});
    }
    return;
  }
  if (data.type === 'frame') {
    try {
      if (!landmarker) throw Error('Not ready');
      const result = landmarker.detectForVideo(data.frame, data.timestamp);
      self.postMessage({type: 'landmarks', faces: result.faceLandmarks, timestamp: data.timestamp});
    } catch (error) {
      self.postMessage({type: 'error', message: 'O rastreamento facial foi interrompido.'});
    } finally {
      data.frame?.close();
    }
  }
};
