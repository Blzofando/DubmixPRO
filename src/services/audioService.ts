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

// --- HELPER: Filtro de velocidade Inteligente ---
const getSpeedFilter = (sourceDuration: number, targetDuration: number): string => {
  // Se o áudio é MAIOR que o espaço (ex: 10s audio em 5s slot) -> Acelera (Speed > 1)
  // Se o áudio é MENOR que o espaço (ex: 2s audio em 10s slot) -> NÃO MEXE (Speed = 1). Não queremos slow motion!
  
  let speedFactor = sourceDuration / targetDuration;

  // TRAVA DE SEGURANÇA:
  // Se o áudio for menor que o slot, speedFactor será < 1 (ex: 0.2).
  // Forçamos para 1.0 para não ter voz de robô lento.
  if (speedFactor < 1.0) speedFactor = 1.0;

  // Se precisar acelerar muito (mais de 2x), limitamos a 2.5x para não ficar ininteligível
  // (Vai cortar o final, mas é melhor que ficar parecendo um esquilo irreconhecível)
  if (speedFactor > 2.5) speedFactor = 2.5;

  // Formata o filtro atempo do FFmpeg (limite 0.5 a 2.0 por filtro)
  if (Math.abs(speedFactor - 1.0) < 0.05) return "atempo=1.0"; 

  let filters = [];
  let remaining = speedFactor;
  
  while (remaining > 2.0) { filters.push("atempo=2.0"); remaining /= 2.0; }
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
  
  // Limpa ambiente anterior
  try { await ffmpeg.deleteFile('output.mp3'); } catch {}

  let filterComplex = "";
  let inputsStr = "";
  let validCount = 0;

  for (let i = 0; i < segments.length; i++) {
    // 1. Validação
    if (!audioBuffers[i] || audioBuffers[i].byteLength === 0) continue;

    const seg = segments[i];
    const durationSlot = seg.endTime - seg.startTime;
    
    // Proteção contra slots minúsculos
    const targetDuration = Math.max(0.2, durationSlot);

    // 2. Salva o áudio original
    const rawName = `seg_${i}.mp3`;
    await ffmpeg.writeFile(rawName, new Uint8Array(audioBuffers[i].slice(0)));

    // 3. Verifica duração real
    const ttsDuration = await getAudioDuration(audioBuffers[i].slice(0));
    if (ttsDuration === 0) continue;

    // 4. Calcula velocidade (SEM SLOW MOTION)
    const atempoCmd = getSpeedFilter(ttsDuration, targetDuration);

    inputsStr += `-i ${rawName} `;

    // 5. Monta o filtro:
    // [in] -> atempo (ajuste velocidade) -> apad (segurança fim) -> adelay (posicionamento)
    // 'apad' adiciona um pouquinho de silêncio no final para o corte não ser brusco
    const delayMs = Math.floor(seg.startTime * 1000);
    
    filterComplex += `[${validCount}:a]${atempoCmd},apad=pad_dur=0.1,adelay=${delayMs}|${delayMs}[a${validCount}];`;
    
    validCount++;
  }

  if (validCount === 0) throw new Error("Nenhum áudio válido gerado.");

  // Mixagem final
  // dropout_transition=1000 ajuda a suavizar a entrada de outros audios
  let mixInputs = "";
  for(let i=0; i<validCount; i++) mixInputs += `[a${i}]`;
  filterComplex += `${mixInputs}amix=inputs=${validCount}:dropout_transition=1000:normalize=0[out]`;

  // Executa
  await ffmpeg.exec([
    ...inputsStr.trim().split(' '),
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-ac', '2', // Garante stereo
    'output.mp3'
  ]);

  const data = await ffmpeg.readFile('output.mp3');
  return new Blob([data as any], { type: 'audio/mp3' });
};
