import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
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
  
  // STATE VISUAL
  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  
  // REF DE SEGURANÇA (Para o botão Confirmar nunca ler dados velhos)
  const segmentsRef = useRef<SubtitleSegment[]>([]);

  const [processingState, setProcessingState] = useState<ProcessingState>({
    stage: 'idle',
    progress: 0,
    log: 'Aguardando início...'
  });

  // Sincroniza o Ref sempre que o State mudar (Edição Manual)
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

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

  // --- ENGINE DE DUBLAGEM ---
  const runDubbingAndAssembly = async (currentSegments: SubtitleSegment[]) => {
    try {
      if (!openAIKey) throw new Error("Chave OpenAI não encontrada.");

      updateStatus('dubbing', 45, 'Iniciando Dublagem (OpenAI)...');
      const audioSegments: ArrayBuffer[] = [];
      
      // Usa os segmentos passados (que vieram do Ref atualizado)
      for (let i = 0; i < currentSegments.length; i++) {
        const seg = currentSegments[i];
        
        // Pula segmentos vazios para não dar erro
        if (!seg.text.trim()) {
             audioSegments.push(new ArrayBuffer(0));
             continue;
        }

        const progress = 45 + Math.floor((i / currentSegments.length) * 45);
        updateStatus('dubbing', progress, `Dublando bloco ${i+1}/${currentSegments.length}...`);
        
        try {
            const audioBuffer = await generateSpeechOpenAI(openAIKey, seg.text);
            audioSegments.push(audioBuffer);
        } catch (e) {
            console.error(`Erro no bloco ${i}, pulando:`, e);
            audioSegments.push(new ArrayBuffer(0)); // Insere silêncio para não quebrar a ordem
        }

        // Delay anti-bloqueio (Rate Limit)
        if (i < currentSegments.length - 1) await new Promise(r => setTimeout(r, 800));
      }

      updateStatus('assembling', 95, 'Ajustando tempo (Isocronia Force)...');
      
      // Manda para o FFmpeg ajustar a velocidade
      const finalBlob = await assembleFinalAudio(currentSegments, audioSegments);
      
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
      segmentsRef.current = []; // Limpa ref
      setFinalAudioUrl(null);

      updateStatus('transcribing', 5, 'Extraindo áudio...');
      const audioBlob = await extractAudioFromVideo(videoFile);

      updateStatus('transcribing', 15, 'Transcrevendo (Gemini)...');
      const transcriptSegments = await transcribeAudio(apiKey, audioBlob);
      
      updateStatus('translating', 30, 'Traduzindo (Gemini)...');
      const translatedSegments = await translateWithIsochrony(apiKey, transcriptSegments);
      
      setSegments(translatedSegments); // Atualiza visual
      segmentsRef.current = translatedSegments; // Atualiza lógica

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

  const resumeProcessing = async () => {
    console.log("Botão clicado! Usando dados do Ref...");
    // PEGA DO REF PARA GARANTIR QUE É A VERSÃO MAIS NOVA (PÓS-EDIÇÃO)
    const finalSegments = segmentsRef.current;
    
    if (finalSegments.length === 0) {
        alert("Erro: Nenhum segmento encontrado.");
        return;
    }
    
    await runDubbingAndAssembly(finalSegments);
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
