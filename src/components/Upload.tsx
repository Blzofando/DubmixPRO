import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Upload as UploadIcon, FileAudio } from 'lucide-react';

export const Upload = () => {
  // CORREÇÃO AQUI: Adicionei 'videoFile' na lista de imports
  const { videoFile, setVideoFile, videoUrl, processingState } = useProject();
  
  const isDisabled = processingState.stage !== 'idle' && processingState.stage !== 'completed' && processingState.stage !== 'error';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Limite de segurança (100MB)
      if (file.size > 100 * 1024 * 1024) {
        if (!confirm("O arquivo é maior que 100MB. Isso pode travar o navegador do celular. Deseja continuar mesmo assim?")) {
          return;
        }
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
            <p className="text-sm text-gray-400">Toque para selecionar Arquivo</p>
            <p className="text-xs text-gray-500 mt-1">Vídeos ou Áudios (MP3, WAV, M4A)</p>
          </div>
          
          <input 
            type="file" 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
            accept="video/*,audio/*,.mp3,.wav,.m4a,.mp4,.mov,.mkv" 
            onChange={handleFile} 
            disabled={isDisabled} 
          />
        </div>
      ) : (
        <div className="bg-black rounded-lg overflow-hidden relative border border-slate-700 flex items-center justify-center p-4">
           {/* Lógica segura para mostrar player de áudio ou vídeo */}
           {(videoUrl.match(/audio|mp3|wav|m4a/i) || (videoFile && videoFile.type.includes('audio'))) ? (
             <div className="text-center py-6 w-full">
               <FileAudio className="w-12 h-12 text-purple-400 mx-auto mb-3" />
               <p className="text-white font-bold text-sm mb-2 break-all px-4">
                 {videoFile ? videoFile.name : 'Áudio Carregado'}
               </p>
               <audio src={videoUrl} controls className="w-full h-10" />
             </div>
           ) : (
             <video src={videoUrl} controls playsInline className="w-full max-h-64" />
           )}
           
           {!isDisabled && (
             <button 
               onClick={() => setVideoFile(null)}
               className="absolute top-2 right-2 bg-red-600/90 text-white text-xs px-3 py-1.5 rounded-full font-bold shadow-md z-20"
             >
               Trocar
             </button>
           )}
        </div>
      )}
    </div>
  );
};
