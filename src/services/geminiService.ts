import { GoogleGenerativeAI } from "@google/generative-ai";
import { SubtitleSegment } from "../types";

const MODEL_LOGIC = 'gemini-3-flash-preview';

// Modelo solicitado pelo usuário via print/Python snippet
const OPENAI_TTS_MODEL_PREFERRED = 'gpt-4o-mini-tts'; 
const OPENAI_TTS_MODEL_FALLBACK = 'tts-1';

// --- HELPER: Limpeza de JSON ---
function cleanAndParseJSON(text: string): any {
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } 
  catch (e) { throw new Error("Erro no formato JSON retornado pela IA."); }
}

// --- HELPER: Correção de Timestamp ---
function parseTimestamp(timeStr: string): number {
  if (!timeStr) return 0;
  let clean = timeStr.replace(/[\[\]]/g, '').trim().replace(',', '.');
  const parts = clean.split(':');

  if (parts.length === 3) {
    const p1 = parseFloat(parts[0]);
    const p2 = parseFloat(parts[1]);
    const p3 = parseFloat(parts[2]);
    // Lógica para detectar milissegundos formatados errados (ex: 01:05:500)
    if (p3 >= 60 || !parts[2].includes('.')) {
      return (p1 * 60) + p2 + (p3 / 1000);
    } else {
      return (p1 * 3600) + (p2 * 60) + p3;
    }
  }
  if (parts.length === 2) {
    return (parseFloat(parts[0]) * 60) + parseFloat(parts[1]);
  }
  return 0;
}

// --- 1. TRANSCRIÇÃO (MANTIDO PROMPT ROBUSTO) ---
export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  const reader = new FileReader();
  const base64Audio = await new Promise<string>((resolve) => {
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(audioBlob);
  });

  const prompt = `
  Você é um especialista em transcrição de áudio para legendagem profissional.
  TAREFA: Analise o áudio e gere uma transcrição segmentada com timestamps precisos.
  REGRAS:
  1. Retorne APENAS um JSON válido.
  2. Estrutura: [{ "id": number, "start": "MM:SS.mmm", "end": "MM:SS.mmm", "text": "transcrição" }]
  3. Use PONTO (.) para milissegundos (ex: 00:05.500).
  `;

  try {
    const result = await model.generateContent([
      prompt, 
      { inlineData: { data: base64Audio, mimeType: "audio/mp3" } }
    ]);
    
    const raw = cleanAndParseJSON(result.response.text());
    const arr = Array.isArray(raw) ? raw : [raw];
    
    return arr.map((s:any) => ({ 
      ...s, 
      startTime: parseTimestamp(s.start), 
      endTime: parseTimestamp(s.end) 
    }));
  } catch (e: any) {
    throw new Error(`Falha na Transcrição: ${e.message}`);
  }
};

// --- 2. TRADUÇÃO ISOCRÔNICA (COM CONTAGEM DE CARACTERES) ---
export const translateWithIsochrony = async (apiKey: string, segments: SubtitleSegment[]): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  // Input Rico: ID, Texto, Duração E CONTAGEM DE CARACTERES
  const enrichedInput = segments.map(s => ({ 
    id: s.id, 
    text: s.text,
    duration: (s.endTime - s.startTime).toFixed(2) + "s",
    originalCharCount: s.text.length // META DE TAMANHO
  }));

  const prompt = `
  Você é um especialista em Dublagem e Localização para PT-BR.
  OBJETIVO: Traduzir respeitando a ISOCRONIA VISUAL (Tamanho) e TEMPORAL (Duração).
  
  ENTRADA: ${JSON.stringify(enrichedInput)}
  
  REGRAS DE DUBLAGEM:
  1. A tradução DEVE ter APROXIMADAMENTE O MESMO NÚMERO DE CARACTERES do original (+/- 8 chars).
  2. Adapte criativamente (sinônimos, gírias leves) para caber na meta.
  3. O texto deve caber no tempo indicado em "duration".
  4. NÃO MESCLE FRASES. Saída 1:1.
  
  SAÍDA: JSON [{ "id": number, "text": "texto ajustado" }]
  `;

  try {
    const result = await model.generateContent(prompt);
    const transArray = cleanAndParseJSON(result.response.text());
    
    if (!Array.isArray(transArray) || transArray.length !== segments.length) {
      console.warn("A IA não respeitou a quantidade de linhas. Usando fallback.");
      return segments;
    }

    return segments.map(seg => {
      const t = transArray.find((x:any) => x.id === seg.id);
      return { ...seg, text: t ? t.text : seg.text };
    });
  } catch (e) { 
    console.error("Erro na tradução:", e);
    return segments; 
  }
};

// --- 3. DUBLAGEM (OPENAI GPT-4o-MINI-TTS) ---
export const generateSpeechOpenAI = async (openAIKey: string, text: string): Promise<ArrayBuffer> => {
  if (!text || !text.trim()) return new ArrayBuffer(0);

  // Função interna para tentar um modelo específico
  const tryModel = async (modelName: string) => {
    
    const payload: any = {
      model: modelName,
      input: text,
      voice: "marin", // VOZ SOLICITADA
      response_format: "mp3"
    };

    // Adiciona instruções apenas se for o modelo novo (gpt-4o), pois tts-1 pode não suportar
    if (modelName.includes('gpt-4o')) {
       payload.instructions = "Fale com entonação natural, fluida e expressiva em Português Brasileiro, adequada para dublagem de filmes.";
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || response.statusText);
    }
    return await response.arrayBuffer();
  };

  try {
    // Tenta primeiro o modelo GPT-4o-mini-tts com a voz Marin
    try {
      return await tryModel(OPENAI_TTS_MODEL_PREFERRED);
    } catch (e) {
      console.warn(`Modelo ${OPENAI_TTS_MODEL_PREFERRED} falhou. Tentando fallback para ${OPENAI_TTS_MODEL_FALLBACK}.`, e);
      // Se falhar, tenta o tts-1 clássico (também com marin)
      return await tryModel(OPENAI_TTS_MODEL_FALLBACK);
    }
  } catch (finalError: any) {
    console.error("Erro Fatal OpenAI:", finalError);
    return new ArrayBuffer(0);
  }
};
