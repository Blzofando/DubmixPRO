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
      alert("API Key e Arquivo de Vídeo são obrigatórios.");
      return;
    }

    try {
      // 1. Extração de Áudio (FFmpeg)
      updateStatus('transcribing', 10, 'Extraindo áudio do vídeo...');
      const audioBlob = await extractAudioFromVideo(videoFile);

      // 2. Transcrição (Gemini)
      updateStatus('transcribing', 25, 'Transcrevendo áudio com Gemini 2.5...');
      const transcriptSegments = await transcribeAudio(apiKey, audioBlob);

      // 3. Tradução Isocrônica (Gemini)
      updateStatus('translating', 40, 'Realizando tradução isocrônica...');
      const translatedSegments = await translateWithIsochrony(apiKey, transcriptSegments);

      // 4. Dublagem TTS (Gemini)
      updateStatus('dubbing', 60, 'Gerando vozes sintéticas...');
      const audioSegments: ArrayBuffer[] = [];
      
      for (let i = 0; i < translatedSegments.length; i++) {
        const seg = translatedSegments[i];
        updateStatus('dubbing', 60 + Math.floor((i / translatedSegments.length) * 20), `Dublando segmento ${i + 1}/${translatedSegments.length}...`);
        
        // Calcular duração alvo
        const targetDuration = seg.endTime - seg.startTime;
        const audioBuffer = await generateSpeech(apiKey, seg.text);
        audioSegments.push(audioBuffer);
      }

      // 5. Montagem Final (FFmpeg)
      updateStatus('assembling', 90, 'Montando áudio final e ajustando tempo...');
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
      finalAudioUrl
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
