"use client";

import { useRef, useState, useCallback, ChangeEvent } from "react";
import allData from "@/data.json";
import type { Artifact } from "@/lib/types";

const CATS: Record<string, { label: string; color: string; soft: string }> = {
  infographic:  { label:"Infographic",   color:"var(--terracotta)", soft:"var(--terracotta-soft)" },
  text_reveal:  { label:"Text Reveal",   color:"var(--teal)",       soft:"var(--teal-soft)" },
  split_screen: { label:"Split Screen",  color:"var(--terracotta)", soft:"var(--terracotta-soft)" },
  composite:    { label:"Composite",     color:"var(--teal)",       soft:"var(--teal-soft)" },
  screenshot:   { label:"Screenshot",    color:"var(--terracotta)", soft:"var(--terracotta-soft)" },
  stat_card:    { label:"Stat Card",     color:"var(--teal)",       soft:"var(--teal-soft)" },
  other:        { label:"Other",         color:"var(--muted)",      soft:"var(--cream)" },
};

const tc = (s: number) => {
  const m=Math.floor(s/60), sec=Math.floor(s%60), f=Math.floor((s%1)*24);
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}:${String(f).padStart(2,"0")}`;
};

const D = { fontFamily:"var(--font-display)" } as const;
const B = { fontFamily:"var(--font-body)" } as const;

type Mode="home"|"video"|"text";
type Status="idle"|"extracting"|"analyzing"|"done";

async function extractFrames(file:File,count=8):Promise<string[]>{
  return new Promise(resolve=>{
    const v=document.createElement("video");
    v.src=URL.createObjectURL(file);v.muted=true;
    v.onloadedmetadata=()=>{
      const step=v.duration/(count+1);
      const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d")!;
      const frames:string[]=[]; let n=0;
      v.onseeked=()=>{
        canvas.width=320;canvas.height=Math.round(320*v.videoHeight/v.videoWidth);
        ctx.drawImage(v,0,0,canvas.width,canvas.height);
        frames.push(canvas.toDataURL("image/jpeg",0.7).split(",")[1]);
        n++;if(n<count)v.currentTime=step*(n+1);else{URL.revokeObjectURL(v.src);resolve(frames);}
      };v.currentTime=step;
    };v.onerror=()=>resolve([]);
  });
}

export default function Page(){
  const [mode,   setMode]   = useState<Mode>("home");
  const [status, setStatus] = useState<Status>("idle");
  const [analysis,setAnal]  = useState<Record<string,string>|null>(null);
  const [ranked, setRanked] = useState<number[]|null>(null);
  const [query,  setQuery]  = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  const [sel,    setSel]    = useState<Set<number>>(new Set());
  const [genOpen,setGenOpen]= useState(false);
  const [prompt, setPrompt] = useState("");
  const [genMode,setGenMode]= useState<"image"|"video">("image");
  const [genRes, setGenRes] = useState<string|null>(null);
  const [gening, setGening] = useState(false);
  const [drag,   setDrag]   = useState(false);
  const [userMedia,setUserMedia] = useState<{file:File;url:string;type:"image"|"video"}|null>(null);
  const fileRef  = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const arts = allData as Artifact[];

  const displayList = (() => {
    const base = ranked ? ranked.map(i=>({a:arts[i],i})) : arts.map((a,i)=>({a,i}));
    return filter==="ALL" ? base : base.filter(({a})=>a.type===filter);
  })();

  const processVideo = useCallback(async(file:File)=>{
    setStatus("extracting");setSel(new Set());setAnal(null);
    setRanked(null);setGenOpen(false);setGenRes(null);
    const frames=await extractFrames(file,8);setStatus("analyzing");
    try{
      const r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({frames,filename:file.name})});
      const d=await r.json();setAnal(d.analysis);setRanked(d.results.map((x:{index:number})=>x.index));
    }catch{setRanked(arts.map((_,i)=>i));}
    setStatus("done");
  },[arts]);

  const onDrop=useCallback((e:React.DragEvent)=>{
    e.preventDefault();setDrag(false);
    const f=e.dataTransfer.files[0];if(f?.type.startsWith("video/"))processVideo(f);
  },[processVideo]);

  const doSearch=async(q:string)=>{
    if(!q.trim())return;setStatus("analyzing");
    try{const r=await fetch("/api/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q})});const d=await r.json();setRanked(d.results);}catch{setRanked(null);}
    setStatus("done");
  };

  const toggle=(i:number)=>setSel(prev=>{
    const n=new Set(prev);if(n.has(i))n.delete(i);else if(n.size<3)n.add(i);return n;
  });

  const generate=async()=>{
    if(!prompt.trim()||!sel.size)return;setGening(true);setGenRes(null);
    try{const r=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({selectedArtifacts:Array.from(sel).map(i=>arts[i]),prompt,mode:genMode})});const d=await r.json();setGenRes(d.message);}catch{setGenRes("Error connecting to generation API.");}
    setGening(false);
  };

  const onMediaPick=(e:ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];if(!f)return;
    if(userMedia?.url)URL.revokeObjectURL(userMedia.url);
    setUserMedia({file:f,url:URL.createObjectURL(f),type:f.type.startsWith("video")?"video":"image"});
  };

  const reset=()=>{
    setMode("home");setStatus("idle");setAnal(null);setRanked(null);setSel(new Set());
    setGenOpen(false);setGenRes(null);setQuery("");setFilter("ALL");
    if(userMedia?.url)URL.revokeObjectURL(userMedia.url);setUserMedia(null);
  };

  /* ── HOME ── */
  if(mode==="home") return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--cream)"}}>
      {/* header */}
      <header style={{borderBottom:"3px solid var(--ink)"}}>
        <div className="mx-auto flex items-center justify-between px-4 sm:px-8 py-3 max-w-screen-2xl">
          <div className="flex items-center gap-3">
            <div style={{width:40,height:40,borderRadius:10,border:"3px solid var(--ink)",background:"var(--terracotta)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"var(--shadow-sm)",flexShrink:0,...D,fontWeight:800,fontSize:17,color:"var(--cream)"}}>M</div>
            <span style={{...D,fontWeight:800,fontSize:18,letterSpacing:"-0.02em"}}>MGFX</span>
          </div>
          <div className="flex items-center gap-2" style={{background:"var(--paper)",border:"3px solid var(--ink)",borderRadius:9999,padding:"5px 14px",boxShadow:"var(--shadow-sm)",flexShrink:0}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:"var(--teal)",display:"inline-block",flexShrink:0}}/>
            <span style={{...D,fontWeight:600,fontSize:12,whiteSpace:"nowrap"}}>97 artifacts</span>
          </div>
        </div>
      </header>

      {/* hero */}
      <main className="flex-1 flex flex-col items-center px-4 sm:px-8" style={{justifyContent:"space-evenly",paddingTop:"clamp(16px,3vh,40px)",paddingBottom:"clamp(16px,3vh,40px)"}}>
        {/* subtitle */}
        <div style={{background:"var(--teal)",border:"3px solid var(--ink)",borderRadius:9999,padding:"6px 18px",boxShadow:"var(--shadow-sm)",color:"var(--cream)",...D,fontWeight:700,fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",textAlign:"center",flexShrink:0}}>
          Reference Library · Semantic Search · AI Generation
        </div>

        {/* title */}
        <h1 className="flex flex-wrap items-center justify-center text-center w-full" style={{gap:"clamp(6px,1vw,16px)",maxWidth:"min(1100px,100%)",...D,fontWeight:800,lineHeight:0.92,letterSpacing:"-0.02em",flexShrink:0}}>
          <span style={{fontSize:"clamp(40px,min(7vw,9vh),108px)",color:"var(--ink)"}}>Motion</span>
          <span style={{fontSize:"clamp(40px,min(7vw,9vh),108px)",color:"var(--cream)",background:"var(--terracotta)",border:"3px solid var(--ink)",borderRadius:14,padding:"3px clamp(10px,1.5vw,24px)",transform:"rotate(-2deg)",display:"inline-block",boxShadow:"var(--shadow-lg)"}}>
            Graphic
          </span>
          <span style={{fontSize:"clamp(40px,min(7vw,9vh),108px)",color:"var(--ink)"}}>Finder</span>
        </h1>

        {/* input cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full" style={{maxWidth:"min(960px,100%)",flex:"0 0 auto"}}>
          <button onClick={()=>setMode("video")} className="card text-left cursor-pointer flex flex-col"
            style={{gap:10,padding:"clamp(14px,2.5vw,24px)",border:"3px solid var(--ink)",borderRadius:"var(--r-xl)"}}>
            <span style={{...D,fontSize:10,fontWeight:700,color:"var(--terracotta)",textTransform:"uppercase",letterSpacing:"0.1em"}}>① Input — Video</span>
            <span style={{...D,fontSize:"clamp(20px,2.5vw,28px)",fontWeight:800,letterSpacing:"-0.02em",lineHeight:1}}>Drop Video</span>
            <span style={{...B,fontSize:12,color:"var(--muted)",lineHeight:1.55}}>Upload a clip. We analyze its visual style and surface matching motion graphics.</span>
            <div style={{...D,fontWeight:700,fontSize:11,color:"var(--cream)",background:"var(--terracotta)",border:"3px solid var(--ink)",borderRadius:"var(--r-md)",padding:"8px 16px",display:"inline-flex",alignItems:"center",boxShadow:"var(--shadow-sm)",textTransform:"uppercase",letterSpacing:"0.06em",alignSelf:"flex-start"}}>
              Auto-match style →
            </div>
          </button>

          <div className="card flex flex-col" style={{gap:10,padding:"clamp(14px,2.5vw,24px)",border:"3px solid var(--ink)",borderRadius:"var(--r-xl)"}}>
            <span style={{...D,fontSize:10,fontWeight:700,color:"var(--teal)",textTransform:"uppercase",letterSpacing:"0.1em"}}>② Input — Text</span>
            <span style={{...D,fontSize:"clamp(20px,2.5vw,28px)",fontWeight:800,letterSpacing:"-0.02em",lineHeight:1}}>Search Library</span>
            <span style={{...B,fontSize:12,color:"var(--muted)",lineHeight:1.55}}>Describe a style, topic, or aesthetic. Browse semantically matched artifacts.</span>
            <div className="inp-wrap" style={{marginTop:2}}>
              <svg width="14" height="14" fill="none" stroke="var(--muted)" strokeWidth="2.5" viewBox="0 0 24 24" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input className="inp" style={{background:"var(--cream)",fontSize:12}} value={query} onChange={e=>setQuery(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"){setMode("text");doSearch(query);}}}
                placeholder="retro bold text / warm minimal…"/>
              <button className="btn btn-dark" onClick={()=>{setMode("text");doSearch(query);}} style={{fontSize:10,padding:"6px 12px",borderRadius:8,flexShrink:0}}>Search</button>
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="flex flex-wrap items-center justify-center gap-2" style={{flex:"0 0 auto"}}>
          {[["25","Infographic",0],["20","Screenshot",1],["14","Composite",0],["13","Split Screen",1],["7","Text Reveal",0]].map(([n,l,alt],i)=>(
            <div key={String(l)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,background:"var(--paper)",border:"3px solid var(--ink)",borderRadius:"var(--r-lg)",padding:"10px clamp(12px,1.5vw,20px)",boxShadow:"var(--shadow-sm)",...D}}>
              <span style={{fontSize:"clamp(20px,2.5vw,28px)",fontWeight:800,color:Number(alt)||i%2?"var(--teal)":"var(--terracotta)"}}>{n}</span>
              <span style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--muted)"}}>{l}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );

  /* ── RESULTS ── */
  const loading=status==="extracting"||status==="analyzing";
  const catKeys=["ALL",...Object.keys(CATS)];

  return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--cream)"}}>

      {/* HEADER */}
      <header style={{background:"var(--ink)",color:"var(--cream)",borderBottom:"3px solid var(--ink)",position:"sticky",top:0,zIndex:20}}>
        <div className="mx-auto flex items-center gap-3 px-3 sm:px-5 py-2.5 max-w-screen-2xl">
          <button className="btn shrink-0" onClick={reset}
            style={{fontSize:10,padding:"5px 11px",background:"var(--cream)",color:"var(--ink)",borderRadius:"var(--r-md)"}}>
            ← Back
          </button>
          <span style={{...D,fontWeight:800,fontSize:17,letterSpacing:"-0.02em",flexShrink:0}}>MGFX</span>

          {mode==="text"&&(
            <form onSubmit={e=>{e.preventDefault();doSearch(query);}} className="flex-1 hidden sm:block" style={{maxWidth:560}}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--cream)",border:"3px solid var(--cream)",borderRadius:"var(--r-md)",padding:"6px 8px 6px 12px"}}>
                <svg width="14" height="14" fill="none" stroke="var(--muted)" strokeWidth="2.5" viewBox="0 0 24 24" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input style={{...B,flex:1,background:"transparent",border:"none",outline:"none",color:"var(--ink)",fontSize:13,fontWeight:500,minWidth:0}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="retro bold text / dark split screen…" autoFocus/>
                {query&&<button type="button" onClick={()=>setQuery("")} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",lineHeight:1,flexShrink:0}}>✕</button>}
              </div>
            </form>
          )}
          {mode==="video"&&status==="done"&&analysis&&(
            <span className="hidden md:block truncate" style={{...B,fontSize:11,color:"rgba(255,255,255,0.5)",flex:1}}>{analysis.visual_style}</span>
          )}

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {sel.size>0&&(
              <button className="btn btn-primary" onClick={()=>setGenOpen(true)} style={{fontSize:10,padding:"7px 14px",whiteSpace:"nowrap"}}>
                Generate ({sel.size})
              </button>
            )}
            <span style={{...D,fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.4)",whiteSpace:"nowrap"}}>{displayList.length} clips</span>
          </div>
        </div>
      </header>

      {/* SUBBAR */}
      <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-5 pt-4 pb-2 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h2 style={{...D,fontSize:"clamp(16px,2.5vw,20px)",fontWeight:800,letterSpacing:"-0.02em",textTransform:"uppercase"}}>
              {ranked?"Matched Results":"All Artifacts"}
            </h2>
            <span style={{...B,fontSize:12,color:"var(--muted)",fontWeight:600}}>{displayList.length} clips</span>
          </div>
          <span className="hidden sm:block" style={{...D,fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Select up to 3 → Generate</span>
        </div>
        {/* filter chips — horizontal scroll on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:"none"}}>
          {catKeys.map(cat=>(
            <button key={cat} className={`chip${filter===cat?" active":""}`} onClick={()=>setFilter(cat)} style={{flexShrink:0}}>
              {cat==="ALL"?"All":CATS[cat]?.label||cat}
            </button>
          ))}
        </div>
      </div>

      {/* DROP ZONE */}
      {mode==="video"&&status==="idle"&&(
        <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-5 pb-4">
          <div className={`dz${drag?" dz-on":""} flex flex-col items-center justify-center text-center`}
            onDrop={onDrop} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
            onClick={()=>fileRef.current?.click()}
            style={{padding:"clamp(32px,6vw,72px) 32px"}}>
            <div style={{...D,fontSize:"clamp(28px,4vw,52px)",fontWeight:800,color:drag?"var(--terracotta)":"#ccc",transition:"color 0.1s",letterSpacing:"-0.02em",lineHeight:1}}>
              Drop your video here
            </div>
            <div style={{...B,marginTop:8,fontSize:11,color:"var(--muted)",letterSpacing:"0.1em",textTransform:"uppercase"}}>
              or click to browse — mp4 mov avi webm
            </div>
            <input ref={fileRef} type="file" accept="video/*" onChange={e=>{const f=e.target.files?.[0];if(f)processVideo(f);}} style={{display:"none"}}/>
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading&&(
        <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-5 pb-4">
          <div className="shimmer flex items-center justify-center text-center" style={{padding:"clamp(32px,6vw,52px)",border:"3px solid var(--ink)",borderRadius:"var(--r-xl)"}}>
            <div style={{...D,fontSize:"clamp(24px,3vw,36px)",fontWeight:800,color:"var(--muted)",letterSpacing:"-0.02em"}}>
              {status==="extracting"?"Extracting frames":"Analysing with Gemini"}<span className="blink">…</span>
            </div>
          </div>
        </div>
      )}

      {/* GRID */}
      <main className="flex-1 mx-auto w-full max-w-screen-2xl px-3 sm:px-5 pb-32">
        {!loading&&displayList.length===0&&(
          <div className="flex flex-col items-center justify-center gap-4 text-center py-20">
            <div style={{width:56,height:56,borderRadius:"var(--r-lg)",border:"3px solid var(--ink)",background:"var(--paper)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"var(--shadow-md)"}}>
              <svg width="24" height="24" fill="none" stroke="var(--terracotta)" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <div>
              <p style={{...D,fontSize:17,fontWeight:800}}>No artifacts match</p>
              <p style={{...B,fontSize:13,color:"var(--muted)",marginTop:4}}>Try a different term or clear the filters.</p>
            </div>
            <button className="btn btn-ghost" onClick={()=>{setQuery("");setFilter("ALL");}}>Reset filters</button>
          </div>
        )}

        {!loading&&displayList.length>0&&(
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {displayList.map(({a:mg,i:idx})=>{
              const isSel=sel.has(idx),maxed=sel.size>=3&&!isSel;
              const cat=CATS[mg.type]||CATS.other;
              const selN=Array.from(sel).indexOf(idx);
              return (
                <div key={idx}
                  className={`card${isSel?" sel":""}${maxed?" dim":""} fu`}
                  role="button" tabIndex={0}
                  onClick={()=>!maxed&&toggle(idx)}
                  onKeyDown={e=>{if((e.key==="Enter"||e.key===" ")&&!maxed){e.preventDefault();toggle(idx);}}}
                  style={{cursor:maxed?"not-allowed":"pointer",position:"relative",
                    animationDelay:`${(idx%12)*0.025}s`,overflow:"hidden",display:"flex",flexDirection:"column",
                    borderRadius:"var(--r-lg)",background:"var(--paper)"}}>

                  {isSel&&(
                    <div style={{position:"absolute",top:8,right:8,zIndex:5,width:28,height:28,
                      borderRadius:"50%",border:"3px solid var(--ink)",background:"var(--terracotta)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      boxShadow:"var(--shadow-sm)",color:"var(--cream)",...D,fontWeight:800,fontSize:12}}>
                      {selN+1}
                    </div>
                  )}

                  {/* header */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,
                    padding:"5px 10px",borderBottom:"3px solid var(--ink)"}}>
                    <span style={{...D,fontSize:9,fontWeight:700,letterSpacing:"0.07em",
                      textTransform:"uppercase",color:"var(--cream)",background:cat.color,
                      border:"2px solid var(--ink)",borderRadius:9999,padding:"1px 8px",flexShrink:0}}>
                      {cat.label}
                    </span>
                    <span style={{...D,fontSize:9,fontWeight:700,color:"var(--muted)",flexShrink:0}}>{tc(mg.start_time)}</span>
                  </div>

                  {/* dual pane */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 3px 1fr",height:180}}>
                    <div style={{position:"relative",background:"var(--cream)",overflow:"hidden"}}>
                      <div style={{position:"absolute",top:5,left:6,zIndex:3,background:"rgba(244,236,224,0.88)",padding:"1px 5px",borderRadius:3,...D,fontSize:7,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--muted)"}}>Motion</div>
                      {mg.gif_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ?<img src={mg.gif_url} alt="motion" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top",display:"block"}}/>
                        :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"#ccc",fontSize:20}}>▶</div>}
                    </div>
                    <div style={{background:"var(--ink)"}}/>
                    <div style={{position:"relative",background:cat.soft,overflow:"hidden"}}>
                      <div style={{position:"absolute",top:5,left:6,zIndex:3,background:`rgba(${cat.soft==="var(--terracotta-soft)"?"231,200,187":"197,216,209"},0.88)`,padding:"1px 5px",borderRadius:3,...D,fontSize:7,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--muted)"}}>Complete</div>
                      {mg.frame_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ?<img src={mg.frame_url} alt="complete" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top",display:"block"}}/>
                        :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"#ccc",fontSize:20}}>✓</div>}
                    </div>
                  </div>

                  {/* info */}
                  <div style={{padding:"7px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                    <p style={{...B,fontSize:10,color:"var(--muted)",lineHeight:1.3,margin:0,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,fontStyle:"italic"}}>
                      {mg.visual_style||mg.description}
                    </p>
                    <span style={{...D,fontSize:11,fontWeight:700,color:cat.color,flexShrink:0}}>
                      ★{mg.quality_score}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {mode==="text"&&!ranked&&!query&&status!=="analyzing"&&(
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div style={{...D,fontSize:"clamp(28px,4vw,40px)",fontWeight:800,color:"#ccc",letterSpacing:"-0.02em"}}>Awaiting query</div>
            <div style={{...B,fontSize:12,color:"var(--muted)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Type above and press enter</div>
          </div>
        )}
      </main>

      {/* FLOATING BAR */}
      {sel.size>0&&!genOpen&&(
        <div className="gen-bar" style={{position:"fixed",bottom:20,left:"50%",zIndex:30,transform:"translateX(-50%)"}}>
          <div className="flex items-center gap-3" style={{background:"var(--ink)",border:"3px solid var(--ink)",borderRadius:"var(--r-lg)",padding:"8px 8px 8px 14px",boxShadow:"var(--shadow-lg)",whiteSpace:"nowrap"}}>
            <div className="flex gap-1.5 items-center">
              {Array.from(sel).map(i=>{
                const mg=arts[i];const cat=CATS[mg.type]||CATS.other;
                return (
                  <div key={i} style={{width:36,height:36,border:"2px solid rgba(255,255,255,0.25)",borderRadius:7,overflow:"hidden",flexShrink:0,background:cat.soft}}>
                    {mg.frame_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ?<img src={mg.frame_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      :<div style={{width:"100%",height:"100%",background:cat.soft}}/>}
                  </div>
                );
              })}
              {[...Array(3-sel.size)].map((_,i)=>(
                <div key={`e${i}`} style={{width:36,height:36,border:"2px dashed rgba(255,255,255,0.15)",borderRadius:7,flexShrink:0}}/>
              ))}
            </div>
            <div style={{width:1,height:24,background:"rgba(255,255,255,0.15)"}}/>
            <div className="flex flex-col">
              <span style={{...D,fontWeight:800,fontSize:12,color:"var(--cream)",lineHeight:1}}>{sel.size} of 3 selected</span>
              <span style={{...B,fontSize:10,color:"rgba(255,255,255,0.4)",lineHeight:1.4}}>{sel.size===3?"Max reached":"Select up to 3"}</span>
            </div>
            <button onClick={()=>setSel(new Set())}
              style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:16,padding:"2px 4px",lineHeight:1,...D,transition:"color 0.1s"}}
              onMouseEnter={e=>(e.currentTarget.style.color="rgba(255,255,255,0.7)")}
              onMouseLeave={e=>(e.currentTarget.style.color="rgba(255,255,255,0.3)")}>
              &#x2715;
            </button>
            <button className="btn btn-primary shrink-0" onClick={()=>setGenOpen(true)}
              style={{fontSize:11,padding:"10px 18px",borderRadius:"var(--r-md)"}}>
              Generate
            </button>
          </div>
        </div>
      )}

      {/* GENERATE MODAL */}
      {genOpen&&(
        <div className="modal-backdrop"
          style={{position:"fixed",inset:0,zIndex:40,background:"rgba(31,27,23,0.55)",
            backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",
            padding:"clamp(12px,3vw,32px)"}}
          onClick={e=>{if(e.target===e.currentTarget)setGenOpen(false);}}>

          <div className="modal-panel" style={{width:"100%",maxWidth:"min(820px,95vw)",background:"var(--paper)",
            border:"3px solid var(--ink)",borderRadius:"var(--r-xl)",boxShadow:"var(--shadow-lg)",
            overflow:"hidden",display:"flex",flexDirection:"column",maxHeight:"calc(100dvh - clamp(24px,6vw,64px))"}}>

            {/* Header */}
            <div className="flex items-center justify-between shrink-0"
              style={{padding:"14px 20px",borderBottom:"3px solid var(--ink)",background:"var(--cream)"}}>
              <div>
                <h2 style={{...D,fontSize:"clamp(16px,2.5vw,20px)",fontWeight:800,letterSpacing:"-0.02em",color:"var(--ink)",margin:0,lineHeight:1}}>
                  Generate Motion Graphic
                </h2>
                <p style={{...B,fontSize:11,color:"var(--muted)",marginTop:3,margin:0}}>
                  {sel.size} style reference{sel.size>1?"s":""} · Gemini Imagen / Veo 2
                </p>
              </div>
              <button onClick={()=>setGenOpen(false)}
                style={{width:32,height:32,borderRadius:"50%",border:"2.5px solid var(--ink)",
                  background:"var(--paper)",cursor:"pointer",display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:14,color:"var(--ink)",flexShrink:0,
                  boxShadow:"var(--shadow-sm)",transition:"background 0.12s, color 0.12s",...D,fontWeight:700}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="var(--ink)";(e.currentTarget as HTMLElement).style.color="var(--cream)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="var(--paper)";(e.currentTarget as HTMLElement).style.color="var(--ink)";}}>
                &#x2715;
              </button>
            </div>

            {/* Body */}
            <div className="grid grid-cols-1 md:grid-cols-2 overflow-y-auto" style={{flex:1}}>

              {/* LEFT — references */}
              <div className="flex flex-col gap-3" style={{padding:"18px 20px",borderRight:"3px solid var(--ink)"}}>
                <p style={{...D,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.14em",color:"var(--muted)",margin:0}}>Style References</p>
                <div className="flex flex-col gap-2">
                  {Array.from(sel).map(i=>{
                    const mg=arts[i];const cat=CATS[mg.type]||CATS.other;
                    return (
                      <div key={i} className="flex items-center gap-3"
                        style={{padding:"8px 10px",border:"2px solid var(--ink)",borderRadius:"var(--r-md)",background:"var(--cream)"}}>
                        <div style={{width:44,height:44,borderRadius:7,overflow:"hidden",border:"2px solid var(--ink)",flexShrink:0,background:cat.soft}}>
                          {mg.frame_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ?<img src={mg.frame_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                            :<div style={{width:"100%",height:"100%",background:cat.soft}}/>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span style={{...D,fontSize:9,fontWeight:700,color:"var(--cream)",background:cat.color,borderRadius:9999,padding:"1px 7px",border:"1.5px solid var(--ink)",display:"inline-block",marginBottom:3}}>
                            {cat.label}
                          </span>
                          <p style={{...B,fontSize:11,color:"var(--muted)",margin:0,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {mg.visual_style||mg.description}
                          </p>
                        </div>
                        <button onClick={()=>toggle(i)}
                          style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:14,padding:"2px",lineHeight:1,flexShrink:0,transition:"color 0.1s",...D}}
                          onMouseEnter={e=>(e.currentTarget.style.color="var(--terracotta)")}
                          onMouseLeave={e=>(e.currentTarget.style.color="var(--muted)")}>
                          &#x2715;
                        </button>
                      </div>
                    );
                  })}
                  {sel.size<3&&(
                    <button onClick={()=>setGenOpen(false)}
                      className="flex items-center gap-2"
                      style={{padding:"9px 12px",border:"2px dashed #ccc",borderRadius:"var(--r-md)",background:"transparent",cursor:"pointer",color:"var(--muted)",transition:"all 0.1s"}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="var(--terracotta)";(e.currentTarget as HTMLElement).style.color="var(--terracotta)";}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="#ccc";(e.currentTarget as HTMLElement).style.color="var(--muted)";}}>
                      <span style={{...D,fontSize:15,fontWeight:800,lineHeight:1}}>+</span>
                      <span style={{...D,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Add style reference</span>
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT */}
              <div className="flex flex-col gap-4" style={{padding:"18px 20px"}}>

                {/* Media upload */}
                <div>
                  <p style={{...D,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.14em",color:"var(--muted)",marginBottom:7}}>
                    Your Media <span style={{...B,fontSize:10,fontWeight:400,textTransform:"none",letterSpacing:0,opacity:0.7}}>(optional)</span>
                  </p>
                  {userMedia?(
                    <div style={{border:"2.5px solid var(--ink)",borderRadius:"var(--r-md)",overflow:"hidden",position:"relative"}}>
                      {userMedia.type==="image"
                        // eslint-disable-next-line @next/next/no-img-element
                        ?<img src={userMedia.url} alt="" style={{width:"100%",maxHeight:120,objectFit:"cover",display:"block"}}/>
                        :<video src={userMedia.url} style={{width:"100%",maxHeight:120,display:"block"}} autoPlay muted loop playsInline/>}
                      <button onClick={()=>{URL.revokeObjectURL(userMedia.url);setUserMedia(null);}}
                        style={{position:"absolute",top:6,right:6,width:24,height:24,borderRadius:"50%",border:"2px solid var(--ink)",background:"var(--paper)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"var(--ink)",...D,fontWeight:700}}>
                        &#x2715;
                      </button>
                      <div style={{padding:"5px 10px",borderTop:"2px solid var(--ink)",background:"var(--cream)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <span style={{...B,fontSize:10,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{userMedia.file.name}</span>
                        <button onClick={()=>mediaRef.current?.click()} style={{...D,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--terracotta)",background:"none",border:"none",cursor:"pointer",flexShrink:0,marginLeft:8}}>Change</button>
                      </div>
                    </div>
                  ):(
                    <button onClick={()=>mediaRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2"
                      style={{padding:"16px",border:"2.5px dashed #bbb",borderRadius:"var(--r-md)",background:"transparent",cursor:"pointer",transition:"all 0.12s"}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="var(--terracotta)";(e.currentTarget as HTMLElement).style.background="var(--terracotta-soft)";}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="#bbb";(e.currentTarget as HTMLElement).style.background="transparent";}}>
                      <svg width="20" height="20" fill="none" stroke="var(--muted)" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span style={{...D,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--muted)"}}>Upload image or video</span>
                    </button>
                  )}
                  <input ref={mediaRef} type="file" accept="image/*,video/*" onChange={onMediaPick} style={{display:"none"}}/>
                </div>

                {/* Output type */}
                <div>
                  <p style={{...D,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.14em",color:"var(--muted)",marginBottom:7}}>Output Type</p>
                  <div className="seg-ctrl">
                    <button className={`seg-btn${genMode==="image"?" seg-active":""}`} onClick={()=>setGenMode("image")}>Image</button>
                    <button className={`seg-btn${genMode==="video"?" seg-active":""}`} onClick={()=>setGenMode("video")}>Video</button>
                  </div>
                </div>

                {/* Prompt */}
                <div className="flex flex-col flex-1" style={{minHeight:0}}>
                  <p style={{...D,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.14em",color:"var(--muted)",marginBottom:7}}>Prompt</p>
                  <textarea className="ta flex-1" rows={4}
                    value={prompt} onChange={e=>setPrompt(e.target.value)}
                    placeholder={"Describe what to create or how to transform your media.\n\nE.g. Apply bold typography and terracotta palette from the references."}
                  />
                </div>

                {/* Generate */}
                <button className="btn btn-primary w-full justify-center" onClick={generate}
                  disabled={!prompt.trim()||gening}
                  style={{fontSize:13,padding:"13px",borderRadius:"var(--r-md)",letterSpacing:"0.06em",boxShadow:"var(--shadow-md)"}}>
                  {gening?(
                    <span className="flex items-center gap-2">
                      <span style={{width:13,height:13,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"var(--cream)",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite"}}/>
                      Generating...
                    </span>
                  ):"Generate"}
                </button>

                {genRes&&(
                  <div style={{padding:"10px 14px",border:"2.5px solid var(--teal)",borderRadius:"var(--r-md)",background:"var(--teal-soft)",...B,fontSize:12,color:"var(--ink)",lineHeight:1.7}}>
                    {genRes}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
