import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Upload as UploadIcon } from 'lucide-react';

export const Upload = () => {
  const { setVideoFile, videoUrl, processingState } = useProject();
  const isDisabled = processingState.stage !== 'idle' && processingState.stage !== 'completed' && processingState.stage !== 'error';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Trava de segurança para mobile
      if (file.size > 50 * 1024 * 1024) { // 50MB
        alert("⚠️ ATENÇÃO: No celular, use vídeos menores que 50MB para não travar o navegador.");
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
            <p className="text-sm text-gray-400">Toque para escolher o vídeo</p>
            <p className="text-xs text-gray-500 mt-1">(Máx: 50MB no Mobile)</p>
          </div>
          
          {/* TRUQUE PARA iOS: Input opaco cobrindo tudo */}
          <input 
            type="file" 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
            accept="video/*" 
            onChange={handleFile} 
            disabled={isDisabled} 
          />
        </div>
      ) : (
        <div className="bg-black rounded-lg overflow-hidden relative border border-slate-700">
           {/* playsInline é crucial para iOS não abrir fullscreen automático */}
           <video src={videoUrl} controls playsInline className="w-full max-h-64" />
           
           {!isDisabled && (
             <button 
               onClick={() => setVideoFile(null)}
               className="absolute top-2 right-2 bg-red-600/90 text-white text-xs px-3 py-1.5 rounded-full font-bold shadow-md z-20"
             >
               Trocar Vídeo
             </button>
           )}
        </div>
      )}
    </div>
  );
};
