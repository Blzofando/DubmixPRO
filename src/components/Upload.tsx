import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Upload as UploadIcon, Video } from 'lucide-react';

export const Upload = () => {
  const { setVideoFile, videoUrl, processingState } = useProject();
  const isDisabled = processingState.stage !== 'idle' && processingState.stage !== 'completed' && processingState.stage !== 'error';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setVideoFile(e.target.files[0]);
    }
  };

  return (
    <div className="mb-6">
      {!videoUrl ? (
        <label className={`
          flex flex-col items-center justify-center w-full h-32 
          border-2 border-dashed rounded-lg cursor-pointer 
          ${isDisabled ? 'border-gray-600 bg-gray-800 opacity-50' : 'border-blue-500 bg-slate-800 hover:bg-slate-700'}
        `}>
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <UploadIcon className="w-8 h-8 mb-2 text-blue-400" />
            <p className="text-sm text-gray-400">Toque para selecionar o vídeo</p>
          </div>
          <input type="file" className="hidden" accept="video/*" onChange={handleFile} disabled={isDisabled} />
        </label>
      ) : (
        <div className="bg-black rounded-lg overflow-hidden relative">
           <video src={videoUrl} controls className="w-full max-h-64" />
           {!isDisabled && (
             <button 
               onClick={() => setVideoFile(null)}
               className="absolute top-2 right-2 bg-red-600 text-xs text-white px-2 py-1 rounded"
             >
               Trocar Vídeo
             </button>
           )}
        </div>
      )}
    </div>
  );
};
