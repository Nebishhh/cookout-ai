import { useEffect, useState } from 'react';
import { Flame, UtensilsCrossed, ShoppingBag, Sparkles, CheckCircle2, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DOMAIN_PACKAGE_NAME } from '@cookout-ai/domain';

interface ApiHealth {
  status: string;
  app: string;
  domainPackage: string;
  timestamp: string;
}

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: ApiHealth) => {
        setApiStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-orange-500 selection:text-white">
      {/* Top Header Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-xl shadow-lg shadow-orange-500/20">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-orange-400 via-amber-300 to-amber-100 bg-clip-text text-transparent">
              CookOut AI
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-2"></span>
              Foundation Ready
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Hero */}
      <main className="max-w-7xl mx-auto px-6 py-12 flex-1 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            <span>Intelligent Culinary Event Planner</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6">
            Plan Perfect Cookouts with{' '}
            <span className="bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 bg-clip-text text-transparent">
              Precision & Scale
            </span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed">
            From 4-person family dinners to 50-guest block parties. Scale recipes accurately,
            consolidate shopping lists, track pantry inventory, and leverage Gemini AI assistance.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-orange-500/40 transition-all duration-300">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center mb-4 border border-orange-500/20">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Recipe Scaling Engine</h3>
            <p className="text-sm text-slate-400">
              Automatic ingredient scaling by guest count and portion multipliers with unit
              normalization.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-amber-500/40 transition-all duration-300">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4 border border-amber-500/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Consolidated Shopping</h3>
            <p className="text-sm text-slate-400">
              Smart grocery list aggregation across recipes, deducting available pantry inventory.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-yellow-500/40 transition-all duration-300">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center mb-4 border border-yellow-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Gemini AI Assistant</h3>
            <p className="text-sm text-slate-400">
              Recipe URL/photo import, menu balancing, prep timeline generation, and dietary
              substitutions.
            </p>
          </div>
        </div>

        {/* Monorepo Health Card */}
        <div className="max-w-2xl mx-auto w-full p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-2xl">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <Server className="w-5 h-5 text-orange-400" />
              <h2 className="font-semibold text-white">System Monorepo Status</h2>
            </div>
            <span className="text-xs font-mono text-slate-500">v0.1.0</span>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400">Domain Package Import:</span>
              <span className="font-mono text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded border border-orange-800/40">
                {DOMAIN_PACKAGE_NAME}
              </span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400">API Health Status:</span>
              {loading ? (
                <span className="text-slate-500 text-xs animate-pulse">Connecting...</span>
              ) : apiStatus ? (
                <span className="inline-flex items-center text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Connected ({apiStatus.status})
                </span>
              ) : (
                <span className="text-amber-400 text-xs">Offline / Disconnected</span>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/60 flex justify-end">
            <Button
              variant="default"
              className="bg-orange-600 hover:bg-orange-500 text-white font-medium"
            >
              Explore Roadmap
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        <p>CookOut AI &copy; 2026. Clean Architecture Monorepo Foundation.</p>
      </footer>
    </div>
  );
}

export default App;
