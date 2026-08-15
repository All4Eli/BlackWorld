"use client";

import React from 'react';

export default function GlobalDonationBanner() {
  return (
    <div className="bg-[#111111] text-white py-6 text-center border-b-2 border-[#bb0000] shadow-[0_0_15px_rgba(187,0,0,0.4)] relative z-50">
      <div className="max-w-4xl mx-auto px-6">
        <h3 className="text-xl font-black tracking-widest uppercase mb-2 text-[#ff3333]">
          Fund the Darkness
        </h3>
        <p className="text-gray-400 mb-5 text-sm">
          BlackWorld relies on the blood of its players to survive. If you want to keep conquering, 
          pay your tribute.
        </p>
        
        <div className="flex flex-col md:flex-row items-center justify-center gap-6">
          <form action="/api/checkout" method="POST" className="w-full md:w-auto">
            <button 
              type="submit" 
              className="w-full md:w-auto bg-[#bb0000] text-white px-6 py-2 border border-[#ff3333] font-bold uppercase tracking-wide hover:bg-[#880000] transition"
            >
              Donate via Stripe
            </button>
          </form>
          
          <div className="bg-black p-3 border border-[#333] flex flex-col items-center">
            <span className="block text-[10px] text-gray-500 mb-1 uppercase tracking-widest font-bold">Bitcoin (BTC) Tribute</span>
            <code className="text-[#00ff00] font-mono text-sm break-all select-all">bc1qqyk7tr75wsax4vtsg8ytfmm9f04qz4r4vma7rv</code>
          </div>
        </div>
      </div>
    </div>
  );
}
