import React from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import { ApiKeyInput } from './components/ApiKeyInput';
import { Upload } from './components/Upload';
import { ControlPanel } from './components/ControlPanel';
import { Mic2 } from 'lucide-react';

function App() {
  return (
    <ProjectProvider>
      <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
        <div className="max-w-md mx-auto">
          <header className="flex items-center gap-3 mb-8">
            <div className="bg-gradient-to-tr from-blue-600 to-purple-600 p-3 rounded-xl shadow-lg shadow-blue-900/20">
              <Mic2 className="text-white w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Dubmix Pro</h1>
              <p className="text-xs text-slate-400 font-medium">AI Dubbing • Client-Side • FFmpeg</p>
            </div>
          </header>

          <main>
            <ApiKeyInput />
            <Upload />
            <ControlPanel />
          </main>
          
          <footer className="mt-12 text-center text-slate-600 text-xs">
            <p>Powered by Gemini 2.5 Flash & FFmpeg.wasm</p>
          </footer>
        </div>
      </div>
    </ProjectProvider>
  );
}

export default App;
