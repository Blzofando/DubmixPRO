import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Play, Loader2, Download, Terminal, Edit3, CheckCircle, Zap } from 'lucide-react';

export const ControlPanel = () => {
  const { 
    processingState, startProcessing, resumeProcessing, 
    apiKey, openAIKey, videoFile, finalAudioUrl, 
    segments, updateSegmentText 
  } = useProject();

  const isProcessing = processingState.stage !== 'idle' && processingState.stage !== 'completed' && processingState.stage !== 'error' && processingState.stage !== 'waiting_for_approval';
  const isWaiting = processingState.stage === 'waiting_for_approval';
  const canStart = apiKey && openAIKey && videoFile && !isProcessing && !isWaiting;

  // FUNÇÃO DE CLIQUE BLINDADA
  const handleConfirm = () => {
    console.log("Botão clicado! Enviando segmentos atuais...");
    
    // Passamos 'segments' (o estado atual da tela) para a função
    // Isso garante que suas edições sejam usadas
    if (resumeProcessing) {
        resumeProcessing(segments);
    } else {
        alert("Erro crítico: Contexto não atualizado. Recarregue a página.");
    }
  };

  return (
    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
      <h2 className="text-xl font-bold text-white mb-4">Painel de Controle</h2>
      
      {/* Log de Status */}
      <div className="bg-slate-900 p-3 rounded mb-4 font-mono text-xs border border-slate-800">
        <div className="flex justify-between mb-2">
          <span className="text-slate-400 uppercase font-bold flex items-center gap-2">
             <Terminal size={12}/> {processingState.stage.replace(/_/g, ' ')}
          </span>
          <span className="text-blue-400">{processingState.progress}%</span>
        </div>
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-2">
           <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${processingState.progress}%` }}></div>
        </div>
        <p className="text-green-400 mb-2">{' > '} {processingState.log}</p>
        
        {/* MODO DE EDIÇÃO */}
        {segments.length > 0 && (
          <div className="mt-4 border-t border-slate-700 pt-2">
            <div className="flex justify-between items-center mb-2">
              <p className="text-slate-500">Legendas ({segments.length})</p>
              {isWaiting && <span className="text-yellow-400 text-xs flex items-center gap-1"><Edit3 size={10}/> Modo Edição</span>}
            </div>
            
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {segments.map((seg) => (
                <div key={seg.id} className={`flex flex-col gap-1 p-2 rounded ${isWaiting ? 'bg-slate-700/50 border border-blue-500/30' : 'bg-slate-800/50'}`}>
                   <div className="flex justify-between text-[10px] text-slate-400">
                      <span className="text-blue-400">[{seg.start}]</span>
                      {/* Mostra Duração Alvo para você se guiar na edição */}
                      <span>{(seg.endTime - seg.startTime).toFixed(1)}s</span>
                   </div>
                   
                   {isWaiting ? (
                     <textarea 
                       className="w-full bg-slate-900 text-white text-sm p-2 rounded border border-slate-600 focus:border-blue-500 outline-none resize-y"
                       rows={2}
                       value={seg.text}
                       onChange={(e) => updateSegmentText(seg.id, e.target.value)}
                     />
                   ) : (
                     <span className="text-slate-300 text-sm">{seg.text}</span>
                   )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex flex-col gap-3">
        {/* SE ESTIVER ESPERANDO APROVAÇÃO */}
        {isWaiting && (
           <button
             type="button"
             onClick={handleConfirm}
             className="flex items-center justify-center gap-2 w-full py-4 rounded-lg font-bold text-lg bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/50 animate-pulse cursor-pointer transition-transform active:scale-95"
           >
             <CheckCircle /> CONFIRMAR E DUBLAR
           </button>
        )}

        {/* BOTÕES INICIAIS */}
        {!finalAudioUrl && !isWaiting && !isProcessing && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => startProcessing('manual')}
              disabled={!canStart}
              className={`
                flex flex-col items-center justify-center gap-1 py-3 rounded-lg font-bold text-sm border
                ${canStart ? 'bg-slate-700 border-blue-500 hover:bg-slate-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'}
              `}
            >
              <Edit3 size={20} className="text-blue-400"/>
              REFINAR TRADUÇÃO
            </button>
            
            <button
              onClick={() => startProcessing('auto')}
              disabled={!canStart}
              className={`
                flex flex-col items-center justify-center gap-1 py-3 rounded-lg font-bold text-sm border
                ${canStart ? 'bg-blue-600 border-blue-400 hover:bg-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'}
              `}
            >
              <Zap size={20} className="text-yellow-300"/>
              DUBLAR DIRETO
            </button>
          </div>
        )}

        {/* LOADING STATE */}
        {isProcessing && (
          <button disabled className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-bold text-lg bg-slate-700 text-slate-400">
            <Loader2 className="animate-spin" /> Processando...
          </button>
        )}

        {/* RESULTADO FINAL */}
        {finalAudioUrl && (
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
