// Memphis: crisp typography, bold cut shapes and offset ink shadows.
// Decorative geometry stays at the perimeter. Shared diagrams retain their real labels.
window.DreamcutMotion.register("memphis", ({ hexA }) => {
  const face = "'Avenir Next', Futura, 'Century Gothic', Arial, sans-serif";
  const base = { bg:'#fff8eb', panel:'#ffffff', ink:'#202344', muted:'#505573', accent:'#b83450', onAccent:'#ffffff',
    rule:'#202344', track:'#e5dfd4', yellow:'#f7c749', blue:'#72bfc4', pink:'#f19bb1' };
  return {
    ...base, display:face, displayWeight:800, displayTracking:'-0.035em', displayCase:'none',
    body:face, bodyWeight:600, figures:face, radius:0, motion:'rise', change:'lift',
    kit:{line:4,fill:'solid',panel:'fill'},panelEdge:base.ink,
    palettes:{
      light:{bg:'#ffffff',panel:'#fff8eb',ink:'#202344',muted:'#505573'},
      dark:{bg:'#202344',panel:'#343957',ink:'#fff8eb',muted:'#d7dbea',accent:'#ffafc4',onAccent:'#202344',rule:'#fff8eb',track:'#454b6a',panelEdge:'#fff8eb'},
      mono:{bg:'#f8f6ef',panel:'#ffffff',ink:'#232323',muted:'#505050',accent:'#353535',onAccent:'#ffffff',rule:'#232323',track:'#dedbd1',yellow:'#c7c7c7',blue:'#e0e0e0',pink:'#a8a8a8',panelEdge:'#232323'},
    },
    backdrop:(accent,texture,look)=>look.bg,
    css:()=>`#root .display { text-shadow:none; } #root .kicker { letter-spacing:.12em; }`,
    paint:(g,W,H,t,accent,look)=>{
      g.clearRect(0,0,W,H);
      const u=Math.min(W,H)/1080, ink=look.ink, bob=Math.sin(t*.85)*8*u;
      const shape=(x,y,angle,fill,path)=>{
        g.save();g.translate(x,y);g.rotate(angle);g.lineWidth=5*u;g.lineJoin='round';
        g.save();g.translate(12*u,12*u);path();g.fillStyle=ink;g.fill();g.restore();
        path();g.fillStyle=fill;g.fill();g.strokeStyle=ink;g.stroke();g.restore();
      };
      shape(W-30*u,105*u+bob,.15+Math.sin(t*.4)*.06,look.yellow,()=>{g.beginPath();g.rect(-90*u,-90*u,180*u,180*u);});
      shape(12*u,H-60*u-bob,-.22+Math.sin(t*.35)*.05,look.blue,()=>{g.beginPath();g.moveTo(-100*u,90*u);g.lineTo(0,-110*u);g.lineTo(115*u,90*u);g.closePath();});
      shape(W-65*u,H-30*u,.1,look.pink,()=>{g.beginPath();g.arc(0,0,100*u,Math.PI,Math.PI*2);g.closePath();});
      // Sparse dot-grid in the margin, with no dots underneath the text area.
      g.fillStyle=ink;
      for(let row=0;row<5;row++)for(let col=0;col<3;col++){
        g.beginPath();g.arc((20+col*18)*u,(55+row*18)*u,3*u,0,Math.PI*2);g.fill();
      }
      // A short zigzag, drawn on once then held; never distorts the words.
      g.strokeStyle=accent;g.lineWidth=7*u;g.lineCap='round';g.lineJoin='round';g.beginPath();
      const count=Math.min(8,Math.floor(t*12)+1);
      for(let i=0;i<=count;i++){const x=W*.52+i*19*u,y=H-35*u+(i%2?12:-12)*u;if(!i)g.moveTo(x,y);else g.lineTo(x,y);}
      g.stroke();
      // Flat print colour, intentionally no simulated damage across the lettering.
    },
  };
});
