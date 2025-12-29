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

  // Função interna que faz o trabalho pesado
  const runDubbingAndAssembly = async (currentSegments: SubtitleSegment[]) => {
    try {
      if (!openAIKey) throw new Error("Chave OpenAI não encontrada. Salve novamente.");

      updateStatus('dubbing', 45, 'Iniciando Dublagem (OpenAI)...');
      const audioSegments: ArrayBuffer[] = [];
      
      for (let i = 0; i < currentSegments.length; i++) {
        const seg = currentSegments[i];
        const progress = 45 + Math.floor((i / currentSegments.length) * 45);
        
        updateStatus('dubbing', progress, `Dublando bloco ${i+1}/${currentSegments.length}...`);
        
        const audioBuffer = await generateSpeechOpenAI(openAIKey, seg.text);
        audioSegments.push(audioBuffer);

        // Pequeno delay para evitar rate limit
        if (i < currentSegments.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
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

      updateStatus('transcribing', 5, 'Extraindo áudio...');
      const audioBlob = await extractAudioFromVideo(videoFile);

      updateStatus('transcribing', 15, 'Transcrevendo (Gemini)...');
      const transcriptSegments = await transcribeAudio(apiKey, audioBlob);
      
      updateStatus('translating', 30, 'Traduzindo (Gemini)...');
      const translatedSegments = await translateWithIsochrony(apiKey, transcriptSegments);
      setSegments(translatedSegments);

      if (mode === 'manual') {
        updateStatus('waiting_for_approval', 40, 'Aguardando revisão do usuário...');
        return;
      }

      await runDubbingAndAssembly(translatedSegments);

    } catch (error: any) {
      console.error(error);
      updateStatus('error', 0, `Erro: ${error.message}`);
    }
  };

  // Esta é a função chamada pelo botão "CONFIRMAR E DUBLAR"
  const resumeProcessing = async () => {
    console.log("Retomando processamento...");
    
    // Verificação de segurança
    if (!openAIKey) {
      alert("Erro: Chave da OpenAI sumiu. Por favor, recarregue a página e insira as chaves novamente.");
      return;
    }
    
    // Usa os segmentos atuais (que podem ter sido editados)
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
      resumeProcessing, // Agora está protegido e logado
      finalAudioUrl,
      segments,
      updateSegmentText
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
