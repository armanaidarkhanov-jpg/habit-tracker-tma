import { useState, useEffect, useCallback, useRef } from "react";
import { loadAll, saveState, saveLogDay } from "./storage.js";

// ─── Constants ───
const MOTIVATIONAL = [
  "Ты на огне!", "Так держать!", "Невероятно!", "Ты машина!",
  "Великолепно!", "Супергерой!", "Легенда!", "Мастер!"
];
const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2500, 3500, 5000];
const LEVEL_NAMES = ["Новичок","Ученик","Практик","Знаток","Мастер","Эксперт","Гуру","Легенда","Титан","Бог привычек","∞"];
const XP_PER_HABIT = 10;
const STREAK_BONUS = 5;
const HABIT_COLORS = ["#FF6B6B","#4ECDC4","#A78BFA","#38BDF8","#FB923C","#F472B6","#34D399","#FBBF24","#E879F9","#6EE7B7"];
const EMOJIS = ["⭐","💪","🧠","🎯","🌱","🔥","💎","🎨","🏃","🍎","💤","📝","🎵","🧹","💰","🐕","☕","🧘","📖","🏋️"];
const DEFAULT_HABITS = [
  { id: "h1", name: "Зарядка", emoji: "🏋️", color: "#FF6B6B" },
  { id: "h2", name: "Чтение", emoji: "📖", color: "#4ECDC4" },
  { id: "h3", name: "Медитация", emoji: "🧘", color: "#A78BFA" },
  { id: "h4", name: "Вода 2л", emoji: "💧", color: "#38BDF8" },
  { id: "h5", name: "Без соцсетей до обеда", emoji: "📵", color: "#FB923C" },
];

// ─── Helpers ───
const toDay = () => new Date().toISOString().split("T")[0];
const dayLabel = (s) => ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][new Date(s+"T12:00:00").getDay()];
const last7 = () => { const d=[]; for(let i=6;i>=0;i--){ const x=new Date(); x.setDate(x.getDate()-i); d.push(x.toISOString().split("T")[0]); } return d; };
const getWeekId = () => { const d=new Date(), day=d.getDay(), diff=d.getDate()-day+(day===0?-6:1); const mon=new Date(d); mon.setDate(diff); return mon.toISOString().split("T")[0]; };

function calcStreak(log) {
  let s=0;
  for(let i=0;i<365;i++){
    const d=new Date(); d.setDate(d.getDate()-i);
    const k=d.toISOString().split("T")[0];
    if(log[k]&&log[k].length>0) s++; else break;
  }
  return s;
}
function getLevel(xp){ for(let i=LEVEL_THRESHOLDS.length-1;i>=0;i--) if(xp>=LEVEL_THRESHOLDS[i]) return i; return 0; }
function xpProg(xp){ const l=getLevel(xp); if(l>=LEVEL_THRESHOLDS.length-1) return 1; return (xp-LEVEL_THRESHOLDS[l])/(LEVEL_THRESHOLDS[l+1]-LEVEL_THRESHOLDS[l]); }

function getWeekXp(log, habits) {
  const d=new Date(), day=d.getDay(), diff=d.getDate()-day+(day===0?-6:1);
  let total=0;
  for(let i=0;i<7;i++){
    const x=new Date(d); x.setDate(diff+i);
    const k=x.toISOString().split("T")[0];
    if(log[k]) total += log[k].filter(id=>id!=="__freeze__").length * XP_PER_HABIT;
  }
  return total;
}

// ─── Confetti ───
function Confetti({ active }) {
  if(!active) return null;
  const ps = Array.from({length:40},(_,i)=>({
    id:i, x:Math.random()*100, delay:Math.random()*0.5,
    dur:1.5+Math.random()*1.5, size:4+Math.random()*6,
    color:["#FFD700","#FF6B6B","#4ECDC4","#A78BFA","#FB923C","#F472B6","#38BDF8","#34D399"][i%8],
    rot:Math.random()*360,
  }));
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:200,overflow:"hidden"}}>
      {ps.map(p=>(
        <div key={p.id} style={{
          position:"absolute",left:`${p.x}%`,top:"-10px",
          width:p.size,height:p.size*1.4,borderRadius:"1px",
          background:p.color,opacity:0.9,
          animation:`confettiFall ${p.dur}s ease-in ${p.delay}s forwards`,
          transform:`rotate(${p.rot}deg)`,
        }}/>
      ))}
    </div>
  );
}

