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

  // --- ENGINE CENTRAL DE DUBLAGEM ---
  const runDubbingAndAssembly = async (segmentsToProcess: SubtitleSegment[]) => {
    try {
      if (!openAIKey) throw new Error("Chave OpenAI não encontrada.");

      updateStatus('dubbing', 45, 'Iniciando Dublagem (OpenAI)...');
      const audioSegments: ArrayBuffer[] = [];
      
      for (let i = 0; i < segmentsToProcess.length; i++) {
        const seg = segmentsToProcess[i];
        
        console.log(`Processando bloco ${i}:`, seg.text);

        if (!seg.text || !seg.text.trim()) {
             audioSegments.push(new ArrayBuffer(0));
             continue;
        }

        const progress = 45 + Math.floor((i / segmentsToProcess.length) * 45);
        updateStatus('dubbing', progress, `Dublando bloco ${i+1}/${segmentsToProcess.length}...`);
        
        try {
            const audioBuffer = await generateSpeechOpenAI(openAIKey, seg.text);
            audioSegments.push(audioBuffer);
        } catch (e) {
            console.error(`Erro no bloco ${i}, pulando:`, e);
            audioSegments.push(new ArrayBuffer(0));
        }

        // Delay anti-bloqueio
        if (i < segmentsToProcess.length - 1) await new Promise(r => setTimeout(r, 800));
      }

      updateStatus('assembling', 95, 'Removendo silêncio e ajustando tempo...');
      const finalBlob = await assembleFinalAudio(segmentsToProcess, audioSegments);
      
      const finalUrl = URL.createObjectURL(finalBlob);
      setFinalAudioUrl(finalUrl);
      updateStatus('completed', 100, 'Processamento concluído!');
      
    } catch (error: any) {
      console.error(error);
      updateStatus('error', 0, `Erro Fatal: ${error.message}`);
    }
  };

  const startProcessing = async (mode: 'auto' | 'manual') => {
    if (!apiKey || !openAIKey || !videoFile) {
      alert("Configure as duas chaves API primeiro.");
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
        updateStatus('waiting_for_approval', 40, 'Aguardando revisão...');
        return;
      }

      await runDubbingAndAssembly(translatedSegments);

    } catch (error: any) {
      console.error(error);
      updateStatus('error', 0, `Erro: ${error.message}`);
    }
  };

  const resumeProcessing = async (freshSegments: SubtitleSegment[]) => {
    console.log("Retomando com dados frescos:", freshSegments.length, "segmentos");
    if (!freshSegments || freshSegments.length === 0) {
        alert("Erro: Nenhum texto encontrado para dublar.");
        return;
    }
    await runDubbingAndAssembly(freshSegments);
  };

  return (
    <ProjectContext.Provider value={{
      apiKey, setApiKey,
      openAIKey, setOpenAIKey,
      videoFile, setVideoFile,
      videoUrl,
      processingState,
      startProcessing,
      resumeProcessing, 
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
