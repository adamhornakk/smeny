import React, { useState, useEffect } from 'react';
import { Download, Share, X, Smartphone } from 'lucide-react';

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    // Check if the app is already installed and running standalone
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      window.navigator.standalone === true;

    if (isStandalone) {
      return; // Already running as PWA
    }

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(ios);

    // If iOS and not standalone, we can prompt after a small delay
    if (ios) {
      // Don't show immediately, wait a bit so user sees the interface
      const timer = setTimeout(() => {
        // Only show if user hasn't closed it in this session
        if (!sessionStorage.getItem('pwa_banner_closed')) {
          setShowBanner(true);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }

    // For Android/Chrome desktop: listen to the install prompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      // Store the event so it can be triggered later
      setDeferredPrompt(e);
      // Only show if user hasn't closed it in this session
      if (!sessionStorage.getItem('pwa_banner_closed')) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the browser install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA installation outcome: ${outcome}`);
    
    // Clear deferredPrompt
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleClose = () => {
    sessionStorage.setItem('pwa_banner_closed', 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <>
      <div className="pwa-banner glass-panel">
        <div className="pwa-content">
          <div style={{
            background: 'rgba(45, 212, 191, 0.15)',
            padding: '10px',
            borderRadius: '12px',
            display: 'inline-flex'
          }}>
            <Smartphone size={24} className="pwa-icon-glow" style={{ color: '#2dd4bf' }} />
          </div>
          <div className="pwa-text">
            <h4>Nainstalovat aplikaci na plochu</h4>
            <p>
              {isIos 
                ? 'Uložte si aplikaci na plochu pro rychlý přístup a plnohodnotný zobrazení.' 
                : 'Získejte rychlý přístup z domovské obrazovky a podporu offline režimu.'}
            </p>
          </div>
        </div>

        <div className="pwa-actions">
          {isIos ? (
            <button 
              className="btn btn-primary" 
              onClick={() => setShowIosInstructions(true)}
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            >
              Jak nainstalovat?
            </button>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={handleInstallClick}
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            >
              <Download size={16} /> Instalovat
            </button>
          )}
          <button 
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {showIosInstructions && (
        <div className="modal-overlay" onClick={() => setShowIosInstructions(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowIosInstructions(false)}>
              <X size={20} />
            </button>
            <div className="modal-header">
              <h3 className="modal-title">Instalace na Apple iOS</h3>
            </div>
            <div className="modal-body" style={{ fontSize: '0.95rem', gap: '20px' }}>
              <p>Aplikaci nelze nainstalovat automaticky kvůli omezením systému iOS. Postupujte podle těchto jednoduchých kroků:</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}>1</span>
                  <span>Otevřete tuto aplikaci v prohlížeči <strong>Safari</strong> na vašem iPhonu.</span>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}>2</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    Klepněte na tlačítko <strong>Sdílet</strong> <Share size={18} style={{ color: 'var(--primary)' }} /> na spodní liště.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}>3</span>
                  <span>Sjeďte dolů a vyberte možnost <strong>Přidat na plochu</strong>.</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button className="btn btn-primary" onClick={() => setShowIosInstructions(false)}>
                  Rozumím
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
