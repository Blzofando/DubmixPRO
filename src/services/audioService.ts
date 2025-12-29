import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { SubtitleSegment } from '../types';

let ffmpeg: FFmpeg | null = null;

const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  return ffmpeg;
};

export const extractAudioFromVideo = async (videoFile: File): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  await ffmpeg.writeFile('input_video', await fetchFile(videoFile));
  
  // Extrair mp3 rápido
  await ffmpeg.exec(['-i', 'input_video', '-q:a', '0', '-map', 'a', 'audio.mp3']);
  
  const data = await ffmpeg.readFile('audio.mp3');
  return new Blob([data], { type: 'audio/mp3' });
};

// Função auxiliar para ler arquivo para Uint8Array
const fetchFile = async (file: File): Promise<Uint8Array> => {
  return new Uint8Array(await file.arrayBuffer());
};

// Construtor de filtro 'atempo' encadeado para valores extremos
const getAtempoFilter = (factor: number): string => {
  if (factor === 1) return "atempo=1.0";
  
  let filters = [];
  let remaining = factor;
  
  // FFmpeg atempo limite é 0.5 a 2.0. Encadeamos se passar disso.
  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining}`);
  
  return filters.join(',');
};

export const assembleFinalAudio = async (
  segments: SubtitleSegment[], 
  audioBuffers: ArrayBuffer[]
): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  
  // Limpar sistema de arquivos virtual antigo
  try { await ffmpeg.deleteFile('output.mp3'); } catch(e){}

  let filterComplex = "";
  let inputs = "";
  
  // Carregar todos os segmentos de áudio no FFmpeg
  for (let i = 0; i < segments.length; i++) {
    const filename = `seg_${i}.mp3`;
    await ffmpeg.writeFile(filename, new Uint8Array(audioBuffers[i]));
    inputs += `-i ${filename} `;
  }

  // Construir o Grafo de Filtro
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    
    // Obter duração do arquivo gerado pelo TTS (precisamos inspecionar ou assumir que o FFmpeg sabe)
    // O problema: não sabemos a duração exata do ArrayBuffer aqui sem decodificar.
    // Estratégia: O FFmpeg lerá o arquivo. Usaremos 'atempo' baseado na duração esperada?
    // Correção: Para calcular o 'atempo', precisamos saber a duração do input TTS.
    // Como não temos `ffprobe` facilmente aqui, vamos assumir que o TTS gera algo próximo
    // e forçar o `atempo` baseado na duração DO SEGMENTO DE VÍDEO vs Duração estimada?
    // Não. A melhor abordagem robusta sem ffprobe é complexa.
    // ALTERNATIVA SEGURA: Vamos confiar no timestamp. 
    // Porém, o prompt pediu `atempo` para corrigir bugs.
    // Solução: Vamos aplicar o filtro de tempo. Para saber o fator, precisamos da duração do TTS.
    // Vamos usar o contexto de áudio do navegador para pegar a duração antes de passar pro FFmpeg.
    
    const ttsDuration = await getAudioDuration(audioBuffers[i]);
    const targetDuration = seg.endTime - seg.startTime;
    
    // Calcular fator de velocidade. 
    // Se TTS tem 10s e alvo é 5s. Fator = 10/5 = 2.0 (Acelerar).
    // Se TTS tem 2s e alvo é 4s. Fator = 2/4 = 0.5 (Desacelerar).
    const tempoFactor = ttsDuration / targetDuration;
    const atempoString = getAtempoFilter(tempoFactor);
    
    // Delay em milissegundos
    const delayMs = Math.floor(seg.startTime * 1000);
    
    // [i:a]atempo=X,adelay=Y|Y[a_i]
    filterComplex += `[${i}:a]${atempoString},adelay=${delayMs}|${delayMs}[a${i}];`;
  }

  // Mixar tudo
  // Ex: [a0][a1][a2]amix=inputs=3:dropout_transition=0[out]
  let mixInputs = "";
  for(let i=0; i<segments.length; i++) mixInputs += `[a${i}]`;
  
  // IMPORTANTE: normalize=0 para não baixar o volume quando houver sobreposição
  filterComplex += `${mixInputs}amix=inputs=${segments.length}:dropout_transition=0:normalize=0[out]`;

  await ffmpeg.exec([
    // Inputs dinâmicos
    ...inputs.trim().split(' '),
    '-filter_complex', filterComplex,
    '-map', '[out]',
    'output.mp3'
  ]);

  const data = await ffmpeg.readFile('output.mp3');
  return new Blob([data], { type: 'audio/mp3' });
};

const getAudioDuration = async (buffer: ArrayBuffer): Promise<number> => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(buffer.slice(0)); // slice para clonar e não invalidar
  return decoded.duration;
};
