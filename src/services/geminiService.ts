import { GoogleGenerativeAI } from "@google/generative-ai";
import { SubtitleSegment } from "../types";

// --- SEUS MODELOS (NÃO FORAM ALTERADOS) ---
const MODEL_LOGIC = 'gemini-2.5-flash';
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';

// --- FUNÇÃO AUXILIAR PARA LIMPAR JSON ---
function cleanAndParseJSON(text: string): any {
  // Remove markdown ```json ... ``` e espaços extras
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("ERRO JSON BRUTO:", text);
    throw new Error("A IA retornou um formato inválido. Tente novamente.");
  }
}

// --- 1. TRANSCRIÇÃO ---
export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  const reader = new FileReader();
  const base64Audio = await new Promise<string>((resolve) => {
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(audioBlob);
  });

  const prompt = `
  Analise o áudio. Retorne um JSON ESTRITAMENTE VÁLIDO com a transcrição e timestamps.
  Formato: [{ "id": number, "start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "text": "transcrição" }]
  REGRAS:
  1. O output deve ser APENAS O JSON PURO. Sem markdown.
  2. Quebre o texto em sentenças curtas sempre que possível.
  `;

  try {
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Audio, mimeType: "audio/mp3" } }
    ]);
    
    const rawSegments = cleanAndParseJSON(result.response.text());
    
    // Garante que é um array
    const segmentsArray = Array.isArray(rawSegments) ? rawSegments : [rawSegments];

    return segmentsArray.map((seg: any) => ({
      ...seg,
      startTime: parseTimestamp(seg.start),
      endTime: parseTimestamp(seg.end)
    }));
  } catch (e: any) {
    console.error("Erro Transcrição:", e);
    throw new Error(`Falha na Transcrição: ${e.message}`);
  }
};

// --- 2. TRADUÇÃO (COM PROTEÇÃO ANTI-MESCLAGEM) ---
export const translateWithIsochrony = async (apiKey: string, segments: SubtitleSegment[]): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  // Envia apenas o necessário para economizar tokens e evitar confusão
  const simpleInput = segments.map(s => ({ id: s.id, text: s.text }));

  const prompt = `
  Traduza para PT-BR respeitando a Isocronia.
  Entrada: Array de ${segments.length} objetos.
  Saída: Array de EXATAMENTE ${segments.length} objetos.
  
  REGRAS CRÍTICAS:
  1. NÃO MESCLE FRASES. Mantenha a correspondência 1 para 1 pelo ID.
  2. Retorne apenas JSON: [{ "id": number, "text": "tradução" }]
  
  Dados: ${JSON.stringify(simpleInput)}
  `;

  try {
    const result = await model.generateContent(prompt);
    const translations = cleanAndParseJSON(result.response.text());
    const transArray = Array.isArray(translations) ? translations : [translations];
    
    // VERIFICAÇÃO DE SEGURANÇA:
    // Se a IA mesclou os blocos (ex: entrou 10, saiu 1), ignoramos a tradução para não quebrar o áudio.
    if (transArray.length !== segments.length) {
      console.warn(`IA Mesclou blocos incorretamente (Entrou: ${segments.length}, Saiu: ${transArray.length}). Usando texto original.`);
      return segments;
    }

    return segments.map(seg => {
      const trans = transArray.find((t: any) => t.id === seg.id);
      return { ...seg, text: trans ? trans.text : seg.text };
    });

  } catch (e: any) {
    console.error("Erro Tradução:", e);
    // Fallback: retorna o original se der erro no JSON, para não travar o app
    return segments;
  }
};

// --- 3. DUBLAGEM (USANDO SEU MODELO ESPECÍFICO VIA POST) ---
export const generateSpeech = async (apiKey: string, text: string): Promise<ArrayBuffer> => {
  if (!text || text.trim().length === 0) return new ArrayBuffer(0);

  // Aqui usamos o endpoint REST direto para poder enviar o JSON via POST.
  // Isso resolve o problema de limite de caracteres da URL.
  // Usando o SEU modelo: gemini-2.5-flash-preview-tts
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TTS}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ 
      parts: [{ text: `Leia o seguinte texto em português brasileiro com entonação natural: "${text}"` }] 
    }],
    generationConfig: { 
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Aoede" // Voz padrão do Gemini, pode variar conforme o modelo
          }
        }
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("Erro API Gemini TTS:", err);
      throw new Error(`Erro TTS (${response.status}): Verifique se o modelo '${MODEL_TTS}' está ativo na sua Key.`);
    }

    const data = await response.json();
    
    // O Gemini retorna o áudio em base64 dentro de candidates -> inlineData
    // Precisamos navegar com segurança no objeto
    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.find((p: any) => p.inlineData);

    if (part && part.inlineData && part.inlineData.data) {
      const base64 = part.inlineData.data;
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    } else {
      throw new Error("A API respondeu, mas não enviou áudio válido.");
    }

  } catch (e: any) {
    console.error("Falha no TTS:", e);
    // Retorna buffer vazio para não quebrar o loop do FFmpeg, apenas fica mudo esse trecho
    return new ArrayBuffer(0);
  }
};

// Helper de tempo
function parseTimestamp(timeStr: string): number {
  if(!timeStr) return 0;
  const [h, m, s] = timeStr.split(':');
  const [sec, ms] = s.split('.');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + (parseInt(ms || '0') / 1000);
}
