import React, { useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Key } from 'lucide-react';

export const ApiKeyInput = () => {
  const { apiKey, setApiKey } = useProject();
  const [inputVal, setInputVal] = useState('');

  if (apiKey) return null; // Esconde se já salvou

  return (
    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 mb-6">
      <div className="flex items-center gap-2 mb-2 text-yellow-400">
        <Key size={20} />
        <h3 className="font-bold">Configuração Obrigatória</h3>
      </div>
      <p className="text-sm text-slate-400 mb-3">
        Insira sua Google Gemini API Key. Ela será salva apenas na memória do navegador.
      </p>
      <div className="flex gap-2">
        <input 
          type="password" 
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="AIzaSy..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-white"
        />
        <button 
          onClick={() => setApiKey(inputVal)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold"
        >
          Salvar
        </button>
      </div>
    </div>
  );
};
