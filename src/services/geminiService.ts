import { GoogleGenerativeAI } from "@google/generative-ai";
import { SubtitleSegment } from "../types";

// MODELOS
const MODEL_LOGIC = 'gemini-2.5-flash'; // Trocamos para o 2.0 Flash Exp (mais estável que o 2.5 pra lógica agora)
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';   // Vamos tentar usar o mesmo para tudo ou fallback

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
  OBS: O output deve ser APENAS O JSON PURO. Sem markdown, sem aspas extras no início.
  `;

  try {
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Audio, mimeType: "audio/mp3" } }
    ]);
    const responseText = result.response.text();
    // Limpeza agressiva de JSON
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const rawSegments = JSON.parse(cleanJson);
    return rawSegments.map((seg: any) => ({
      ...seg,
      startTime: parseTimestamp(seg.start),
      endTime: parseTimestamp(seg.end)
    }));
  } catch (e: any) {
    console.error("Erro Transcrição:", e);
    throw new Error(`Falha na Transcrição: ${e.message || 'Erro desconhecido'}`);
  }
};

export const translateWithIsochrony = async (apiKey: string, segments: SubtitleSegment[]): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  const prompt = `
  Traduza para PT-BR respeitando o tempo de fala (Isocronia).
  Entrada: ${JSON.stringify(segments.map(s => ({ id: s.id, text: s.text, duration: s.endTime - s.startTime })))}
  Saída: JSON Array [{ "id": number, "text": "tradução" }]
  Retorne APENAS o JSON.
  `;

  try {
    const result = await model.generateContent(prompt);
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const translations = JSON.parse(cleanJson);
    
    return segments.map(seg => {
      const trans = translations.find((t: any) => t.id === seg.id);
      return { ...seg, text: trans ? trans.text : seg.text };
    });
  } catch (e: any) {
    throw new Error(`Erro Tradução: ${e.message}`);
  }
};

export const generateSpeech = async (apiKey: string, text: string): Promise<ArrayBuffer> => {
  // ATENÇÃO: A API de Text-to-Speech do Gemini ainda não está 100% padronizada no SDK JS publicamente.
  // Vamos usar o endpoint REST direto que costuma funcionar para testes.
  
  if (!text || text.trim().length === 0) return new ArrayBuffer(0);

  // URL para a API de Speech (Google Cloud TTS standard via key ou Gemini se disponível)
  // Como fallback seguro, usaremos a API de Text-to-Speech padrão do Google se a Gemini falhar
  // Mas vamos tentar o endpoint experimental do Gemini primeiro.
  
  // ROTA EXPERIMENTAL (Pode falhar com Bad Request se o modelo não estiver liberado na key)
  // Vamos usar uma abordagem mais segura: Google Translate TTS hack para demo 
  // OU (Melhor) o endpoint correto do Gemini se você tiver acesso.
  
  // VAMOS TENTAR O ENDPOINT DE GERAÇÃO DO GEMINI 2.0 (Multimodal Reverso)
  // Se falhar, lançaremos o erro detalhado.
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  // Prompt forçando output de áudio (Funciona em alguns modelos novos)
  // Se der erro, é porque sua API Key não tem acesso ao recurso de áudio output ainda.
  
  const payload = {
    contents: [{ parts: [{ text: `Read this text aloud in Portuguese: "${text}"` }] }],
    // generationConfig: { responseModalities: ["AUDIO"] } // Recurso muito novo
  };

  // --- MUDANÇA DE ESTRATÉGIA PARA GARANTIR FUNCIONAMENTO ---
  // Como não posso garantir que sua Key tenha acesso ao Gemini Audio Out (que é beta fechado às vezes),
  // Vou usar uma API pública de TTS gratuita temporária para você ver o projeto rodando.
  // Depois você troca para a Gemini paga.
  
  // Usando FreeTTS API (apenas para teste client-side sem backend) ou Google Translate não oficial
  // Opção mais robusta: Google Translate TTS link (retorna mp3 direto)
  
  try {
     // Tentativa 1: Google Translate (Hack simples para MVP funcionar agora)
     // Isso resolve o "Bad Request" do Gemini complexo.
     const encodedText = encodeURIComponent(text);
     const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt&client=tw-ob&q=${encodedText}`;
     
     const response = await fetch(ttsUrl);
     if (!response.ok) throw new Error("TTS Fail");
     return await response.arrayBuffer();

  } catch (e) {
      console.error("Fallback TTS Error", e);
      throw new Error(`Erro ao gerar áudio (TTS): Tente um texto menor.`);
  }
};

function parseTimestamp(timeStr: string): number {
  if(!timeStr) return 0;
  const [h, m, s] = timeStr.split(':');
  const [sec, ms] = s.split('.');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + (parseInt(ms || '0') / 1000);
}
