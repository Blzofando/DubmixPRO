import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ProjectContextType, ProcessingState, SubtitleSegment } from '../types';
import { transcribeAudio, translateWithIsochrony, generateSpeech } from '../services/geminiService';
import { extractAudioFromVideo, assembleFinalAudio } from '../services/audioService';

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [finalAudioUrl, setFinalAudioUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<SubtitleSegment[]>([]); // NOVO
  
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
    if (!apiKey || !videoFile) {
      alert("API Key e Arquivo são obrigatórios.");
      return;
    }

    try {
      setSegments([]); // Limpa lista anterior
      setFinalAudioUrl(null);

      // 1. Extração
      updateStatus('transcribing', 10, 'Extraindo áudio...');
      const audioBlob = await extractAudioFromVideo(videoFile);

      // 2. Transcrição
      updateStatus('transcribing', 25, 'Transcrevendo (Gemini)...');
      const transcriptSegments = await transcribeAudio(apiKey, audioBlob);
      setSegments(transcriptSegments); // MOSTRA NA TELA

      // 3. Tradução
      updateStatus('translating', 40, 'Traduzindo e ajustando tempo...');
      const translatedSegments = await translateWithIsochrony(apiKey, transcriptSegments);
      setSegments(translatedSegments); // ATUALIZA PARA PORTUGUÊS NA TELA

      // 4. Dublagem
      updateStatus('dubbing', 50, 'Iniciando Dublagem...');
      const audioSegments: ArrayBuffer[] = [];
      
      for (let i = 0; i < translatedSegments.length; i++) {
        const seg = translatedSegments[i];
        // Mostra qual frase está sendo dublada agora
        updateStatus('dubbing', 50 + Math.floor((i / translatedSegments.length) * 40), `Dublando: "${seg.text.substring(0, 20)}..."`);
        
        // Pequena pausa para não bloquear o navegador
        await new Promise(r => setTimeout(r, 100));

        const audioBuffer = await generateSpeech(apiKey, seg.text);
        audioSegments.push(audioBuffer);
      }

      // 5. Montagem
      updateStatus('assembling', 95, 'Montando áudio final...');
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
      videoFile, setVideoFile,
      videoUrl,
      processingState,
      startProcessing,
      finalAudioUrl,
      segments // Exportando para usar no painel
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
