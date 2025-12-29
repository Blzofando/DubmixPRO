import { GoogleGenerativeAI } from "@google/generative-ai";
import { SubtitleSegment } from "../types";

const MODEL_LOGIC = 'gemini-2.5-flash';

// Modelo solicitado: gpt-4o-mini-tts-2025-03-20
// Nota: Se este modelo específico falhar na API pública, o código tentará o 'tts-1' automaticamente.
const OPENAI_TTS_MODEL_PREFERRED = 'gpt-4o-mini-tts-2025-03-20';
const OPENAI_TTS_MODEL_FALLBACK = 'tts-1';

// --- HELPER: Limpeza de JSON ---
function cleanAndParseJSON(text: string): any {
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } 
  catch (e) { throw new Error("Erro no formato JSON retornado pela IA."); }
}

// --- HELPER: Correção de Timestamp (RESOLVE O BUG DE 1 HORA) ---
function parseTimestamp(timeStr: string): number {
  if (!timeStr) return 0;

  // Limpeza de caracteres estranhos
  let clean = timeStr.replace(/[\[\]]/g, '').trim();
  clean = clean.replace(',', '.'); // Aceita padrão europeu

  const parts = clean.split(':');

  // Caso Problemático: "01:45:558" (Onde 558 deveria ser ms, mas usaram :)
  if (parts.length === 3) {
    const p1 = parseFloat(parts[0]);
    const p2 = parseFloat(parts[1]);
    const p3 = parseFloat(parts[2]);

    // LÓGICA INTELIGENTE:
    // Se o terceiro número for >= 60 (ex: 148, 558), ele é milissegundo, não segundo!
    // Ou se o terceiro bloco não tiver ponto decimal.
    if (p3 >= 60 || !parts[2].includes('.')) {
      // Formato inferido: Minuto : Segundo : Milissegundo
      return (p1 * 60) + p2 + (p3 / 1000);
    } else {
      // Formato padrão: Hora : Minuto : Segundo.ms
      return (p1 * 3600) + (p2 * 60) + p3;
    }
  }

  // Caso Simples: "01:45" (Minuto : Segundo)
  if (parts.length === 2) {
    return (parseFloat(parts[0]) * 60) + parseFloat(parts[1]);
  }

  return 0;
}

// --- 1. TRANSCRIÇÃO (PROMPT COMPLETO) ---
export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  const reader = new FileReader();
  const base64Audio = await new Promise<string>((resolve) => {
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(audioBlob);
  });

  const prompt = `
  Você é um especialista em transcrição de áudio para legendagem.
  
  TAREFA:
  Analise o áudio fornecido e gere uma transcrição segmentada com timestamps precisos.
  
  REGRAS RÍGIDAS DE FORMATO:
  1. Retorne APENAS um JSON válido. Não inclua markdown, aspas no início ou explicações.
  2. Estrutura do JSON: 
     [
       { 
         "id": number, 
         "start": "MM:SS.mmm", 
         "end": "MM:SS.mmm", 
         "text": "transcrição exata do que foi dito" 
       }
     ]
  3. Para os timestamps, use o formato com PONTO para milissegundos (ex: 00:05.500) para evitar ambiguidades.
  4. Segmente as falas de forma natural (por sentença ou pausa respiratória).
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

// --- 2. TRADUÇÃO ISOCRÔNICA (PROMPT COMPLETO) ---
export const translateWithIsochrony = async (apiKey: string, segments: SubtitleSegment[]): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  // Prepara o input informando a duração disponível para cada frase
  const enrichedInput = segments.map(s => ({ 
    id: s.id, 
    text: s.text,
    duration: (s.endTime - s.startTime).toFixed(2) + "s" // Duração calculada
  }));

  const prompt = `
  Você é um especialista em Dublagem, Tradução e Localização para Português Brasileiro (PT-BR).
  
  OBJETIVO:
  Traduzir as legendas abaixo respeitando rigorosamente a ISOCRONIA (tempo de fala disponível).
  
  ENTRADA (JSON):
  ${JSON.stringify(enrichedInput)}
  
  DIRETRIZES DE DUBLAGEM:
  1. O texto traduzido DEVE caber no tempo indicado no campo "duration".
  2. Se a "duration" for curta, sintetize e resuma a ideia. Seja direto.
  3. Se a "duration" for longa, você pode ser mais descritivo para preencher o tempo.
  4. Use linguagem natural, coloquial e fluida do Brasil. Evite traduções literais robóticas.
  
  REGRAS TÉCNICAS (CRÍTICO):
  1. NÃO MESCLE FRASES. A quantidade de itens de saída deve ser EXATAMENTE igual à de entrada.
  2. Mantenha os IDs correspondentes (1 para 1).
  3. Retorne APENAS o JSON de saída: [{ "id": number, "text": "texto traduzido" }]
  `;

  try {
    const result = await model.generateContent(prompt);
    const transArray = cleanAndParseJSON(result.response.text());
    
    // Validação de Segurança: Se a IA mesclar linhas, usamos o original para não travar
    if (!Array.isArray(transArray) || transArray.length !== segments.length) {
      console.warn("A IA não respeitou a quantidade de linhas (mesclou ou alucinou). Usando fallback.");
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

// --- 3. DUBLAGEM (OPENAI) ---
export const generateSpeechOpenAI = async (openAIKey: string, text: string): Promise<ArrayBuffer> => {
  if (!text || !text.trim()) return new ArrayBuffer(0);

  // Função interna para tentar um modelo específico
  const tryModel = async (modelName: string) => {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        input: text,
        voice: "onyx", // onyx, alloy, echo, fable, nova, shimmer
        response_format: "mp3"
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || response.statusText);
    }
    return await response.arrayBuffer();
  };

  try {
    // Tenta primeiro o modelo solicitado pelo usuário
    try {
      return await tryModel(OPENAI_TTS_MODEL_PREFERRED);
    } catch (e) {
      console.warn(`Modelo ${OPENAI_TTS_MODEL_PREFERRED} falhou ou não existe. Tentando fallback para ${OPENAI_TTS_MODEL_FALLBACK}.`, e);
      // Se falhar (ex: modelo não existe), tenta o padrão tts-1
      return await tryModel(OPENAI_TTS_MODEL_FALLBACK);
    }
  } catch (finalError: any) {
    console.error("Erro Fatal na Dublagem OpenAI:", finalError);
    return new ArrayBuffer(0); // Retorna mudo se tudo falhar
  }
};
};
