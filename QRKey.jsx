import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const INPUT_TYPES = ["URL", "Text", "WiFi", "vCard"];
const DOT_STYLES = ["square", "dots", "rounded", "classy", "classy-rounded", "extra-rounded"];
const EYE_STYLES = ["square", "extra-rounded", "dot"];
const EC_LEVELS = ["L", "M", "Q", "H"];

function encodeWifi({ ssid, password, security, hidden }) {
  return `WIFI:T:${security};S:${ssid};P:${password};H:${hidden ? "true" : "false"};;`;
}
function encodeVCard({ name, phone, email, org, url }) {
  return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL:${phone}\nEMAIL:${email}\nORG:${org}\nURL:${url}\nEND:VCARD`;
}
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [parseInt(clean.substring(0,2),16), parseInt(clean.substring(2,4),16), parseInt(clean.substring(4,6),16)];
}
function luminance(r, g, b) {
  return [r,g,b].reduce((acc, c, i) => {
    const s = c/255;
    const l = s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4);
    return acc + l * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}
function contrastRatio(hex1, hex2) {
  const l1 = luminance(...hexToRgb(hex1));
  const l2 = luminance(...hexToRgb(hex2));
  const lighter = Math.max(l1,l2), darker = Math.min(l1,l2);
  return (lighter+0.05)/(darker+0.05);
}

export default function QRKey() {
  const canvasRef = useRef(null);
  const qrRef = useRef(null);
  const logoInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("URL");
  const [qrReady, setQrReady] = useState(false);
  const [libLoaded, setLibLoaded] = useState(false);

  const [urlValue, setUrlValue] = useState("https://anthropic.com");
  const [textValue, setTextValue] = useState("Hello, World!");
  const [wifiData, setWifiData] = useState({ ssid: "", password: "", security: "WPA", hidden: false });
  const [vcardData, setVcardData] = useState({ name: "", phone: "", email: "", org: "", url: "" });

  const [fgColor, setFgColor] = useState("#0a0a0a");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [transparentBg, setTransparentBg] = useState(false);
  const [dotStyle, setDotStyle] = useState("rounded");
  const [eyeStyle, setEyeStyle] = useState("extra-rounded");
  const [ecLevel, setEcLevel] = useState("M");
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoSize, setLogoSize] = useState(0.25);
  const [qrSize] = useState(320);
  const [margin, setMargin] = useState(2);

  const [contrastOk, setContrastOk] = useState(true);
  const [contrastVal, setContrastVal] = useState(21);
  const [downloading, setDownloading] = useState(null);
  const [logoHover, setLogoHover] = useState(false);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (window.QRCodeStyling) { setLibLoaded(true); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/qr-code-styling@1.5.0/lib/qr-code-styling.js";
    script.onload = () => setLibLoaded(true);
    document.head.appendChild(script);
  }, []);

  const getQRData = useCallback(() => {
    switch (activeTab) {
      case "URL": return urlValue || "https://example.com";
      case "Text": return textValue || "Hello";
      case "WiFi": return encodeWifi(wifiData);
      case "vCard": return encodeVCard(vcardData);
      default: return urlValue;
    }
  }, [activeTab, urlValue, textValue, wifiData, vcardData]);

  useEffect(() => {
    if (transparentBg) { setContrastOk(true); return; }
    const ratio = contrastRatio(fgColor, bgColor);
    setContrastVal(ratio.toFixed(1));
    setContrastOk(ratio >= 3);
  }, [fgColor, bgColor, transparentBg]);

  useEffect(() => {
    if (logoUrl && (ecLevel === "L" || ecLevel === "M")) {
      setEcLevel("H");
      showNotification("Error correction upgraded to H for logo");
    }
  }, [logoUrl]);

  const buildOptions = useCallback(() => {
    const eyeMap = {
      "square": { outer: "square", inner: "square" },
      "extra-rounded": { outer: "extra-rounded", inner: "extra-rounded" },
      "dot": { outer: "extra-rounded", inner: "dot" },
    };
    const eye = eyeMap[eyeStyle] || eyeMap["extra-rounded"];
    return {
      width: qrSize, height: qrSize, type: "canvas",
      data: getQRData(), margin,
      qrOptions: { errorCorrectionLevel: ecLevel },
      backgroundOptions: { color: transparentBg ? "transparent" : bgColor },
      dotsOptions: { color: fgColor, type: dotStyle },
      cornersSquareOptions: { color: fgColor, type: eye.outer },
      cornersDotOptions: { color: fgColor, type: eye.inner },
      ...(logoUrl ? { image: logoUrl, imageOptions: { crossOrigin: "anonymous", margin: 4, imageSize: logoSize, hideBackgroundDots: true } } : {}),
    };
  }, [getQRData, fgColor, bgColor, transparentBg, dotStyle, eyeStyle, ecLevel, logoUrl, logoSize, qrSize, margin]);

  useEffect(() => {
    if (!libLoaded || !canvasRef.current) return;
    const opts = buildOptions();
    if (!qrRef.current) {
      qrRef.current = new window.QRCodeStyling(opts);
      qrRef.current.append(canvasRef.current);
      setQrReady(true);
    } else {
      qrRef.current.update(opts);
    }
  }, [libLoaded, buildOptions]);

  function showNotification(msg) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }

  async function handleDownload(format) {
    if (!qrRef.current) return;
    setDownloading(format);
    try {
      await qrRef.current.download({ name: "qrkey", extension: format });
      showNotification(`Downloaded as ${format.toUpperCase()}`);
    } catch (e) { showNotification("Download failed"); }
    setTimeout(() => setDownloading(null), 1000);
  }

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogoUrl(ev.target.result);
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoUrl(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
    if (ecLevel === "H") setEcLevel("M");
  }

  const inputData = getQRData();

  return (
    <div style={{ fontFamily: "'DM Mono', 'Courier New', monospace" }} className="min-h-screen bg-[#0c0c0c] text-[#e8e4dc] overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Playfair+Display:wght@400;700;900&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0c0c0c; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        .qr-preview-wrapper canvas { border-radius: 12px; }
        .dot-btn { transition: all 0.15s ease; }
        .dot-btn:hover { transform: scale(1.05); }
        .dot-btn.active { box-shadow: 0 0 0 2px #d4a853; }
        .control-section { border-bottom: 1px solid #1e1e1e; }
        input[type="color"] { -webkit-appearance: none; border: none; width: 36px; height: 36px; border-radius: 8px; cursor: pointer; padding: 2px; background: transparent; }
        input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; border-radius: 6px; }
        input[type="color"]::-webkit-color-swatch { border: none; border-radius: 6px; }
        input[type="range"] { -webkit-appearance: none; width: 100%; height: 3px; background: #2a2a2a; border-radius: 2px; outline: none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #d4a853; cursor: pointer; transition: transform 0.1s; }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); }
        .tab-pill { transition: all 0.2s ease; }
        .tab-pill.active { background: #d4a853; color: #0c0c0c; }
        .input-field { background: #111; border: 1px solid #222; color: #e8e4dc; border-radius: 8px; padding: 10px 14px; width: 100%; font-family: 'DM Mono', monospace; font-size: 13px; outline: none; transition: border-color 0.15s; }
        .input-field:focus { border-color: #d4a853; }
        .input-field::placeholder { color: #444; }
        .toggle-switch { position: relative; width: 40px; height: 22px; background: #222; border-radius: 11px; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
        .toggle-switch.on { background: #d4a853; }
        .toggle-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: white; border-radius: 50%; transition: transform 0.2s; }
        .toggle-switch.on::after { transform: translateX(18px); }
        .download-btn { transition: all 0.2s ease; position: relative; overflow: hidden; }
        .download-btn::before { content: ''; position: absolute; inset: 0; background: rgba(212,168,83,0.1); transform: scaleX(0); transform-origin: left; transition: transform 0.3s ease; }
        .download-btn:hover::before { transform: scaleX(1); }
        .download-btn:hover { border-color: #d4a853 !important; color: #d4a853 !important; }
        @keyframes qrPulse { 0%,100%{opacity:1}50%{opacity:0.7} }
        .qr-loading { animation: qrPulse 1.2s ease infinite; }
      `}</style>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16,1,0.3,1] }}
        className="flex items-center justify-between px-8 py-5 border-b border-[#1a1a1a]"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#d4a853] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="#0c0c0c"/>
              <rect x="11" y="1" width="6" height="6" rx="1" fill="#0c0c0c"/>
              <rect x="1" y="11" width="6" height="6" rx="1" fill="#0c0c0c"/>
              <rect x="11" y="11" width="2" height="2" fill="#0c0c0c"/>
              <rect x="15" y="11" width="2" height="2" fill="#0c0c0c"/>
              <rect x="11" y="15" width="2" height="2" fill="#0c0c0c"/>
              <rect x="15" y="15" width="2" height="2" fill="#0c0c0c"/>
            </svg>
          </div>
          <div>
            <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.02em" }}>
              QRKey
            </span>
            <span className="text-[#444] text-xs ml-2 tracking-widest uppercase">Studio</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#333]">
          <span className="w-2 h-2 rounded-full bg-[#2a7a4b] inline-block"></span>
          <span>client-side · private</span>
        </div>
      </motion.header>

      {/* Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#d4a853] text-[#0c0c0c] px-4 py-2 rounded-full text-xs font-medium shadow-xl">
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-65px)]">

        {/* LEFT: Controls */}
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16,1,0.3,1] }}
          className="w-full lg:w-[400px] border-r border-[#1a1a1a] flex flex-col overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 65px)" }}>

          {/* Input Tabs */}
          <div className="p-6 control-section">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-3">Input Type</div>
            <div className="flex gap-1 p-1 bg-[#111] rounded-lg">
              {INPUT_TYPES.map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`tab-pill flex-1 py-2 px-2 rounded-md text-xs font-medium ${activeTab === tab ? "active" : "text-[#555] hover:text-[#888]"}`}>
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Input Fields */}
          <div className="p-6 control-section">
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                {activeTab === "URL" && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-2">URL</div>
                    <input className="input-field" placeholder="https://example.com" value={urlValue} onChange={e => setUrlValue(e.target.value)} />
                  </div>
                )}
                {activeTab === "Text" && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-2">Plain Text</div>
                    <textarea className="input-field resize-none" rows={3} placeholder="Enter any text..." value={textValue} onChange={e => setTextValue(e.target.value)} style={{ lineHeight: "1.6" }} />
                  </div>
                )}
                {activeTab === "WiFi" && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-2">Network Name (SSID)</div>
                      <input className="input-field" placeholder="MyNetwork" value={wifiData.ssid} onChange={e => setWifiData(p => ({...p, ssid: e.target.value}))} />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-2">Password</div>
                      <input className="input-field" type="password" placeholder="••••••••" value={wifiData.password} onChange={e => setWifiData(p => ({...p, password: e.target.value}))} />
                    </div>
                    <div className="flex gap-2">
                      {["WPA","WEP","nopass"].map(s => (
                        <button key={s} onClick={() => setWifiData(p => ({...p, security: s}))}
                          className={`flex-1 py-2 rounded-lg text-xs border transition-all ${wifiData.security === s ? "border-[#d4a853] text-[#d4a853]" : "border-[#222] text-[#555] hover:border-[#333]"}`}>{s}</button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#555]">Hidden Network</span>
                      <div className={`toggle-switch ${wifiData.hidden ? "on" : ""}`} onClick={() => setWifiData(p => ({...p, hidden: !p.hidden}))} />
                    </div>
                  </div>
                )}
                {activeTab === "vCard" && (
                  <div className="space-y-3">
                    {[{key:"name",label:"Full Name",placeholder:"Jane Smith"},{key:"phone",label:"Phone",placeholder:"+1 555 000 0000"},{key:"email",label:"Email",placeholder:"jane@example.com"},{key:"org",label:"Organization",placeholder:"Acme Corp"},{key:"url",label:"Website",placeholder:"https://example.com"}].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-1">{label}</div>
                        <input className="input-field" placeholder={placeholder} value={vcardData[key]} onChange={e => setVcardData(p => ({...p, [key]: e.target.value}))} />
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Colors */}
          <div className="p-6 control-section">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-4">Colors</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#888]">Foreground</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#444] font-mono">{fgColor}</span>
                  <div className="w-9 h-9 rounded-lg border border-[#2a2a2a] overflow-hidden"><input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} /></div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#888]">Background</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#444] font-mono">{transparentBg ? "transparent" : bgColor}</span>
                  {!transparentBg && <div className="w-9 h-9 rounded-lg border border-[#2a2a2a] overflow-hidden"><input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} /></div>}
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-[#888]">Transparent Background</span>
                <div className={`toggle-switch ${transparentBg ? "on" : ""}`} onClick={() => setTransparentBg(p => !p)} />
              </div>
              <AnimatePresence>
                {!contrastOk && !transparentBg && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 bg-[#2a1a0a] border border-[#5a3a1a] rounded-lg px-3 py-2">
                    <span className="text-[#f5a623]">⚠</span>
                    <span className="text-xs text-[#f5a623]">Low contrast ({contrastVal}:1) — may not scan reliably</span>
                  </motion.div>
                )}
                {contrastOk && !transparentBg && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <span className="text-[10px] text-[#2a7a4b]">✓ Contrast {contrastVal}:1 — scannable</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Dot Style */}
          <div className="p-6 control-section">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-4">Dot Pattern</div>
            <div className="grid grid-cols-3 gap-2">
              {DOT_STYLES.map(style => (
                <button key={style} onClick={() => setDotStyle(style)}
                  className={`dot-btn py-2 px-2 rounded-lg border text-xs transition-all ${dotStyle === style ? "active border-[#d4a853] text-[#d4a853] bg-[#d4a85310]" : "border-[#1e1e1e] text-[#555] hover:border-[#333] hover:text-[#888]"}`}>
                  {style.replace("-"," ")}
                </button>
              ))}
            </div>
          </div>

          {/* Eye Style */}
          <div className="p-6 control-section">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-4">Corner Eyes</div>
            <div className="grid grid-cols-3 gap-2">
              {EYE_STYLES.map(style => (
                <button key={style} onClick={() => setEyeStyle(style)}
                  className={`dot-btn py-2 px-2 rounded-lg border text-xs transition-all ${eyeStyle === style ? "active border-[#d4a853] text-[#d4a853] bg-[#d4a85310]" : "border-[#1e1e1e] text-[#555] hover:border-[#333] hover:text-[#888]"}`}>
                  {style === "extra-rounded" ? "rounded" : style}
                </button>
              ))}
            </div>
          </div>

          {/* Error Correction */}
          <div className="p-6 control-section">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#555]">Error Correction</div>
              <div className="text-[10px] text-[#333]">{ecLevel==="L"?"7%":ecLevel==="M"?"15%":ecLevel==="Q"?"25%":"30%"} recovery</div>
            </div>
            <div className="flex gap-1">
              {EC_LEVELS.map(level => (
                <button key={level} onClick={() => setEcLevel(level)}
                  className={`flex-1 py-2 rounded-lg text-xs font-mono border transition-all ${ecLevel === level ? "border-[#d4a853] text-[#d4a853] bg-[#d4a85310]" : "border-[#1e1e1e] text-[#555] hover:border-[#2a2a2a]"}`}>
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Logo */}
          <div className="p-6 control-section">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-4">Logo / Watermark</div>
            {!logoUrl ? (
              <div className="border-2 border-dashed border-[#1e1e1e] rounded-xl p-6 text-center cursor-pointer hover:border-[#2a2a2a] transition-all"
                onClick={() => logoInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setLogoHover(true); }}
                onDragLeave={() => setLogoHover(false)}
                onDrop={e => { e.preventDefault(); setLogoHover(false); const file = e.dataTransfer.files?.[0]; if (file) { const r = new FileReader(); r.onload = ev => setLogoUrl(ev.target.result); r.readAsDataURL(file); } }}
                style={{ borderColor: logoHover ? "#d4a853" : undefined }}>
                <div className="text-2xl mb-2 opacity-30">⊕</div>
                <div className="text-xs text-[#444]">Drop image or click to upload</div>
                <div className="text-[10px] text-[#333] mt-1">PNG, SVG, JPG</div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-[#111] rounded-xl p-3">
                  <img src={logoUrl} alt="logo" className="w-10 h-10 rounded-lg object-contain bg-white p-1" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[#888]">Logo uploaded</div>
                    <div className="text-[10px] text-[#444]">EC upgraded to H</div>
                  </div>
                  <button onClick={removeLogo} className="text-[#444] hover:text-[#d4a853] text-lg transition-colors">×</button>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs text-[#555]">Size</span>
                    <span className="text-xs font-mono text-[#444]">{Math.round(logoSize*100)}%</span>
                  </div>
                  <input type="range" min="10" max="40" value={logoSize*100} onChange={e => setLogoSize(parseInt(e.target.value)/100)} />
                </div>
              </div>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>

          {/* Margin */}
          <div className="p-6">
            <div className="flex justify-between mb-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#555]">Quiet Zone Margin</div>
              <span className="text-xs font-mono text-[#444]">{margin}px</span>
            </div>
            <input type="range" min="0" max="10" value={margin} onChange={e => setMargin(parseInt(e.target.value))} />
          </div>
        </motion.div>

        {/* RIGHT: Preview + Export */}
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16,1,0.3,1] }}
          className="flex-1 flex flex-col items-center justify-center p-8 gap-8">

          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-2xl opacity-20 scale-110" style={{ background: fgColor }} />
              <div className="relative rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: transparentBg ? "repeating-conic-gradient(#1a1a1a 0% 25%, #111 0% 50%) 0 0 / 16px 16px" : bgColor, padding: "12px", border: "1px solid #1e1e1e" }}>
                {!libLoaded && (
                  <div className="w-80 h-80 flex items-center justify-center qr-loading">
                    <div className="text-[#333] text-xs tracking-widest">LOADING ENGINE</div>
                  </div>
                )}
                <div ref={canvasRef} className="qr-preview-wrapper" style={{ display: libLoaded ? "block" : "none" }} />
              </div>
            </div>

            <div className="flex items-center gap-2 bg-[#111] border border-[#1a1a1a] rounded-full px-4 py-2 max-w-sm w-full">
              <span className="text-[#444] text-xs flex-shrink-0">
                {activeTab==="URL"?"🔗":activeTab==="WiFi"?"📶":activeTab==="vCard"?"👤":"📝"}
              </span>
              <span className="text-xs text-[#555] truncate font-mono">{inputData.substring(0,60)}{inputData.length>60?"…":""}</span>
              <span className="text-[10px] text-[#333] flex-shrink-0 ml-auto">{inputData.length}c</span>
            </div>
          </div>

          {/* Downloads */}
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            {["png","svg"].map(fmt => (
              <button key={fmt} onClick={() => handleDownload(fmt)} disabled={!qrReady || !!downloading}
                className="download-btn flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl border border-[#2a2a2a] text-sm text-[#888] disabled:opacity-40 disabled:cursor-not-allowed">
                {downloading === fmt ? (
                  <span className="text-xs tracking-widest">SAVING…</span>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M7 1v8M4 6l3 3 3-3M1 10v1a2 2 0 002 2h8a2 2 0 002-2v-1"/>
                    </svg>
                    Download {fmt.toUpperCase()}
                  </>
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 w-full max-w-sm text-center">
            {[{icon:"⬡",label:"Client-side",sub:"100% private"},{icon:"◈",label:"Vector SVG",sub:"Infinite scale"},{icon:"◉",label:"EC Level H",sub:"30% recovery"}].map(({icon,label,sub}) => (
              <div key={label} className="bg-[#0e0e0e] border border-[#151515] rounded-xl p-3">
                <div className="text-lg mb-1 opacity-30">{icon}</div>
                <div className="text-[10px] text-[#666]">{label}</div>
                <div className="text-[9px] text-[#333]">{sub}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}