// ─── Circle Progress ───
function Ring({value,size=120,stroke=8,children}){
  const r=(size-stroke)/2, circ=2*Math.PI*r, off=circ*(1-Math.min(1,value));
  return(
    <div style={{position:"relative",width:size,height:size}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#rg)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off}
          style={{transition:"stroke-dashoffset 0.8s cubic-bezier(0.34,1.56,0.64,1)"}}/>
        <defs><linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A78BFA"/><stop offset="50%" stopColor="#FF6B6B"/><stop offset="100%" stopColor="#FFD700"/>
        </linearGradient></defs>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>{children}</div>
    </div>
  );
}

// ─── Icons ───
function HomeIcon({a}){ return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a?"#A78BFA":"#6B5F83"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>; }
function TrophyIcon({a}){ return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a?"#FFD700":"#6B5F83"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>; }
function GiftIcon({a}){ return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a?"#F472B6":"#6B5F83"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>; }

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
export default function HabitTracker() {
  const [tab, setTab] = useState("home");
  const [habits, setHabits] = useState(DEFAULT_HABITS);
  const [log, setLog] = useState({});
  const [xp, setXp] = useState(0);
  const [freezes, setFreezes] = useState(0);
  const [weeklyGoal, setWeeklyGoal] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("⭐");
  const [overlay, setOverlay] = useState(null);
  const [confetti, setConfetti] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [editGoal, setEditGoal] = useState(false);
  const [goalReward, setGoalReward] = useState("");
  const [goalXp, setGoalXp] = useState(200);
  const [pressing, setPressing] = useState(null);

  // Refs for debounced saving
  const saveTimerState = useRef(null);
  const saveTimerLog = useRef(null);

  // ─── Load from Telegram CloudStorage ───
  useEffect(()=>{
    (async()=>{
      try{
        const data = await loadAll();
        if(data.habits) setHabits(data.habits);
        if(data.log && Object.keys(data.log).length > 0) setLog(data.log);
        if(data.xp != null) setXp(data.xp);
        if(data.freezes != null) setFreezes(data.freezes);
        if(data.weeklyGoal) setWeeklyGoal(data.weeklyGoal);
      }catch(e){
        console.warn("Failed to load from CloudStorage:", e);
      }
      setReady(true);
      setTimeout(()=>setMounted(true),50);
    })();
  },[]);

  // ─── Save app-state (debounced) ───
  useEffect(()=>{
    if(!ready) return;
    clearTimeout(saveTimerState.current);
    saveTimerState.current = setTimeout(()=>{
      saveState({ habits, xp, freezes, weeklyGoal }).catch(e =>
        console.warn("Failed to save state:", e)
      );
    }, 300);
  },[habits, xp, freezes, weeklyGoal, ready]);

  // ─── Save log day (debounced) ───
  useEffect(()=>{
    if(!ready) return;
    clearTimeout(saveTimerLog.current);
    saveTimerLog.current = setTimeout(()=>{
      // Save all days that changed — for simplicity save last 7 days
      const days = last7();
      Promise.all(
        days.map(day => {
          if(log[day] !== undefined) return saveLogDay(day, log[day]);
          return null;
        }).filter(Boolean)
      ).catch(e => console.warn("Failed to save log:", e));
    }, 300);
  },[log, ready]);

  // ─── Derived ───
  const t = toDay();
  const done = log[t] || [];
  const streak = calcStreak(log);
  const level = getLevel(xp);
  const progress = xpProg(xp);
  const days7 = last7();
  const allDone = done.length >= habits.length && habits.length > 0;
  const weekXpVal = getWeekXp(log, habits);
  const wid = getWeekId();
  const goalActive = weeklyGoal && weeklyGoal.weekId === wid && !weeklyGoal.claimed;
  const goalAchieved = goalActive && weekXpVal >= weeklyGoal.xpTarget;
  const goalClaimed = weeklyGoal && weeklyGoal.weekId === wid && weeklyGoal.claimed;

  const showOv = (type, text) => {
    setOverlay({type,text});
    if(type==="alldone"||type==="goalclaim") setConfetti(true);
    setTimeout(()=>{setOverlay(null);setConfetti(false);},2800);
  };

  // Haptic feedback helper
  const haptic = (type = "impact") => {
    try {
      const hf = window.Telegram?.WebApp?.HapticFeedback;
      if (!hf) return;
      if (type === "impact") hf.impactOccurred("medium");
      else if (type === "success") hf.notificationOccurred("success");
      else if (type === "light") hf.impactOccurred("light");
    } catch {}
  };

  const toggle = useCallback((id)=>{
    const was=done.includes(id);
    let next,dxp;
    if(was){ next=done.filter(x=>x!==id); dxp=-(XP_PER_HABIT+(streak>1?STREAK_BONUS:0)); }
    else{
      next=[...done,id]; dxp=XP_PER_HABIT+(streak>1?STREAK_BONUS:0);
      haptic("success");
      const pL=getLevel(xp),nL=getLevel(xp+dxp);
      if(nL>pL) setTimeout(()=>showOv("levelup",LEVEL_NAMES[nL]),300);
      if(next.length===habits.length) setTimeout(()=>showOv("alldone",MOTIVATIONAL[Math.floor(Math.random()*MOTIVATIONAL.length)]),400);
    }
    setLog(p=>({...p,[t]:next}));
    setXp(p=>Math.max(0,p+dxp));
  },[done,streak,xp,habits.length,t]);

  const addHabit=()=>{
    if(!newName.trim()) return;
    haptic("light");
    setHabits(p=>[...p,{id:"h"+Date.now(),name:newName.trim(),emoji:newEmoji||"⭐",color:HABIT_COLORS[p.length%HABIT_COLORS.length]}]);
    setNewName("");setNewEmoji("⭐");setShowAdd(false);
  };
  const removeHabit=(id)=>{
    haptic("impact");
    setHabits(p=>p.filter(h=>h.id!==id));
    setLog(p=>{const n={...p};Object.keys(n).forEach(k=>{n[k]=n[k].filter(x=>x!==id);});return n;});
  };
  const saveGoal=()=>{
    if(!goalReward.trim()) return;
    haptic("success");
    setWeeklyGoal({xpTarget:goalXp,reward:goalReward.trim(),weekId:wid,claimed:false});
    setEditGoal(false);setGoalReward("");setGoalXp(200);
  };
  const claimReward=()=>{
    haptic("success");
    setWeeklyGoal(p=>({...p,claimed:true}));
    showOv("goalclaim",weeklyGoal.reward);
  };
  const useFreeze=()=>{
    if(freezes<=0) return;
    haptic("impact");
    const y=new Date();y.setDate(y.getDate()-1);const k=y.toISOString().split("T")[0];
    if(!log[k]||log[k].length===0){setLog(p=>({...p,[k]:["__freeze__"]}));setFreezes(p=>p-1);}
  };

  if(!mounted) return(
    <div style={{minHeight:"100vh",background:"#0F0A1A",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:32,height:32,border:"3px solid rgba(167,139,250,0.2)",borderTopColor:"#A78BFA",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    </div>
  );

  const inp={width:"100%",padding:"14px 16px",background:"rgba(255,255,255,0.04)",border:"1.5px solid rgba(255,255,255,0.08)",borderRadius:"14px",color:"#E8E0F0",fontSize:"15px",outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border-color 0.2s"};
  const btnP={padding:"14px 24px",border:"none",borderRadius:"14px",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",fontWeight:700,fontSize:"15px",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(124,58,237,0.35)",transition:"transform 0.15s"};

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(170deg,#0F0A1A 0%,#161024 50%,#0E0D1B 100%)",fontFamily:"'DM Sans',-apple-system,sans-serif",color:"#E8E0F0",position:"relative",overflow:"hidden",paddingBottom:"90px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&display=swap" rel="stylesheet"/>

      <div style={{position:"fixed",top:"-30%",right:"-20%",width:"70%",height:"70%",background:"radial-gradient(circle,rgba(167,139,250,0.07) 0%,transparent 65%)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",bottom:"-20%",left:"-15%",width:"60%",height:"60%",background:"radial-gradient(circle,rgba(56,189,248,0.05) 0%,transparent 65%)",pointerEvents:"none",zIndex:0}}/>

      <Confetti active={confetti}/>

      {overlay&&(
        <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.75)",backdropFilter:"blur(12px)",animation:"fadeIn 0.25s ease"}} onClick={()=>{setOverlay(null);setConfetti(false);}}>
          <div style={{textAlign:"center",animation:"popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275)",padding:"0 32px"}}>
            <div style={{fontSize:"80px",marginBottom:"16px",animation:"bounceIn 0.6s ease"}}>
              {overlay.type==="levelup"?"🏆":overlay.type==="goalclaim"?"🎁":"🎉"}
            </div>
            <div style={{fontFamily:"'Bricolage Grotesque'",fontSize:overlay.type==="goalclaim"?"22px":"26px",fontWeight:800,background:"linear-gradient(135deg,#FFD700,#FF6B6B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1.3}}>
              {overlay.type==="levelup"?"Новый уровень!":overlay.type==="goalclaim"?"Награда получена!":overlay.text}
            </div>
            {overlay.type==="levelup"&&<div style={{fontSize:"18px",color:"#E8E0F0",marginTop:"8px",fontWeight:600}}>{overlay.text}</div>}
            {overlay.type==="goalclaim"&&<div style={{fontSize:"20px",color:"#F472B6",marginTop:"12px",fontWeight:700}}>🎁 {overlay.text}</div>}
            {overlay.type==="alldone"&&<div style={{color:"#A78BFA",marginTop:"8px",fontSize:"14px",fontWeight:500}}>Все привычки выполнены!</div>}
            <div style={{color:"#6B5F83",marginTop:"20px",fontSize:"12px"}}>нажми чтобы закрыть</div>
          </div>
        </div>
      )}

      <div style={{maxWidth:"480px",margin:"0 auto",padding:"16px 16px 0",position:"relative",zIndex:1}}>

        {/* ═══ HOME ═══ */}
        {tab==="home"&&(
          <div style={{animation:"fadeIn 0.3s ease"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px",paddingTop:"8px"}}>
              <div>
                <h1 style={{fontFamily:"'Bricolage Grotesque'",fontSize:"26px",fontWeight:800,margin:0,background:"linear-gradient(135deg,#E8E0F0 30%,#A78BFA 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Привычки</h1>
                <div style={{fontSize:"13px",color:"#6B5F83",marginTop:"2px",fontWeight:500}}>{new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"})}</div>
              </div>
              <div onClick={useFreeze} style={{background:freezes>0?"rgba(56,189,248,0.1)":"rgba(255,255,255,0.04)",border:`1px solid ${freezes>0?"rgba(56,189,248,0.25)":"rgba(255,255,255,0.06)"}`,borderRadius:"12px",padding:"8px 12px",display:"flex",alignItems:"center",gap:"6px",cursor:freezes>0?"pointer":"default",fontSize:"13px"}}>
                <span>🛡️</span><span style={{fontWeight:700,color:freezes>0?"#38BDF8":"#3a3550"}}>{freezes}</span>
              </div>
            </div>

            {/* Hero card */}
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"24px",padding:"24px",marginBottom:"20px",display:"flex",alignItems:"center",gap:"20px"}}>
              <Ring value={habits.length>0?done.length/habits.length:0} size={96} stroke={7}>
                <div style={{fontSize:"28px",fontWeight:800,fontFamily:"'Bricolage Grotesque'",lineHeight:1}}>{habits.length>0?Math.round(done.length/habits.length*100):0}%</div>
                <div style={{fontSize:"10px",color:"#6B5F83",fontWeight:600}}>сегодня</div>
              </Ring>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px"}}>
                  <span style={{fontSize:"28px",filter:streak>0?"none":"grayscale(1)",animation:streak>=7?"pulse 1.5s ease infinite":"none"}}>🔥</span>
                  <div>
                    <div style={{fontFamily:"'Bricolage Grotesque'",fontSize:"24px",fontWeight:800,color:streak>0?"#FFD700":"#3a3550",lineHeight:1}}>{streak}</div>
                    <div style={{fontSize:"11px",color:"#6B5F83",fontWeight:600}}>{streak===0?"нет стрика":streak===1?"день":streak<5?"дня":"дней"}</div>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",color:"#6B5F83",marginBottom:"4px"}}>
                  <span style={{fontWeight:600}}>Ур. {level} · {LEVEL_NAMES[level]}</span><span>{xp} XP</span>
                </div>
                <div style={{height:"6px",background:"rgba(0,0,0,0.3)",borderRadius:"3px",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:"3px",background:"linear-gradient(90deg,#A78BFA,#FF6B6B,#FFD700)",width:`${progress*100}%`,transition:"width 0.6s cubic-bezier(0.34,1.56,0.64,1)",boxShadow:"0 0 10px rgba(167,139,250,0.4)"}}/>
                </div>
                {streak>1&&<div style={{marginTop:"6px",fontSize:"10px",color:"#34D399",fontWeight:600}}>⚡ Бонус +{STREAK_BONUS} XP</div>}
              </div>
            </div>

            {/* Weekly goal mini banner */}
            {goalActive&&(
              <div onClick={()=>setTab("goal")} style={{
                background:goalAchieved?"linear-gradient(135deg,rgba(52,211,153,0.1),rgba(251,191,36,0.06))":"linear-gradient(135deg,rgba(244,114,182,0.06),rgba(167,139,250,0.04))",
                border:`1px solid ${goalAchieved?"rgba(52,211,153,0.2)":"rgba(244,114,182,0.12)"}`,
                borderRadius:"16px",padding:"14px 16px",marginBottom:"20px",cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"space-between",
                animation:"slideIn 0.4s ease",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <span style={{fontSize:"20px"}}>🎁</span>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:700,color:goalAchieved?"#34D399":"#F472B6"}}>{weeklyGoal.reward}</div>
                    <div style={{fontSize:"11px",color:"#6B5F83",marginTop:"1px"}}>{weekXpVal}/{weeklyGoal.xpTarget} XP</div>
                  </div>
                </div>
                <div style={{width:"40px",height:"40px",borderRadius:"50%",
                  background:`conic-gradient(${goalAchieved?"#34D399":"#F472B6"} ${Math.min(100,weekXpVal/weeklyGoal.xpTarget*100)*3.6}deg, rgba(255,255,255,0.06) 0deg)`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                }}>
                  <div style={{width:"32px",height:"32px",borderRadius:"50%",background:"#161024",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:800,color:goalAchieved?"#34D399":"#F472B6"}}>
                    {Math.min(100,Math.round(weekXpVal/weeklyGoal.xpTarget*100))}%
                  </div>
                </div>
              </div>
            )}

            {/* Week calendar */}
            <div style={{display:"flex",gap:"4px",marginBottom:"22px",justifyContent:"space-between"}}>
              {days7.map(day=>{
                const dc=log[day]||[];const isT=day===t;
                const ratio=habits.length>0?dc.filter(x=>x!=="__freeze__").length/habits.length:0;
                const frozen=dc.includes("__freeze__");
                return(
                  <div key={day} style={{flex:1,textAlign:"center",padding:"8px 0",borderRadius:"14px",
                    background:isT?"rgba(167,139,250,0.1)":"rgba(255,255,255,0.02)",
                    border:isT?"1px solid rgba(167,139,250,0.2)":"1px solid transparent"}}>
                    <div style={{fontSize:"10px",color:"#6B5F83",fontWeight:600,marginBottom:"6px"}}>{dayLabel(day)}</div>
                    <div style={{width:"30px",height:"30px",borderRadius:"50%",margin:"0 auto",
                      background:frozen?"rgba(56,189,248,0.25)":ratio===1?"linear-gradient(135deg,#34D399,#4ECDC4)":ratio>0?`conic-gradient(#A78BFA ${ratio*360}deg, rgba(255,255,255,0.06) 0deg)`:"rgba(255,255,255,0.04)",
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:ratio===1?"13px":"11px",fontWeight:700,
                      boxShadow:ratio===1?"0 0 10px rgba(52,211,153,0.3)":"none",color:ratio>0||frozen?"#fff":"#3a3550",transition:"all 0.3s"}}>
                      {frozen?"🛡":ratio===1?"✓":day.split("-")[2]}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"12px",fontWeight:700,color:"#6B5F83",textTransform:"uppercase",letterSpacing:"1px"}}>Сегодня</div>
              <div style={{fontSize:"13px",fontWeight:700,color:allDone?"#34D399":"#A78BFA"}}>{done.length} из {habits.length}</div>
            </div>

            {/* Habits */}
            <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"16px"}}>
              {habits.map((h,i)=>{
                const d=done.includes(h.id);const isP=pressing===h.id;
                return(
                  <div key={h.id} onPointerDown={()=>setPressing(h.id)} onPointerUp={()=>{setPressing(null);toggle(h.id);}} onPointerLeave={()=>setPressing(null)}
                    style={{display:"flex",alignItems:"center",gap:"14px",padding:"14px 16px",
                      background:d?`linear-gradient(135deg,${h.color}15,${h.color}06)`:"rgba(255,255,255,0.025)",
                      border:`1.5px solid ${d?h.color+"35":"rgba(255,255,255,0.05)"}`,borderRadius:"18px",cursor:"pointer",
                      transition:"all 0.2s cubic-bezier(0.34,1.56,0.64,1)",transform:isP?"scale(0.97)":"scale(1)",
                      animation:`slideIn 0.35s ease ${i*0.04}s both`,userSelect:"none",WebkitTapHighlightColor:"transparent",
                      position:"relative",overflow:"hidden"}}>
                    {d&&<div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 30px 50%,${h.color}10,transparent 70%)`,pointerEvents:"none"}}/>}
                    <div style={{width:"44px",height:"44px",borderRadius:"14px",
                      background:d?h.color:"rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:d?"18px":"20px",flexShrink:0,transition:"all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                      boxShadow:d?`0 4px 16px ${h.color}35`:"none",color:d?"#fff":undefined,fontWeight:700}}>
                      {d?"✓":h.emoji}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"15px",fontWeight:600,color:d?"#E8E0F0":"#9B8FBD",transition:"color 0.2s",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</div>
                      <div style={{fontSize:"11px",color:d?h.color+"cc":"#4a4265",marginTop:"2px",fontWeight:500}}>+{XP_PER_HABIT+(streak>1?STREAK_BONUS:0)} XP</div>
                    </div>
                    <div onClick={e=>{e.stopPropagation();e.preventDefault();removeHabit(h.id);}} onPointerDown={e=>e.stopPropagation()}
                      style={{opacity:0.25,fontSize:"18px",padding:"6px 8px",cursor:"pointer",color:"#8B7FA8",transition:"opacity 0.2s",lineHeight:1}}
                      onMouseEnter={e=>e.target.style.opacity=0.7} onMouseLeave={e=>e.target.style.opacity=0.25}>×</div>
                  </div>
                );
              })}
            </div>

            {showAdd?(
              <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(167,139,250,0.15)",borderRadius:"20px",padding:"20px",animation:"slideIn 0.3s ease"}}>
                <div style={{fontSize:"14px",fontWeight:700,color:"#A78BFA",marginBottom:"14px"}}>Новая привычка</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"14px"}}>
                  {EMOJIS.map(e=>(
                    <div key={e} onClick={()=>setNewEmoji(e)} style={{width:"38px",height:"38px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"12px",cursor:"pointer",fontSize:"18px",
                      background:newEmoji===e?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.03)",border:newEmoji===e?"1.5px solid rgba(167,139,250,0.4)":"1.5px solid transparent",transition:"all 0.15s"}}>{e}</div>
                  ))}
                </div>
                <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addHabit()} placeholder="Название привычки..." autoFocus style={inp}
                  onFocus={e=>e.target.style.borderColor="rgba(167,139,250,0.4)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.08)"}/>
                <div style={{display:"flex",gap:"8px",marginTop:"14px"}}>
                  <button onClick={addHabit} style={{...btnP,flex:1}}>Добавить</button>
                  <button onClick={()=>{setShowAdd(false);setNewName("");}} style={{padding:"14px 20px",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"14px",background:"transparent",color:"#6B5F83",fontWeight:600,fontSize:"15px",cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
                </div>
              </div>
            ):(
              <button onClick={()=>setShowAdd(true)} style={{width:"100%",padding:"15px",border:"1.5px dashed rgba(167,139,250,0.2)",borderRadius:"18px",background:"transparent",color:"#A78BFA",fontWeight:600,fontSize:"14px",cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>+ Добавить привычку</button>
            )}

            {allDone&&freezes<3&&(
              <div onClick={()=>{haptic("success");setFreezes(p=>Math.min(3,p+1));}} style={{marginTop:"14px",padding:"14px",borderRadius:"16px",background:"rgba(56,189,248,0.06)",border:"1px solid rgba(56,189,248,0.15)",textAlign:"center",cursor:"pointer",fontSize:"13px",fontWeight:600,color:"#38BDF8",animation:"slideIn 0.4s ease"}}>🛡️ Получить заморозку стрика</div>
            )}
          </div>
        )}

        {/* ═══ STATS ═══ */}
        {tab==="stats"&&(
          <div style={{animation:"fadeIn 0.3s ease",paddingTop:"8px"}}>
            <h2 style={{fontFamily:"'Bricolage Grotesque'",fontSize:"24px",fontWeight:800,margin:"0 0 20px",background:"linear-gradient(135deg,#FFD700 30%,#FF6B6B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Статистика</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"20px"}}>
              {[{icon:"⚡",val:xp,label:"Всего XP",color:"#FFD700"},{icon:"🔥",val:streak,label:"Текущий стрик",color:"#FF6B6B"},{icon:"🏆",val:`Ур. ${level}`,label:LEVEL_NAMES[level],color:"#A78BFA"},{icon:"🛡️",val:freezes,label:"Заморозки",color:"#38BDF8"}].map((s,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"20px",padding:"20px",textAlign:"center",animation:`slideIn 0.3s ease ${i*0.05}s both`}}>
                  <div style={{fontSize:"28px",marginBottom:"8px"}}>{s.icon}</div>
                  <div style={{fontFamily:"'Bricolage Grotesque'",fontSize:"24px",fontWeight:800,color:s.color}}>{s.val}</div>
                  <div style={{fontSize:"11px",color:"#6B5F83",fontWeight:600,marginTop:"4px"}}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"20px",padding:"20px",marginBottom:"20px"}}>
              <div style={{fontSize:"12px",fontWeight:700,color:"#6B5F83",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"12px"}}>Прогресс уровня</div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",marginBottom:"6px"}}>
                <span style={{color:"#A78BFA",fontWeight:700}}>Ур. {level} — {LEVEL_NAMES[level]}</span>
                <span style={{color:"#6B5F83"}}>{level<LEVEL_THRESHOLDS.length-1?`${LEVEL_THRESHOLDS[level+1]-xp} XP до след.`:"MAX"}</span>
              </div>
              <div style={{height:"10px",background:"rgba(0,0,0,0.3)",borderRadius:"5px",overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:"5px",background:"linear-gradient(90deg,#A78BFA,#FF6B6B,#FFD700)",width:`${progress*100}%`,transition:"width 0.6s ease",boxShadow:"0 0 12px rgba(167,139,250,0.4)"}}/>
              </div>
            </div>

            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"20px",padding:"20px"}}>
              <div style={{fontSize:"12px",fontWeight:700,color:"#6B5F83",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"14px"}}>Эта неделя</div>
              <div style={{display:"flex",gap:"6px",alignItems:"flex-end",height:"100px"}}>
                {days7.map(day=>{
                  const dc=(log[day]||[]).filter(x=>x!=="__freeze__");
                  const ratio=habits.length>0?dc.length/habits.length:0;
                  return(
                    <div key={day} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"6px"}}>
                      <div style={{width:"100%",borderRadius:"8px",height:`${Math.max(8,ratio*80)}px`,
                        background:ratio===1?"linear-gradient(180deg,#34D399,#059669)":ratio>0?"linear-gradient(180deg,#A78BFA,#7C3AED)":"rgba(255,255,255,0.04)",
                        transition:"height 0.5s ease",
                        boxShadow:ratio===1?"0 2px 8px rgba(52,211,153,0.3)":ratio>0?"0 2px 8px rgba(167,139,250,0.2)":"none"}}/>
                      <div style={{fontSize:"10px",color:day===t?"#A78BFA":"#4a4265",fontWeight:day===t?700:500}}>{dayLabel(day)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ GOAL ═══ */}
        {tab==="goal"&&(
          <div style={{animation:"fadeIn 0.3s ease",paddingTop:"8px"}}>
            <h2 style={{fontFamily:"'Bricolage Grotesque'",fontSize:"24px",fontWeight:800,margin:"0 0 20px",background:"linear-gradient(135deg,#F472B6 30%,#A78BFA)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Цель недели</h2>

            {!goalActive&&!goalClaimed&&!editGoal&&(
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"24px",padding:"40px 24px",textAlign:"center",animation:"slideIn 0.4s ease"}}>
                <div style={{fontSize:"56px",marginBottom:"16px"}}>🎁</div>
                <div style={{fontSize:"18px",fontWeight:700,color:"#E8E0F0",marginBottom:"8px"}}>Поставь цель на неделю</div>
                <div style={{fontSize:"14px",color:"#6B5F83",lineHeight:1.5,marginBottom:"24px"}}>Выбери XP и напиши чем себя наградишь</div>
                <button onClick={()=>setEditGoal(true)} style={{...btnP,width:"100%",background:"linear-gradient(135deg,#F472B6,#A855F7)",boxShadow:"0 4px 20px rgba(244,114,182,0.3)"}}>Поставить цель 🎯</button>
              </div>
            )}

            {editGoal&&(
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(244,114,182,0.15)",borderRadius:"24px",padding:"24px",animation:"slideIn 0.3s ease"}}>
                <div style={{fontSize:"13px",fontWeight:700,color:"#F472B6",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.8px"}}>Новая цель</div>
                <div style={{marginBottom:"20px"}}>
                  <div style={{fontSize:"13px",color:"#9B8FBD",fontWeight:600,marginBottom:"10px"}}>XP на неделю</div>
                  <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                    {[100,200,300,500].map(v=>(
                      <div key={v} onClick={()=>setGoalXp(v)} style={{padding:"10px 18px",borderRadius:"14px",cursor:"pointer",
                        background:goalXp===v?"rgba(244,114,182,0.15)":"rgba(255,255,255,0.03)",
                        border:`1.5px solid ${goalXp===v?"rgba(244,114,182,0.4)":"rgba(255,255,255,0.06)"}`,
                        color:goalXp===v?"#F472B6":"#6B5F83",fontWeight:700,fontSize:"14px",transition:"all 0.15s"}}>{v} XP</div>
                    ))}
                  </div>
                  <div style={{fontSize:"11px",color:"#4a4265",marginTop:"8px"}}>≈ {Math.ceil(goalXp/(habits.length*XP_PER_HABIT))} дней по {habits.length} привычек</div>
                </div>
                <div style={{marginBottom:"20px"}}>
                  <div style={{fontSize:"13px",color:"#9B8FBD",fontWeight:600,marginBottom:"10px"}}>Чем наградишь себя?</div>
                  <input value={goalReward} onChange={e=>setGoalReward(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveGoal()} placeholder="Пицца, новая игра, выходной..." style={inp} autoFocus
                    onFocus={e=>e.target.style.borderColor="rgba(244,114,182,0.4)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.08)"}/>
                </div>
                <div style={{display:"flex",gap:"8px"}}>
                  <button onClick={saveGoal} style={{...btnP,flex:1,background:"linear-gradient(135deg,#F472B6,#A855F7)",boxShadow:"0 4px 20px rgba(244,114,182,0.3)",opacity:goalReward.trim()?1:0.4}}>Поставить цель</button>
                  <button onClick={()=>setEditGoal(false)} style={{padding:"14px 20px",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"14px",background:"transparent",color:"#6B5F83",fontWeight:600,fontSize:"15px",cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
                </div>
              </div>
            )}

            {(goalActive||goalClaimed)&&!editGoal&&(
              <div style={{animation:"slideIn 0.4s ease"}}>
                <div style={{background:goalAchieved||goalClaimed?"linear-gradient(135deg,rgba(52,211,153,0.08),rgba(251,191,36,0.05))":"linear-gradient(135deg,rgba(244,114,182,0.06),rgba(167,139,250,0.04))",border:`1px solid ${goalAchieved||goalClaimed?"rgba(52,211,153,0.2)":"rgba(244,114,182,0.12)"}`,borderRadius:"24px",padding:"28px",textAlign:"center"}}>
                  <div style={{fontSize:"52px",marginBottom:"12px"}}>{goalClaimed?"✅":goalAchieved?"🎉":"🎁"}</div>
                  <div style={{fontSize:"20px",fontWeight:700,color:"#E8E0F0",marginBottom:"6px"}}>{weeklyGoal.reward}</div>
                  {!goalClaimed&&(
                    <>
                      <div style={{fontSize:"13px",color:"#6B5F83",marginBottom:"16px"}}>{weekXpVal} из {weeklyGoal.xpTarget} XP</div>
                      <div style={{display:"flex",justifyContent:"center",marginBottom:"20px"}}>
                        <Ring value={weekXpVal/weeklyGoal.xpTarget} size={140} stroke={10}>
                          <div style={{fontFamily:"'Bricolage Grotesque'",fontSize:"32px",fontWeight:800,color:goalAchieved?"#34D399":"#F472B6"}}>{Math.min(100,Math.round(weekXpVal/weeklyGoal.xpTarget*100))}%</div>
                          <div style={{fontSize:"11px",color:"#6B5F83",fontWeight:600}}>выполнено</div>
                        </Ring>
                      </div>
                      {goalAchieved&&<button onClick={claimReward} style={{...btnP,width:"100%",background:"linear-gradient(135deg,#34D399,#059669)",boxShadow:"0 4px 20px rgba(52,211,153,0.4)",fontSize:"16px",padding:"16px",animation:"pulse 2s ease infinite"}}>Забрать награду! 🎉</button>}
                    </>
                  )}
                  {goalClaimed&&<div style={{fontSize:"14px",color:"#34D399",fontWeight:600,marginTop:"4px"}}>Цель достигнута! 🏆</div>}
                </div>
                <button onClick={()=>setEditGoal(true)} style={{width:"100%",marginTop:"14px",padding:"14px",border:"1.5px dashed rgba(244,114,182,0.2)",borderRadius:"18px",background:"transparent",color:"#F472B6",fontWeight:600,fontSize:"14px",cursor:"pointer",fontFamily:"inherit"}}>{goalClaimed?"Поставить новую цель":"Изменить цель"}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Tab Bar ═══ */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(15,10,26,0.92)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"center",zIndex:50,paddingBottom:"env(safe-area-inset-bottom, 8px)"}}>
        <div style={{display:"flex",maxWidth:"480px",width:"100%"}}>
          {[{id:"home",label:"Главная",I:HomeIcon},{id:"stats",label:"Стата",I:TrophyIcon},{id:"goal",label:"Награда",I:GiftIcon}].map(x=>(
            <div key={x.id} onClick={()=>{haptic("light");setTab(x.id);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 0 8px",cursor:"pointer",gap:"4px",transition:"all 0.2s"}}>
              <x.I a={tab===x.id}/>
              <span style={{fontSize:"10px",fontWeight:tab===x.id?700:500,color:tab===x.id?(x.id==="goal"?"#F472B6":x.id==="stats"?"#FFD700":"#A78BFA"):"#4a4265",transition:"color 0.2s"}}>{x.label}</span>
              {tab===x.id&&<div style={{width:"4px",height:"4px",borderRadius:"50%",background:x.id==="goal"?"#F472B6":x.id==="stats"?"#FFD700":"#A78BFA",marginTop:"2px"}}/>}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes popIn{from{transform:scale(0.5);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes slideIn{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes bounceIn{0%{transform:scale(0.3);opacity:0}50%{transform:scale(1.15)}70%{transform:scale(0.95)}100%{transform:scale(1);opacity:1}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes confettiFall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        input::placeholder{color:#4a4265}
      `}</style>
    </div>
  );
}
