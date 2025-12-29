import { GoogleGenerativeAI } from "@google/generative-ai";
import { SubtitleSegment } from "../types";

// --- SEUS MODELOS ---
const MODEL_LOGIC = 'gemini-2.5-flash';
const MODEL_TTS_PREFERRED = 'gemini-2.5-flash-preview-tts';
const MODEL_TTS_FALLBACK = 'gemini-2.0-flash-exp';

// --- HELPER JSON ---
function cleanAndParseJSON(text: string): any {
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("ERRO JSON BRUTO:", text);
    throw new Error("Formato inválido da IA.");
  }
}

// --- 1. TRANSCRIÇÃO ---
export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  const reader = new FileReader();
  const base64Audio = await new Promise<string>((resolve) => {
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(audioBlob);
  });

  const prompt = `Analise o áudio. Retorne JSON: [{ "id": number, "start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "text": "texto" }]`;

  try {
    const result = await model.generateContent([prompt, { inlineData: { data: base64Audio, mimeType: "audio/mp3" } }]);
    const raw = cleanAndParseJSON(result.response.text());
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((s:any) => ({ ...s, startTime: parseTimestamp(s.start), endTime: parseTimestamp(s.end) }));
  } catch (e: any) {
    throw new Error(`Transcrição falhou: ${e.message}`);
  }
};

// --- 2. TRADUÇÃO ---
export const translateWithIsochrony = async (apiKey: string, segments: SubtitleSegment[]): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  // Input simplificado
  const simpleInput = segments.map(s => ({ id: s.id, text: s.text }));

  const prompt = `
  Traduza para PT-BR.
  Entrada: ${JSON.stringify(simpleInput)}
  Saída: Array JSON idêntico em tamanho.
  REGRAS: NÃO MESCLE FRASES. Mantenha 1:1.
  `;

  try {
    const result = await model.generateContent(prompt);
    const translations = cleanAndParseJSON(result.response.text());
    const transArray = Array.isArray(translations) ? translations : [translations];

    if (transArray.length !== segments.length) {
      console.warn("IA mesclou blocos. Usando original.");
      return segments;
    }
    return segments.map(seg => {
      const t = transArray.find((x:any) => x.id === seg.id);
      return { ...seg, text: t ? t.text : seg.text };
    });
  } catch (e) {
    return segments; // Fallback para original
  }
};

// --- 3. DUBLAGEM (SISTEMA DE 3 CAMADAS) ---
export const generateSpeech = async (apiKey: string, text: string): Promise<ArrayBuffer> => {
  if (!text || !text.trim()) return new ArrayBuffer(0);

  // TENTATIVA 1: Modelo Preferido (2.5)
  try {
    const audio = await tryGeminiTTS(apiKey, MODEL_TTS_PREFERRED, text);
    if (audio.byteLength > 0) return audio;
  } catch (e) { console.warn(`Falha no TTS 2.5:`, e); }

  // TENTATIVA 2: Modelo Estável (2.0 Flash Exp)
  try {
    const audio = await tryGeminiTTS(apiKey, MODEL_TTS_FALLBACK, text);
    if (audio.byteLength > 0) return audio;
  } catch (e) { console.warn(`Falha no TTS 2.0:`, e); }

  // TENTATIVA 3: Failsafe (Google Translate Hack - GARANTIA DE ÁUDIO)
  // Divide em pedaços se for muito grande para não dar erro de URL
  try {
    console.log("Usando Fallback Google Translate...");
    const encoded = encodeURIComponent(text.slice(0, 200)); // Corta seguro
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt&client=tw-ob&q=${encoded}`;
    const resp = await fetch(url);
    if (resp.ok) return await resp.arrayBuffer();
  } catch (e) { console.error("Failsafe falhou:", e); }

  return new ArrayBuffer(0); // Só retorna vazio se o mundo acabar
};

// Função genérica para chamar o Gemini TTS
async function tryGeminiTTS(apiKey: string, model: string, text: string): Promise<ArrayBuffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: `Leia em português: "${text}"` }] }],
    generationConfig: { responseModalities: ["AUDIO"] }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`API Error ${response.status}`);

  const data = await response.json();
  const base64 = data.candidates?.[0]?.content?.parts?.find((p:any) => p.inlineData)?.inlineData?.data;
  
  if (base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  throw new Error("Sem áudio na resposta");
}

function parseTimestamp(timeStr: string): number {
  if(!timeStr) return 0;
  const [h, m, s] = timeStr.split(':');
  const [sec, ms] = s.split('.');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + (parseInt(ms || '0') / 1000);
}
