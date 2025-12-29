export interface SubtitleSegment {
  id: number;
  start: string; // formato "HH:MM:SS,mmm" ou segundos string
  end: string;
  text: string;
  startTime: number; // segundos float
  endTime: number;   // segundos float
}

export interface ProcessingState {
  stage: 'idle' | 'transcribing' | 'translating' | 'dubbing' | 'assembling' | 'completed' | 'error';
  progress: number; // 0 a 100
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
}
