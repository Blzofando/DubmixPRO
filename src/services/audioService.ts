import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { SubtitleSegment } from '../types';

let ffmpeg: FFmpeg | null = null;

const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  
  // Carrega os arquivos essenciais do FFmpeg para rodar no navegador
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  return ffmpeg;
};

// Função auxiliar para ler arquivo
const fetchFile = async (file: File): Promise<Uint8Array> => {
  return new Uint8Array(await file.arrayBuffer());
};

// Extrai áudio do vídeo original
export const extractAudioFromVideo = async (file: File): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  
  const safeName = 'input_file' + file.name.substring(file.name.lastIndexOf('.'));
  await ffmpeg.writeFile(safeName, await fetchFile(file));
  
  // Converte para mp3 simples
  await ffmpeg.exec(['-y', '-i', safeName, '-vn', '-ac', '2', '-ar', '44100', '-map', 'a', 'audio.mp3']);
  
  const data = await ffmpeg.readFile('audio.mp3');
  return new Blob([data as any], { type: 'audio/mp3' });
};

// Cria o filtro de velocidade (atempo)
const getAtempoFilter = (factor: number): string => {
  if (factor === 1) return "atempo=1.0";
  let filters = [];
  let remaining = factor;
  
  // O filtro atempo só aceita entre 0.5 e 2.0, então encadeamos se precisar mais
  while (remaining > 2.0) { filters.push("atempo=2.0"); remaining /= 2.0; }
  while (remaining < 0.5) { filters.push("atempo=0.5"); remaining /= 0.5; }
  filters.push(`atempo=${remaining}`);
  
  return filters.join(',');
};

// Calcula a duração do áudio (com proteção de memória)
const getAudioDuration = async (buffer: ArrayBuffer): Promise<number> => {
  // CLONE DE SEGURANÇA: .slice(0) cria uma cópia nova na memória
  const bufferClone = buffer.slice(0); 
  
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const decoded = await ctx.decodeAudioData(bufferClone);
    return decoded.duration;
  } finally {
    // Fecha o contexto para liberar memória do celular
    if (ctx.state !== 'closed') await ctx.close();
  }
};

export const assembleFinalAudio = async (
  segments: SubtitleSegment[], 
  audioBuffers: ArrayBuffer[]
): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  
  // Limpa arquivos anteriores
  try { await ffmpeg.deleteFile('output.mp3'); } catch(e){}

  let filterComplex = "";
  let inputs = "";
  
  // PASSO 1: Escrever arquivos no sistema do FFmpeg
  for (let i = 0; i < segments.length; i++) {
    const filename = `seg_${i}.mp3`;
    
    // CLONE DE SEGURANÇA: Garante que o buffer não suma ao ser escrito
    const bufferForWrite = audioBuffers[i].slice(0);
    
    await ffmpeg.writeFile(filename, new Uint8Array(bufferForWrite));
    inputs += `-i ${filename} `;
  }

  // PASSO 2: Montar filtros
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    
    // CLONE DE SEGURANÇA: Para leitura da duração
    const bufferForDuration = audioBuffers[i].slice(0);
    const ttsDuration = await getAudioDuration(bufferForDuration);
    
    const targetDuration = Math.max(0.5, seg.endTime - seg.startTime);
    const tempoFactor = ttsDuration / targetDuration;
    const atempoString = getAtempoFilter(tempoFactor);
    const delayMs = Math.floor(seg.startTime * 1000);
    
    filterComplex += `[${i}:a]${atempoString},adelay=${delayMs}|${delayMs}[a${i}];`;
  }

  // Mixagem final
  let mixInputs = "";
  for(let i=0; i<segments.length; i++) mixInputs += `[a${i}]`;
  
  filterComplex += `${mixInputs}amix=inputs=${segments.length}:dropout_transition=0:normalize=0[out]`;

  // Executa o comando pesado
  await ffmpeg.exec([
    ...inputs.trim().split(' '),
    '-filter_complex', filterComplex,
    '-map', '[out]',
    'output.mp3'
  ]);

  const data = await ffmpeg.readFile('output.mp3');
  
  // Retorna o arquivo final
  return new Blob([data as any], { type: 'audio/mp3' });
};
