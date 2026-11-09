# Recursos de rastreamento facial

O runtime, o WebAssembly e o modelo abaixo são servidos pelo mesmo Mac que
executa o Verifica.ai. Não é usado CDN durante o rastreamento.

- **MediaPipe Tasks Vision 0.10.32**, Google: distribuição oficial de
  `@mediapipe/tasks-vision` no npm, incluindo as variantes WASM com e sem SIMD.
  O código do SDK mantém seus avisos e a licença Apache 2.0, incluída em `LICENSE`.
- **Face Landmarker, float16, versão 1**, distribuído pelo Google em
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`.
  Consulte a [documentação e os modelos oficiais](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)
  para os termos e limites do modelo antes de distribuição comercial.
- `manifest.json` fixa a versão, as URLs de origem e os hashes SHA-256 dos
  arquivos vendorizados. Para substituir um recurso, confira a origem, a licença,
  a integridade e a compatibilidade do conjunto.

`guide.js` e `worker.js` são a integração local do Verifica.ai. Os quadros
reduzidos são processados em um Web Worker, sem fila de imagens e sem telemetria
de landmarks. A captura de vídeo do fluxo de verificação continua sendo enviada
à API configurada, como antes.

Os 478 pontos e o eixo Z são inferidos de uma câmera comum. A pequena vista 3D
é uma projeção desses pontos, não uma medição por sensor de profundidade. O
estado da prévia não decide identidade nem prova de vida.
