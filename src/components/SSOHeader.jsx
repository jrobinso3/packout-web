import React, { useState, useRef, useEffect } from 'react';
import { User, Plus } from 'lucide-react';

const SSOHeader = ({ userImage }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="absolute top-4 right-4 z-[500] font-sans">
      {/* Small Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-7 h-7 rounded-full border border-black/10 hover:border-black/30 transition-all shadow-md overflow-hidden active:scale-95 translate-y-1"
      >
        <img src={userImage} alt="User" className="w-full h-full object-cover" />
      </button>

      {/* Dropdown - Redesigned 30% smaller */}
      {isOpen && (
        <div 
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-[240px] bg-white text-[#242424] shadow-[0_4px_24px_rgba(0,0,0,0.15)] rounded-[2px] overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right transform translate-x-1"
        >
          {/* Header Row */}
          <div className="flex justify-between items-center px-5 pt-3 pb-1.5">
            <span className="text-[11px] font-normal text-[#242424]">Publicis Groupe</span>
            <button className="text-[11px] text-[#0067b8] hover:underline hover:text-[#005da6]">Sign out</button>
          </div>

          {/* Main User Info */}
          <div className="px-5 pt-3 pb-4 flex gap-3">
            {/* Smaller Avatar */}
            <div className="w-[60px] h-[60px] rounded-full overflow-hidden flex-shrink-0 mt-0.5">
              <img src={userImage} alt="User Profile" className="w-full h-full object-cover" />
            </div>

            {/* User Details */}
            <div className="flex flex-col pt-0.5 truncate">
              <h2 className="text-[12px] font-bold text-black leading-tight truncate" title="email@publicis...">
                email@publicis...
              </h2>
              <span className="text-[10px] text-[#3b3b3b] mt-0.5 truncate font-normal">
                email@publicisgroupe.net
              </span>
              
              <div className="mt-2 flex flex-col gap-1">
                <button className="text-[10px] text-[#0067b8] hover:underline w-fit text-left">View account</button>
                <div className="flex items-center gap-1.5">
                  <button className="text-[10px] text-[#0067b8] hover:underline w-fit text-left">Switch directory</button>
                  <button className="text-[#616161] hover:bg-gray-100 px-1 rounded flex items-center justify-center">
                    <span className="text-[14px] leading-none font-bold">...</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer - Sign in with different account */}
          <div className="border-t border-[#e5e5e5]">
            <button className="w-full bg-[#f2f2f2] hover:bg-[#e6e6e6] transition-colors flex items-center gap-3 px-5 py-2 group text-left">
              <div className="w-[32px] h-[32px] rounded-full border border-[#858585] flex items-center justify-center bg-white text-[#616161] group-hover:bg-gray-50 scale-90">
                <div className="relative">
                  <User size={18} strokeWidth={1} />
                  <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full border border-[#858585] w-3 h-3 flex items-center justify-center">
                    <Plus size={8} strokeWidth={4} className="text-[#3b3b3b]" />
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-normal text-[#242424]">Sign in with a different account</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SSOHeader;
