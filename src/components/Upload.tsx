import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Upload as UploadIcon, FileAudio } from 'lucide-react';

export const Upload = () => {
  const { setVideoFile, videoUrl, processingState } = useProject();
  const isDisabled = processingState.stage !== 'idle' && processingState.stage !== 'completed' && processingState.stage !== 'error';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Limite de segurança para celular (50MB)
      if (file.size > 50 * 1024 * 1024) {
        alert("⚠️ ATENÇÃO: Arquivo muito grande! No celular, tente usar arquivos menores que 50MB.");
        return;
      }
      setVideoFile(file);
    }
  };

  return (
    <div className="mb-6">
      {!videoUrl ? (
        <div className={`
          relative flex flex-col items-center justify-center w-full h-32 
          border-2 border-dashed rounded-lg overflow-hidden
          ${isDisabled ? 'border-gray-600 bg-gray-800 opacity-50' : 'border-blue-500 bg-slate-800'}
        `}>
          <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
            <UploadIcon className="w-8 h-8 mb-2 text-blue-400" />
            <p className="text-sm text-gray-400">Toque para escolher Vídeo ou Áudio</p>
            <p className="text-xs text-gray-500 mt-1">(MP4, MP3, WAV - Máx 50MB)</p>
          </div>
          
          {/* CORREÇÃO AQUI: Aceita video E audio */}
          <input 
            type="file" 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
            accept="video/*,audio/*" 
            onChange={handleFile} 
            disabled={isDisabled} 
          />
        </div>
      ) : (
        <div className="bg-black rounded-lg overflow-hidden relative border border-slate-700 flex items-center justify-center p-4">
           {/* Se for vídeo mostra player, se for áudio mostra ícone */}
           {videoUrl.match(/audio|mp3|wav/i) ? (
             <div className="text-center py-8">
               <FileAudio className="w-16 h-16 text-purple-400 mx-auto mb-2" />
               <p className="text-white font-bold">Arquivo de Áudio Carregado</p>
               <audio src={videoUrl} controls className="mt-4" />
             </div>
           ) : (
             <video src={videoUrl} controls playsInline className="w-full max-h-64" />
           )}
           
           {!isDisabled && (
             <button 
               onClick={() => setVideoFile(null)}
               className="absolute top-2 right-2 bg-red-600/90 text-white text-xs px-3 py-1.5 rounded-full font-bold shadow-md z-20"
             >
               Trocar Arquivo
             </button>
           )}
        </div>
      )}
    </div>
  );
};
