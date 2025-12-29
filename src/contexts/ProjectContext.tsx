import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ProjectContextType, ProcessingState, SubtitleSegment } from '../types';
import { transcribeAudio, translateWithIsochrony, generateSpeechOpenAI } from '../services/geminiService';
import { extractAudioFromVideo, assembleFinalAudio } from '../services/audioService';

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [openAIKey, setOpenAIKey] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [finalAudioUrl, setFinalAudioUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  
  const [processingState, setProcessingState] = useState<ProcessingState>({
    stage: 'idle',
    progress: 0,
    log: 'Aguardando início...'
  });

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [videoFile]);

  const updateStatus = (stage: ProcessingState['stage'], progress: number, log: string) => {
    setProcessingState({ stage, progress, log });
  };

  const startProcessing = async () => {
    if (!apiKey || !openAIKey || !videoFile) {
      alert("Preencha as duas API Keys e escolha um vídeo.");
      return;
    }

    try {
      setSegments([]); 
      setFinalAudioUrl(null);

      // 1. Extração
      updateStatus('transcribing', 5, 'Extraindo áudio...');
      const audioBlob = await extractAudioFromVideo(videoFile);

      // 2. Transcrição (Gemini)
      updateStatus('transcribing', 15, 'Transcrevendo (Gemini)...');
      const transcriptSegments = await transcribeAudio(apiKey, audioBlob);
      setSegments(transcriptSegments);

      // 3. Tradução (Gemini)
      updateStatus('translating', 30, 'Traduzindo (Gemini)...');
      const translatedSegments = await translateWithIsochrony(apiKey, transcriptSegments);
      setSegments(translatedSegments);

      // 4. Dublagem (OpenAI)
      updateStatus('dubbing', 45, 'Iniciando Dublagem (OpenAI)...');
      const audioSegments: ArrayBuffer[] = [];
      
      // Processamento Sequencial com Delay (Segurança contra Rate Limit)
      for (let i = 0; i < translatedSegments.length; i++) {
        const seg = translatedSegments[i];
        const progress = 45 + Math.floor((i / translatedSegments.length) * 45);
        
        updateStatus('dubbing', progress, `Dublando bloco ${i+1}/${translatedSegments.length}...`);
        
        // Chamada OpenAI
        const audioBuffer = await generateSpeechOpenAI(openAIKey, seg.text);
        audioSegments.push(audioBuffer);

        // DELAY DE 2 SEGUNDOS (Solicitado pelo usuário)
        // Isso evita estourar o limite de requisições por minuto
        if (i < translatedSegments.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // 5. Montagem
      updateStatus('assembling', 95, 'Sincronizando áudio final...');
      const finalBlob = await assembleFinalAudio(translatedSegments, audioSegments);
      
      const finalUrl = URL.createObjectURL(finalBlob);
      setFinalAudioUrl(finalUrl);
      updateStatus('completed', 100, 'Processamento concluído!');

    } catch (error: any) {
      console.error(error);
      updateStatus('error', 0, `Erro: ${error.message}`);
    }
  };

  return (
    <ProjectContext.Provider value={{
      apiKey, setApiKey,
      openAIKey, setOpenAIKey,
      videoFile, setVideoFile,
      videoUrl,
      processingState,
      startProcessing,
      finalAudioUrl,
      segments
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
};
