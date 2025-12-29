import { GoogleGenerativeAI } from "@google/generative-ai";
import { SubtitleSegment } from "../types";

const MODEL_LOGIC = 'gemini-2.5-flash';

// Helper para limpar JSON sujo da IA
function cleanAndParseJSON(text: string): any {
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } 
  catch (e) { throw new Error("Erro no formato JSON da IA."); }
}

// --- 1. TRANSCRIÇÃO (GEMINI) ---
export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  const reader = new FileReader();
  const base64Audio = await new Promise<string>((resolve) => {
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(audioBlob);
  });

  const prompt = `
  Analise o áudio com precisão extrema.
  Tarefa: Gerar legendas para dublagem.
  
  REGRAS CRÍTICAS:
  1. Retorne APENAS um JSON válido: [{ "id": number, "start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "text": "transcrição exata" }]
  2. Segmente bem as frases (evite blocos gigantes).
  3. Sem markdown, sem explicações.
  `;

  try {
    const result = await model.generateContent([prompt, { inlineData: { data: base64Audio, mimeType: "audio/mp3" } }]);
    const raw = cleanAndParseJSON(result.response.text());
    const arr = Array.isArray(raw) ? raw : [raw];
    
    return arr.map((s:any) => ({ 
      ...s, 
      startTime: parseTimestamp(s.start), 
      endTime: parseTimestamp(s.end) 
    }));
  } catch (e: any) {
    throw new Error(`Transcrição falhou: ${e.message}`);
  }
};

// --- 2. TRADUÇÃO ISOCRÔNICA (GEMINI) - AGORA COM O PROMPT CORRETO ---
export const translateWithIsochrony = async (apiKey: string, segments: SubtitleSegment[]): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  // Envia ID, Texto e a DURAÇÃO para a IA saber o tempo disponível
  const enrichedInput = segments.map(s => ({ 
    id: s.id, 
    text: s.text,
    duration: (s.endTime - s.startTime).toFixed(2) + "s" // Informa o tempo disponível
  }));

  const prompt = `
  Você é um especialista em Dublagem e Localização (PT-BR).
  Tarefa: Traduzir o texto respeitando a ISOCRONIA (Tempo de fala).
  
  Entrada: ${JSON.stringify(enrichedInput)}
  
  REGRAS DE DUBLAGEM (IMPORTANTE):
  1. O texto traduzido deve caber no tempo de duração ("duration") indicado.
  2. Se o tempo for curto, sintetize a ideia. Se for longo, pode ser mais descritivo.
  3. Use linguagem natural falada no Brasil (PT-BR).
  
  REGRAS TÉCNICAS (OBRIGATÓRIO):
  1. NÃO MESCLE FRASES. Se entrarem ${segments.length} itens, devem sair EXATAMENTE ${segments.length}.
  2. Mantenha os IDs correspondentes.
  3. Saída: Array JSON [{ "id": number, "text": "tradução adaptada" }]
  `;

  try {
    const result = await model.generateContent(prompt);
    const transArray = cleanAndParseJSON(result.response.text());
    
    // Validação de Segurança
    if (!Array.isArray(transArray) || transArray.length !== segments.length) {
      console.warn("A IA não respeitou a quantidade de linhas. Usando fallback (texto original).");
      return segments;
    }

    return segments.map(seg => {
      const t = transArray.find((x:any) => x.id === seg.id);
      return { ...seg, text: t ? t.text : seg.text };
    });
  } catch (e) { 
    console.error("Erro na tradução:", e);
    return segments; // Retorna original se falhar
  }
};

// --- 3. DUBLAGEM (OPENAI) ---
export const generateSpeechOpenAI = async (openAIKey: string, text: string): Promise<ArrayBuffer> => {
  if (!text || !text.trim()) return new ArrayBuffer(0);

  const url = 'https://api.openai.com/v1/audio/speech';
  
  const payload = {
    model: "tts-1",
    input: text,
    voice: "onyx", // Opções: alloy, echo, fable, onyx, nova, shimmer
    response_format: "mp3"
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI Error: ${errorData.error?.message || response.statusText}`);
    }

    return await response.arrayBuffer();

  } catch (e: any) {
    console.error("Falha na Dublagem OpenAI:", e);
    return new ArrayBuffer(0); 
  }
};

function parseTimestamp(timeStr: string): number {
  if(!timeStr) return 0;
  const [h, m, s] = timeStr.split(':');
  const [sec, ms] = s.split('.');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + (parseInt(ms || '0') / 1000);
}
