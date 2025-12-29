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

const fetchFile = async (file: File): Promise<Uint8Array> => {
  return new Uint8Array(await file.arrayBuffer());
};

export const extractAudioFromVideo = async (file: File): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  const safeName = 'input_file' + file.name.substring(file.name.lastIndexOf('.'));
  await ffmpeg.writeFile(safeName, await fetchFile(file));
  await ffmpeg.exec(['-y', '-i', safeName, '-vn', '-ac', '2', '-ar', '44100', '-map', 'a', 'audio.mp3']);
  const data = await ffmpeg.readFile('audio.mp3');
  return new Blob([data as any], { type: 'audio/mp3' });
};

const getAtempoFilter = (factor: number): string => {
  if (factor === 1) return "atempo=1.0";
  let filters = [];
  let remaining = factor;
  while (remaining > 2.0) { filters.push("atempo=2.0"); remaining /= 2.0; }
  while (remaining < 0.5) { filters.push("atempo=0.5"); remaining /= 0.5; }
  filters.push(`atempo=${remaining}`);
  return filters.join(',');
};

// CORREÇÃO 1: Proteção contra buffer vazio
const getAudioDuration = async (buffer: ArrayBuffer): Promise<number> => {
  if (!buffer || buffer.byteLength === 0) return 0; // Retorna 0 se estiver vazio

  const bufferClone = buffer.slice(0); 
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    const decoded = await ctx.decodeAudioData(bufferClone);
    return decoded.duration;
  } catch (e) {
    console.warn("Falha ao decodificar pedaço de áudio (provavelmente vazio ou corrompido). Ignorando.", e);
    return 0; // Retorna 0 em caso de erro de decodificação
  } finally {
    if (ctx.state !== 'closed') await ctx.close();
  }
};

export const assembleFinalAudio = async (
  segments: SubtitleSegment[], 
  audioBuffers: ArrayBuffer[]
): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  try { await ffmpeg.deleteFile('output.mp3'); } catch(e){}

  let filterComplex = "";
  let inputsStr = "";
  let validInputCount = 0; // Contador de inputs válidos (para o FFmpeg não se perder)
  
  // Itera sobre todos os segmentos
  for (let i = 0; i < segments.length; i++) {
    // CORREÇÃO 2: Se o áudio estiver vazio, pula esse segmento (fica silêncio no vídeo)
    if (!audioBuffers[i] || audioBuffers[i].byteLength === 0) {
      console.warn(`Segmento ${i} ignorado (áudio vazio).`);
      continue;
    }

    // Grava o arquivo no FFmpeg usando o contador de válidos
    const filename = `seg_${validInputCount}.mp3`;
    const bufferForWrite = audioBuffers[i].slice(0);
    await ffmpeg.writeFile(filename, new Uint8Array(bufferForWrite));
    
    inputsStr += `-i ${filename} `;

    // Calcula duração e filtros
    const bufferForDuration = audioBuffers[i].slice(0);
    const ttsDuration = await getAudioDuration(bufferForDuration);
    
    // Se duração for 0 (erro), pula
    if (ttsDuration === 0) continue;

    const seg = segments[i];
    // Evita divisão por zero ou duração negativa
    const targetDuration = Math.max(0.1, seg.endTime - seg.startTime);
    
    // Calcula o 'atempo'
    const tempoFactor = ttsDuration / targetDuration;
    const atempoString = getAtempoFilter(tempoFactor);
    const delayMs = Math.floor(seg.startTime * 1000);
    
    // Usa validInputCount como índice no filtro ([0:a], [1:a]...)
    filterComplex += `[${validInputCount}:a]${atempoString},adelay=${delayMs}|${delayMs}[a${validInputCount}];`;
    
    validInputCount++;
  }

  // Se nenhum áudio foi válido, retorna erro ou cria silêncio
  if (validInputCount === 0) {
    throw new Error("Nenhum áudio válido foi gerado.");
  }

  // Mixagem final
  let mixInputs = "";
  for(let i=0; i<validInputCount; i++) mixInputs += `[a${i}]`;
  
  filterComplex += `${mixInputs}amix=inputs=${validInputCount}:dropout_transition=0:normalize=0[out]`;

  await ffmpeg.exec([
    ...inputsStr.trim().split(' '),
    '-filter_complex', filterComplex,
    '-map', '[out]',
    'output.mp3'
  ]);

  const data = await ffmpeg.readFile('output.mp3');
  return new Blob([data as any], { type: 'audio/mp3' });
};
