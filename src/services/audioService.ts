import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { SubtitleSegment } from '../types';

let ffmpeg: FFmpeg | null = null;

const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  // Carregamento do Core do FFmpeg (pesado, mas necessário)
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
  
  // Usa o nome original para o FFmpeg detectar a extensão (mp3, wav, mp4)
  const safeName = 'input_file' + file.name.substring(file.name.lastIndexOf('.'));
  
  await ffmpeg.writeFile(safeName, await fetchFile(file));
  
  // Extrair/Converter para mp3 padrão (funciona tanto se a entrada for vídeo quanto áudio)
  // -y = sobrescrever, -vn = ignorar vídeo, -ac 2 = stereo, -ar 44100 = taxa padrão
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

const getAudioDuration = async (buffer: ArrayBuffer): Promise<number> => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(buffer.slice(0)); 
  return decoded.duration;
};

export const assembleFinalAudio = async (
  segments: SubtitleSegment[], 
  audioBuffers: ArrayBuffer[]
): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  
  try { await ffmpeg.deleteFile('output.mp3'); } catch(e){}

  let filterComplex = "";
  let inputs = "";
  
  for (let i = 0; i < segments.length; i++) {
    const filename = `seg_${i}.mp3`;
    await ffmpeg.writeFile(filename, new Uint8Array(audioBuffers[i]));
    inputs += `-i ${filename} `;
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const ttsDuration = await getAudioDuration(audioBuffers[i]);
    
    // Evitar divisão por zero ou duração muito curta
    const targetDuration = Math.max(0.5, seg.endTime - seg.startTime);
    
    const tempoFactor = ttsDuration / targetDuration;
    const atempoString = getAtempoFilter(tempoFactor);
    const delayMs = Math.floor(seg.startTime * 1000);
    
    filterComplex += `[${i}:a]${atempoString},adelay=${delayMs}|${delayMs}[a${i}];`;
  }

  let mixInputs = "";
  for(let i=0; i<segments.length; i++) mixInputs += `[a${i}]`;
  
  filterComplex += `${mixInputs}amix=inputs=${segments.length}:dropout_transition=0:normalize=0[out]`;

  await ffmpeg.exec([
    ...inputs.trim().split(' '),
    '-filter_complex', filterComplex,
    '-map', '[out]',
    'output.mp3'
  ]);

  const data = await ffmpeg.readFile('output.mp3');
  return new Blob([data as any], { type: 'audio/mp3' });
};
