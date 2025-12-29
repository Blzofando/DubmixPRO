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

// Filtro de velocidade (atempo)
const getAtempoFilter = (factor: number): string => {
  if (isNaN(factor) || !isFinite(factor) || factor <= 0) return "atempo=1.0";
  if (Math.abs(factor - 1.0) < 0.01) return "atempo=1.0"; 

  let filters = [];
  let remaining = factor;
  
  while (remaining > 2.0) { filters.push("atempo=2.0"); remaining /= 2.0; }
  while (remaining < 0.5) { filters.push("atempo=0.5"); remaining /= 0.5; }
  
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(',');
};

const getAudioDuration = async (buffer: ArrayBuffer): Promise<number> => {
  if (!buffer || buffer.byteLength === 0) return 0;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    return decoded.duration;
  } catch { return 0; }
  finally { if (ctx.state !== 'closed') await ctx.close(); }
};

export const extractAudioFromVideo = async (file: File): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  const safeName = 'input.mp4'; 
  await ffmpeg.writeFile(safeName, new Uint8Array(await file.arrayBuffer()));
  await ffmpeg.exec(['-y', '-i', safeName, '-vn', '-ac', '2', '-ar', '44100', '-map', 'a', 'audio.mp3']);
  const data = await ffmpeg.readFile('audio.mp3');
  return new Blob([data as any], { type: 'audio/mp3' });
};

export const assembleFinalAudio = async (
  segments: SubtitleSegment[], 
  audioBuffers: ArrayBuffer[]
): Promise<Blob> => {
  const ffmpeg = await loadFFmpeg();
  
  // Limpa ambiente
  try { await ffmpeg.deleteFile('output.mp3'); } catch {}

  let filterComplex = "";
  let inputsStr = "";
  let validCount = 0;

  for (let i = 0; i < segments.length; i++) {
    // 1. Validação básica
    if (!audioBuffers[i] || audioBuffers[i].byteLength === 0) continue;

    const seg = segments[i];
    const durationOriginal = seg.endTime - seg.startTime;
    const targetDuration = Math.max(0.1, durationOriginal);

    // 2. Escreve o áudio RAW (com silêncio) no disco virtual
    const rawName = `raw_${i}.mp3`;
    const cleanName = `clean_${i}.mp3`;
    
    await ffmpeg.writeFile(rawName, new Uint8Array(audioBuffers[i].slice(0)));

    // 3. REMOVE SILÊNCIO (O Pulo do Gato 🐱)
    // start_periods=1: remove silêncio do início
    // stop_periods=1: remove silêncio do fim
    // threshold=-50dB: sensibilidade do que é silêncio
    try {
        await ffmpeg.exec([
            '-y', '-i', rawName, 
            '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:stop_periods=1:stop_threshold=-50dB:stop_duration=0.1', 
            cleanName
        ]);
    } catch (e) {
        console.warn(`Falha ao limpar silêncio do seg ${i}, usando raw.`);
        // Fallback: se falhar a limpeza, copia o raw para o clean
        await ffmpeg.exec(['-y', '-i', rawName, cleanName]); 
    }

    // 4. Lê o áudio LIMPO para calcular a duração real da fala
    const cleanData = await ffmpeg.readFile(cleanName);
    const cleanBuffer = (cleanData as Uint8Array).buffer;
    const speechDuration = await getAudioDuration(cleanBuffer);

    if (speechDuration === 0) continue;

    // 5. Calcula velocidade baseada na FALA REAL vs TEMPO DISPONÍVEL
    const speedFactor = speechDuration / targetDuration;
    const atempoCmd = getAtempoFilter(speedFactor);
    
    // Adiciona o arquivo LIMPO à lista de inputs
    inputsStr += `-i ${cleanName} `;

    // 6. Monta o filtro de mixagem
    const delayMs = Math.floor(seg.startTime * 1000);
    filterComplex += `[${validCount}:a]${atempoCmd},adelay=${delayMs}|${delayMs}[a${validCount}];`;
    
    validCount++;
  }

  if (validCount === 0) throw new Error("Nenhum áudio válido gerado.");

  // Mixagem final
  let mixInputs = "";
  for(let i=0; i<validCount; i++) mixInputs += `[a${i}]`;
  filterComplex += `${mixInputs}amix=inputs=${validCount}:dropout_transition=0:normalize=0[out]`;

  await ffmpeg.exec([
    ...inputsStr.trim().split(' '),
    '-filter_complex', filterComplex,
    '-map', '[out]',
    'output.mp3'
  ]);

  const data = await ffmpeg.readFile('output.mp3');
  return new Blob([data as any], { type: 'audio/mp3' });
};

