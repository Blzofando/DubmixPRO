import React, { useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Key, Bot, Mic } from 'lucide-react';

export const ApiKeyInput = () => {
  const { apiKey, setApiKey, openAIKey, setOpenAIKey } = useProject();
  const [geminiVal, setGeminiVal] = useState('');
  const [openAIVal, setOpenAIVal] = useState('');

  // Só esconde se TIVER AS DUAS chaves salvas
  if (apiKey && openAIKey) return null;

  const handleSave = () => {
    if (geminiVal) setApiKey(geminiVal);
    if (openAIVal) setOpenAIKey(openAIVal);
  };

  return (
    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 mb-6">
      <div className="flex items-center gap-2 mb-4 text-yellow-400">
        <Key size={20} />
        <h3 className="font-bold">Configuração das APIs</h3>
      </div>
      
      <div className="space-y-4">
        {/* Gemini Input */}
        <div>
          <label className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Bot size={14} /> Gemini API Key (Transcrição/Tradução)
          </label>
          <input 
            type="password" 
            value={geminiVal}
            onChange={(e) => setGeminiVal(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
          />
        </div>

        {/* OpenAI Input */}
        <div>
          <label className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Mic size={14} /> OpenAI API Key (Voz/TTS)
          </label>
          <input 
            type="password" 
            value={openAIVal}
            onChange={(e) => setOpenAIVal(e.target.value)}
            placeholder="sk-..."
            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
          />
        </div>

        <button 
          onClick={handleSave}
          disabled={!geminiVal || !openAIVal}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white p-2 rounded font-bold transition-colors"
        >
          Salvar Chaves
        </button>
      </div>
    </div>
  );
};
