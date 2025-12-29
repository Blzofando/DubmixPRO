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

// Função auxiliar para ler arquivo para Uint8Array
const fetchFile = async (file: File): Promise<Uint8Array> => {
  return new Uint8Array(await file.arrayBuffer());
};

export const extractAudioFromVideo = async (videoFile: File): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  await ffmpeg.writeFile('input_video', await fetchFile(videoFile));
  
  // Extrair mp3 rápido
  await ffmpeg.exec(['-i', 'input_video', '-q:a', '0', '-map', 'a', 'audio.mp3']);
  
  const data = await ffmpeg.readFile('audio.mp3');
  
  // CORREÇÃO AQUI: [data as any] para evitar erro de SharedArrayBuffer
  return new Blob([data as any], { type: 'audio/mp3' });
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

const getAudioDuration = async (buffer: ArrayBuffer): Promise<number> => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(buffer.slice(0)); // slice para clonar
  return decoded.duration;
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
    
    // Obter duração real do áudio gerado
    const ttsDuration = await getAudioDuration(audioBuffers[i]);
    const targetDuration = seg.endTime - seg.startTime;
    
    // Calcular fator de velocidade para encaixar no slot de tempo (correção bug iOS/Esquilo)
    const tempoFactor = ttsDuration / targetDuration;
    const atempoString = getAtempoFilter(tempoFactor);
    
    // Delay em milissegundos para posicionamento
    const delayMs = Math.floor(seg.startTime * 1000);
    
    // [i:a]atempo=X,adelay=Y|Y[a_i]
    filterComplex += `[${i}:a]${atempoString},adelay=${delayMs}|${delayMs}[a${i}];`;
  }

  // Mixar tudo
  let mixInputs = "";
  for(let i=0; i<segments.length; i++) mixInputs += `[a${i}]`;
  
  // IMPORTANTE: normalize=0 para não baixar volume nas sobreposições
  filterComplex += `${mixInputs}amix=inputs=${segments.length}:dropout_transition=0:normalize=0[out]`;

  await ffmpeg.exec([
    // Inputs dinâmicos
    ...inputs.trim().split(' '),
    '-filter_complex', filterComplex,
    '-map', '[out]',
    'output.mp3'
  ]);

  const data = await ffmpeg.readFile('output.mp3');
  
  // CORREÇÃO AQUI: [data as any]
  return new Blob([data as any], { type: 'audio/mp3' });
};

