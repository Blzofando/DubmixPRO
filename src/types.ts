export interface SubtitleSegment {
  id: number;
  start: string;
  end: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface ProcessingState {
  // ADICIONADO: 'waiting_for_approval'
  stage: 'idle' | 'transcribing' | 'translating' | 'waiting_for_approval' | 'dubbing' | 'assembling' | 'completed' | 'error';
  progress: number;
  log: string;
}

export interface ProjectContextType {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  openAIKey: string | null;
  setOpenAIKey: (key: string) => void;
  videoFile: File | null;
  setVideoFile: (file: File | null) => void;
  videoUrl: string | null;
  processingState: ProcessingState;
  startProcessing: (mode: 'auto' | 'manual') => Promise<void>; // Mudou assinatura
  resumeProcessing: () => Promise<void>; // Nova função para continuar após edição
  finalAudioUrl: string | null;
  segments: SubtitleSegment[]; 
  updateSegmentText: (id: number, newText: string) => void; // Nova função para editar
}
