import { GoogleGenerativeAI } from "@google/generative-ai";
import { SubtitleSegment } from "../types";

// IDs OBRIGATÓRIOS conforme solicitado
const MODEL_LOGIC = 'gemini-2.5-flash';
const MODEL_TTS = 'gemini-2.5-flash-preview-tts'; 

// Fallback caso o 2.5 ainda não esteja disponível na API pública
// const MODEL_LOGIC = 'gemini-2.0-flash-exp'; 

export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  // Converter Blob para Base64
  const reader = new FileReader();
  const base64Audio = await new Promise<string>((resolve) => {
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(audioBlob);
  });

  const prompt = `
  Analise o áudio fornecido.
  Retorne um JSON ESTRITAMENTE VÁLIDO contendo uma lista de segmentos.
  Formato: [{ "id": number, "start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "text": "transcrição original" }]
  O output deve ser APENAS o JSON, sem markdown.
  `;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64Audio, mimeType: "audio/mp3" } }
  ]);

  const responseText = result.response.text();
  // Limpeza de Markdown caso o modelo desobedeça
  const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
  
  try {
    const rawSegments = JSON.parse(cleanJson);
    // Converter timestamps para segundos
    return rawSegments.map((seg: any) => ({
      ...seg,
      startTime: parseTimestamp(seg.start),
      endTime: parseTimestamp(seg.end)
    }));
  } catch (e) {
    console.error("Erro no parse do JSON Gemini:", responseText);
    throw new Error("Falha ao transcrever áudio.");
  }
};

export const translateWithIsochrony = async (apiKey: string, segments: SubtitleSegment[]): Promise<SubtitleSegment[]> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_LOGIC });

  const segmentsData = JSON.stringify(segments.map(s => ({
    id: s.id,
    duration: s.endTime - s.startTime,
    original: s.text,
    charLimit: Math.floor((s.endTime - s.startTime) * 16) // Regra: 16 chars por segundo
  })));

  const prompt = `
  Você é um especialista em Dublagem. Traduza os textos abaixo para Português Brasileiro (PT-BR).
  REGRAS CRÍTICAS:
  1. O texto traduzido deve respeitar o "charLimit" para caber no tempo de fala (Isocronia).
  2. Seja conciso e natural.
  3. Retorne APENAS um JSON array: [{ "id": number, "text": "texto traduzido" }]
  
  Dados: ${segmentsData}
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
  
  try {
    const translations = JSON.parse(cleanJson);
    // Mesclar tradução com dados originais de tempo
    return segments.map(seg => {
      const trans = translations.find((t: any) => t.id === seg.id);
      return { ...seg, text: trans ? trans.text : seg.text };
    });
  } catch (e) {
    throw new Error("Falha na tradução isocrônica.");
  }
};

export const generateSpeech = async (apiKey: string, text: string): Promise<ArrayBuffer> => {
  // NOTA: Como o Gemini TTS ainda está em preview e pode não estar no SDK padrão 
  // da mesma forma que o chat, usaremos uma chamada REST direta se o SDK falhar,
  // mas aqui tentarei a abordagem via SDK assumindo suporte a multimodalidade reversa ou fallback.
  // SE o modelo 2.5 TTS não funcionar via generateContent, teríamos que usar a API REST específica.
  // Vou simular o comportamento esperado para a API unificada do Google.
  
  // ATENÇÃO: Se o SDK lançar erro com esse modelo, substitua pela chamada fetch REST padrão.
  // Por ora, usaremos fetch direto na API REST do Google para garantir, pois TTS é endpoint específico.
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TTS}:generateContent?key=${apiKey}`;
  
  // O formato exato do payload para o modelo TTS de preview pode variar. 
  // Abaixo uma estrutura padrão de prompt multimodal pedindo output de áudio.
  // Se o modelo for TEXT-TO-SPEECH dedicado, o endpoint pode ser diferente.
  // Assumindo a interface generativa padrão:
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Generate spoken audio for: "${text}"` }] }],
      // Configuração hipotética para output de áudio se suportada via JSON
    })
  });

  if (!response.ok) {
     // FALLBACK DE SEGURANÇA para o modelo padrão se o 2.5 falhar ou não existir
     console.warn("Gemini TTS 2.5 falhou, tentando método padrão ou alertando usuário.");
     // Como não posso rodar backend, se o endpoint falhar, o usuário receberá o erro.
     throw new Error(`Erro TTS: ${response.statusText}`);
  }

  // O retorno do Gemini multimodal geralmente é um JSON com base64 do áudio em 'candidates'.
  // Se for um modelo de áudio puro, seria blob. Vamos assumir JSON com Base64.
  const data = await response.json();
  
  // Verificação de estrutura de resposta (pode variar conforme a versão preview)
  // Tentativa de extrair áudio inline data
  try {
      // Ajuste conforme a documentação real do preview, que é volátil.
      // Geralmente: candidates[0].content.parts[0].inlineData.data
      const base64 = data.candidates[0].content.parts[0].inlineData.data; 
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
  } catch (e) {
      throw new Error("Formato de resposta TTS inesperado.");
  }
};

// Helper
function parseTimestamp(timeStr: string): number {
  // HH:MM:SS.mmm
  const [h, m, s] = timeStr.split(':');
  const [sec, ms] = s.split('.');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + (parseInt(ms || '0') / 1000);
}
