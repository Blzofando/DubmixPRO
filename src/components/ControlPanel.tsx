import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Play, Loader2, Download, Terminal } from 'lucide-react';

export const ControlPanel = () => {
  const { processingState, startProcessing, apiKey, videoFile, finalAudioUrl, segments } = useProject();
  const isProcessing = processingState.stage !== 'idle' && processingState.stage !== 'completed' && processingState.stage !== 'error';
  const canStart = apiKey && videoFile && !isProcessing;

  return (
    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
      <h2 className="text-xl font-bold text-white mb-4">Painel de Controle</h2>
      
      {/* Log de Status */}
      <div className="bg-slate-900 p-3 rounded mb-4 font-mono text-xs border border-slate-800">
        <div className="flex justify-between mb-2">
          <span className="text-slate-400 uppercase font-bold flex items-center gap-2">
             <Terminal size={12}/> {processingState.stage}
          </span>
          <span className="text-blue-400">{processingState.progress}%</span>
        </div>
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-2">
           <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${processingState.progress}%` }}></div>
        </div>
        <p className="text-green-400 mb-2">{' > '} {processingState.log}</p>
        
        {/* LISTA DE SEGMENTOS (VISUALIZAÇÃO DAS ETAPAS) */}
        {segments.length > 0 && (
          <div className="mt-4 border-t border-slate-700 pt-2">
            <p className="text-slate-500 mb-2">Segmentos detectados: {segments.length}</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {segments.map((seg) => (
                <div key={seg.id} className="flex gap-2 text-slate-300 bg-slate-800/50 p-1 rounded">
                   <span className="text-blue-500 shrink-0">[{seg.start}]</span>
                   <span>{seg.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {processingState.stage === 'error' && (
             <p className="text-red-500 mt-2 font-bold bg-red-900/20 p-2 rounded">
               {processingState.log}
             </p>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex flex-col gap-3">
        {!finalAudioUrl ? (
          <button
            onClick={startProcessing}
            disabled={!canStart}
            className={`
              flex items-center justify-center gap-2 w-full py-3 rounded-lg font-bold text-lg transition-all
              ${canStart ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/50' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
            `}
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Play />}
            {isProcessing ? 'Processando...' : 'INICIAR DUBLAGEM'}
          </button>
        ) : (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4">
            <div className="p-4 bg-green-900/30 border border-green-600 rounded text-center">
              <p className="text-green-400 font-bold mb-2">Dublagem Concluída!</p>
              <audio src={finalAudioUrl} controls className="w-full" />
            </div>
            <a 
              href={finalAudioUrl} 
              download="dubmix_pro_audio.mp3"
              className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold"
            >
              <Download /> Baixar Apenas Voz
            </a>
            <button 
               onClick={() => window.location.reload()} 
               className="w-full py-2 text-slate-400 text-sm underline"
            >
              Reiniciar Projeto
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
