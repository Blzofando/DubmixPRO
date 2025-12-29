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

  // Função para editar texto manualmente
  const updateSegmentText = (id: number, newText: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, text: newText } : s));
  };

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

  // Função unificada para continuar o processo (Dublagem + Montagem)
  const runDubbingAndAssembly = async (currentSegments: SubtitleSegment[]) => {
    try {
      updateStatus('dubbing', 45, 'Iniciando Dublagem (OpenAI)...');
      const audioSegments: ArrayBuffer[] = [];
      
      for (let i = 0; i < currentSegments.length; i++) {
        const seg = currentSegments[i];
        const progress = 45 + Math.floor((i / currentSegments.length) * 45);
        
        updateStatus('dubbing', progress, `Dublando bloco ${i+1}/${currentSegments.length}...`);
        
        const audioBuffer = await generateSpeechOpenAI(openAIKey!, seg.text);
        audioSegments.push(audioBuffer);

        if (i < currentSegments.length - 1) {
          await new Promise(r => setTimeout(r, 1500)); // Delay de segurança
        }
      }

      updateStatus('assembling', 95, 'Sincronizando áudio final...');
      const finalBlob = await assembleFinalAudio(currentSegments, audioSegments);
      
      const finalUrl = URL.createObjectURL(finalBlob);
      setFinalAudioUrl(finalUrl);
      updateStatus('completed', 100, 'Processamento concluído!');
    } catch (error: any) {
      console.error(error);
      updateStatus('error', 0, `Erro: ${error.message}`);
    }
  };

  const startProcessing = async (mode: 'auto' | 'manual') => {
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

      // 2. Transcrição
      updateStatus('transcribing', 15, 'Transcrevendo (Gemini)...');
      const transcriptSegments = await transcribeAudio(apiKey, audioBlob);
      
      // 3. Tradução
      updateStatus('translating', 30, 'Traduzindo (Gemini)...');
      const translatedSegments = await translateWithIsochrony(apiKey, transcriptSegments);
      setSegments(translatedSegments);

      // DECISÃO: Se for manual, PAUSA aqui. Se for auto, CONTINUA.
      if (mode === 'manual') {
        updateStatus('waiting_for_approval', 40, 'Aguardando revisão do usuário...');
        return; // Para a execução aqui
      }

      // Se for auto, segue direto
      await runDubbingAndAssembly(translatedSegments);

    } catch (error: any) {
      console.error(error);
      updateStatus('error', 0, `Erro: ${error.message}`);
    }
  };

  const resumeProcessing = async () => {
    // Chamado quando o usuário clica em "Confirmar e Dublar"
    await runDubbingAndAssembly(segments);
  };

  return (
    <ProjectContext.Provider value={{
      apiKey, setApiKey,
      openAIKey, setOpenAIKey,
      videoFile, setVideoFile,
      videoUrl,
      processingState,
      startProcessing,
      resumeProcessing, // Exposta
      finalAudioUrl,
      segments,
      updateSegmentText // Exposta
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
