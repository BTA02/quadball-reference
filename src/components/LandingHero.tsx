import React from 'react';
import { Play, ShieldCheck, TrendingUp, Users, ArrowRight } from 'lucide-react';
import { signIn } from '../lib/firebase';

interface LandingHeroProps {
  onProceed: () => void;
}

export default function LandingHero({ onProceed }: LandingHeroProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <img src="/quadball-logo.svg" alt="Logo" className="w-8 h-8" />
          <span className="text-xl font-bold tracking-tight">Quadball Reference</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={onProceed}
            className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            Continue as Guest
          </button>
          <button 
            onClick={signIn}
            className="px-5 py-2 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm font-bold text-white transition-all shadow-sm"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto w-full -mt-12">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900 mb-6">
          Quadball Statistics Platform
        </h1>
        <p className="text-lg text-gray-600 mb-12 max-w-2xl">
          An open-source hub for tracking, verifying, and analyzing Quadball game data. View historical stats or contribute by recording new matches.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <button 
            onClick={onProceed}
            className="flex items-center justify-center gap-2 px-8 py-3.5 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-white shadow-sm transition-all"
          >
            Explore Public Stats
            <ArrowRight className="w-4 h-4" />
          </button>
          <button 
            onClick={signIn}
            className="flex items-center justify-center gap-2 px-8 py-3.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl font-bold text-gray-700 shadow-sm transition-all"
          >
            Sign in & Contribute
          </button>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full border-t border-gray-200 pt-16 text-left">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center mb-4">
              <Play className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-bold text-gray-900">Record Data Natively</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Sync stats directly to video timestamps. Watch games and log events without leaving the player.
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-bold text-gray-900">Community Verified</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Box scores are crowd-sourced. Upvote accurate stats, flag errors, and help maintain data integrity.
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center mb-4">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-bold text-gray-900">Team Management</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Join a team roster to set your active lineup, control visibility, and access advanced private metrics.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
