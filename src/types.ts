export interface SubtitleSegment {
  id: number;
  start: string;
  end: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface ProcessingState {
  stage: 'idle' | 'transcribing' | 'translating' | 'dubbing' | 'assembling' | 'completed' | 'error';
  progress: number;
  log: string;
}

export interface ProjectContextType {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  videoFile: File | null;
  setVideoFile: (file: File | null) => void;
  videoUrl: string | null;
  processingState: ProcessingState;
  startProcessing: () => Promise<void>;
  finalAudioUrl: string | null;
  // NOVO: Lista de segmentos para mostrar na tela
  segments: SubtitleSegment[]; 
}
