/* ESC 课程 · 章节解读播放器（全局坞 + 封面/每页入口）
 * 用法：页面先注入 <script>window.ESC_AUDIO={kind:'deck'|'toc',chapter:'第七章',tracks:[{part,file}]}</script>
 *      再 <script src="esc-audio.js"></script>。任何带 data-esc-track="i" 的元素点击→播第 i 轨。
 * 原则：播放用独立 <audio> 线性推进，不监听/不触碰页面翻页事件——翻页不断播、无跳转。
 */
(function(){
  'use strict';
  var cfg = window.ESC_AUDIO;
  if(!cfg || !cfg.tracks || !cfg.tracks.length) return;

  var TRACKS = cfg.tracks.map(function(t){ return {part:t.part||'', ch:(t.ch||cfg.chapter||''), file:t.file, title:t.title||t.part||''}; });
  var chapter = cfg.chapter || '';
  var kind = cfg.kind || 'deck';

  var i = -1, playing = false, dur = 0;
  var au = new Audio();

  function enc(p){ return p.split('/').map(encodeURIComponent).join('/'); }

  /* ---------- 样式（随站 tokens，全 esc- 前缀） ---------- */
  var css = [
    '.esc-dock{position:fixed;right:22px;bottom:18px;z-index:60;font-family:var(--sans-zh,"Noto Sans SC"),sans-serif;color:var(--paper,#f8f3e7)}',
    '.esc-dock[data-state="idle"]{display:none}',
    '.esc-panel{width:min(430px,86vw);background:rgba(var(--ink-rgb,31,26,20),.94);border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 50px rgba(0,0,0,.35),0 2px 8px rgba(0,0,0,.2);border-radius:6px;padding:16px 18px 14px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
    '.esc-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px}',
    '.esc-tag{font-family:var(--mono,ui-monospace,monospace);font-size:9px;letter-spacing:.22em;text-transform:uppercase;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.esc-ops{display:flex;gap:12px;flex:0 0 auto}',
    '.esc-ops button{background:none;border:0;color:inherit;font-family:var(--mono,ui-monospace,monospace);font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.5;cursor:pointer;padding:0}',
    '.esc-ops button:hover{opacity:1}',
    '.esc-d-title{font-family:var(--serif-zh,"Noto Serif SC"),serif;font-weight:700;font-size:clamp(15px,1.4vw,20px);line-height:1.35;letter-spacing:-.005em;margin-bottom:10px;color:var(--paper,#f8f3e7)}',
    '.esc-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
    '.esc-chip{border:1px solid rgba(255,255,255,.3);background:transparent;color:inherit;font-family:var(--mono,ui-monospace,monospace);font-size:9px;letter-spacing:.06em;padding:3px 10px;border-radius:999px;cursor:pointer;opacity:.55}',
    '.esc-chip.on{background:var(--paper,#f8f3e7);color:var(--ink,#1f1a14);opacity:1;border-color:var(--paper,#f8f3e7)}',
    '.esc-bar{height:2px;background:rgba(255,255,255,.16);position:relative;cursor:pointer}',
    '.esc-bar i{position:absolute;left:0;top:0;bottom:0;width:0%;background:var(--paper,#f8f3e7);opacity:.9}',
    '.esc-time{display:flex;justify-content:space-between;margin:6px 0 10px;font-family:var(--mono,ui-monospace,monospace);font-size:9px;letter-spacing:.08em;opacity:.5;font-variant-numeric:tabular-nums}',
    '.esc-ctrls{display:flex;align-items:center;justify-content:center;gap:18px}',
    '.esc-ctrls button{background:none;border:0;color:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:.85;padding:0}',
    '.esc-ctrls button:hover{opacity:1}',
    '.esc-ctrls .ct{width:12px;height:12px}',
    '.esc-ctrls .ct svg{width:100%;height:100%;fill:currentColor}',
    '.esc-ctrls .esc-play{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.45)}',
    '.esc-ctrls .esc-play svg{width:11px;height:11px;fill:currentColor}',
    '.esc-fab{display:none}',
    '.esc-dock.esc-folded .esc-panel{display:none}',
    '.esc-dock.esc-folded .esc-fab{display:flex;width:52px;height:52px;border-radius:50%;background:rgba(var(--ink-rgb,31,26,20),.94);color:var(--paper,#f8f3e7);align-items:center;justify-content:center;cursor:pointer;box-shadow:0 14px 36px rgba(0,0,0,.3);margin-left:auto}',
    '.esc-eq{display:flex;gap:3px;align-items:flex-end;height:14px}',
    '.esc-eq span{width:2.5px;background:var(--paper,#f8f3e7);height:30%;animation:esc-eq 1s ease-in-out infinite}',
    '.esc-eq span:nth-child(2){animation-delay:.2s}',
    '.esc-eq span:nth-child(3){animation-delay:.4s}',
    '.esc-dock.esc-paused .esc-eq span{animation-play-state:paused;opacity:.5}',
    '@keyframes esc-eq{0%,100%{height:30%}50%{height:100%}}',
    /* 每页常驻小圆钮（deck 模式） */
    '.esc-round{position:fixed;left:22px;bottom:16px;z-index:60;width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;transition:opacity .25s ease;padding:0}',
    '.esc-round{border:1px solid rgba(255,255,255,.55);color:var(--paper,#f8f3e7)}',
    'body.light-bg .esc-round{border-color:rgba(var(--ink-rgb,31,26,20),.6);color:var(--ink,#1f1a14)}',
    '.esc-round svg{width:12px;height:12px;fill:currentColor}',
    'body.esc-live .esc-round{opacity:0;pointer-events:none}',
    'body.esc-live .src-toggle{opacity:0;pointer-events:none;transition:opacity .2s}',
    /* 封面收听卡（插在 hero slide 内，样式独立，随 slide 明暗自适应） */
    '.esc-hero-audio{position:absolute;right:6vw;bottom:13vh;width:min(380px,36vw);z-index:5;padding:16px 18px 14px;border:1px solid currentColor;border-top:3px solid currentColor;background:rgba(var(--paper-rgb,248,243,231),.62);backdrop-filter:blur(2px);color:inherit}',
    '.slide.dark .esc-hero-audio{background:rgba(var(--ink-rgb,31,26,20),.55)}',
    '.esc-hero-audio .eh-k{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-family:var(--mono,ui-monospace,monospace);font-size:9px;letter-spacing:.22em;text-transform:uppercase;opacity:.55;margin-bottom:10px}',
    '.esc-hero-audio .eh-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:none;border:0;color:inherit;cursor:pointer;padding:8px 0;border-top:1px dashed rgba(127,127,127,.3)}',
    '.esc-hero-audio .eh-row:first-of-type{border-top:0}',
    '.esc-hero-audio .esc-i{flex:0 0 auto;width:26px;height:26px;border-radius:50%;border:1px solid currentColor;display:inline-flex;align-items:center;justify-content:center;opacity:.75}',
    '.esc-hero-audio .esc-i svg{width:8px;height:8px;fill:currentColor}',
    '.esc-hero-audio .eh-txt{display:flex;flex-direction:column;min-width:0}',
    '.esc-hero-audio .eh-part{font-family:var(--mono,ui-monospace,monospace);font-size:9px;letter-spacing:.2em;text-transform:uppercase;opacity:.5}',
    '.esc-hero-audio .eh-sub{font-family:var(--serif-zh,"Noto Serif SC"),serif;font-weight:600;font-size:clamp(12px,1.05vw,16px);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}',
    '.esc-hero-audio .eh-row.esc-on .esc-i{background:currentColor;color:var(--paper,#f8f3e7)}',
    '.slide.dark .esc-hero-audio .eh-row.esc-on .esc-i{color:var(--ink,#1f1a14)}',
    '.esc-hero-audio .eh-row.esc-on .eh-sub{opacity:1}',
    '.esc-hero-audio .eh-row.esc-on{opacity:1}',
    '.esc-hero-audio .eh-row{opacity:.82}',
    '.esc-hero-audio .eh-row:hover{opacity:1}',
    '@media (max-width:900px){.esc-hero-audio{position:static;width:100%;max-width:none;margin-top:3vh}}'
  ].join('\n');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- DOM ---------- */
  var body = document.body;
  var dock = document.createElement('div');
  dock.className = 'esc-dock';
  dock.dataset.state = 'idle';
  dock.innerHTML =
    '<div class="esc-panel">'+
      '<div class="esc-head"><span class="esc-tag" data-esc-tag></span>'+
        '<span class="esc-ops"><button data-esc-fold>收起</button><button data-esc-close>关闭</button></span></div>'+
      '<div class="esc-d-title" data-esc-title></div>'+
      '<div class="esc-chips" data-esc-chips></div>'+
      '<div class="esc-bar" data-esc-bar><i></i></div>'+
      '<div class="esc-time"><span data-esc-cur>00:00</span><span data-esc-tot>--:--</span></div>'+
      '<div class="esc-ctrls">'+
        '<button class="ct" data-esc-prev title="上一轨"><svg viewBox="0 0 10 10"><path d="M9 1 L3.5 5 L9 9 Z M1.5 1 L1.5 9 L2.4 9 L2.4 1 Z"/></svg></button>'+
        '<button class="esc-play" data-esc-play title="播放 / 暂停"></button>'+
        '<button class="ct" data-esc-next title="下一轨"><svg viewBox="0 0 10 10"><path d="M1 1 L6.5 5 L1 9 Z M8.6 1 L8.6 9 L7.7 9 L7.7 1 Z"/></svg></button>'+
      '</div>'+
    '</div>'+
    '<div class="esc-fab" data-esc-fab title="展开"><span class="esc-eq"><span></span><span></span><span></span></span></div>';
  body.appendChild(dock);

  var el = {
    tag: dock.querySelector('[data-esc-tag]'),
    title: dock.querySelector('[data-esc-title]'),
    chips: dock.querySelector('[data-esc-chips]'),
    bar: dock.querySelector('[data-esc-bar] i'),
    cur: dock.querySelector('[data-esc-cur]'),
    tot: dock.querySelector('[data-esc-tot]'),
    play: dock.querySelector('[data-esc-play]')
  };

  var round = null;
  if(kind === 'deck'){
    round = document.createElement('button');
    round.className = 'esc-round';
    round.setAttribute('aria-label','收听本章解读');
    round.title = '收听本章解读';
    round.innerHTML = '<svg viewBox="0 0 10 10"><path d="M1.5 1 L8.5 5 L1.5 9 Z"/></svg>';
    body.appendChild(round);
    round.addEventListener('click', function(){ if(i < 0){ setTrack(0); } else { toggle(); } });
  }

  var ICON_PLAY  = '<svg viewBox="0 0 10 10"><path d="M1.5 1 L8.5 5 L1.5 9 Z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 10 10"><rect x="1.4" y="1" width="2.6" height="8"/><rect x="6" y="1" width="2.6" height="8"/></svg>';

  function fmt(s){
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s/60), ss = s%60;
    return (m<10?'0':'')+m+':'+(ss<10?'0':'')+ss;
  }

  function paintIcons(){
    el.play.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    var btns = document.querySelectorAll('[data-esc-track] .esc-ic, [data-esc-track] .esc-round-ic');
    /* hero/disc 行的内层图标统一刷新 */
    document.querySelectorAll('[data-esc-track]').forEach(function(b){
      var active = (+b.getAttribute('data-esc-track')) === i;
      b.classList.toggle('esc-on', active && playing);
      var ic = b.querySelector('.esc-i');
      if(ic){ ic.innerHTML = (active && playing) ? ICON_PAUSE : ICON_PLAY; }
      var iv = b.querySelector('.esc-v');
      if(iv){ iv.innerHTML = (active && playing) ? ICON_PAUSE : ICON_PLAY; }
    });
    if(round){ round.innerHTML = (i >= 0 && playing) ? ICON_PAUSE : ICON_PLAY; }
  }

  function paintChips(){
    if(i < 0){ el.chips.innerHTML = ''; return; }
    /* 仅当当前章有多轨（如第7章 正章/变奏）才显示 chip；目录页 12 轨各属不同章，不混列 */
    var cur = TRACKS[i];
    var grp = TRACKS.filter(function(t){ return (t.ch||'') === (cur.ch||''); });
    if(grp.length < 2){ el.chips.innerHTML = ''; return; }
    el.chips.innerHTML = '';
    grp.forEach(function(t){
      var k = TRACKS.indexOf(t);
      var c = document.createElement('button');
      c.className = 'esc-chip' + (k===i ? ' on' : '');
      c.type = 'button';
      c.textContent = t.part || ('音轨 ' + (k+1));
      c.addEventListener('click', function(){ (k===i) ? toggle() : setTrack(k); });
      el.chips.appendChild(c);
    });
  }

  function render(){
    if(i < 0){ dock.dataset.state = 'idle'; body.classList.remove('esc-live'); dock.classList.remove('esc-folded'); return; }
    dock.dataset.state = 'live';
    body.classList.add('esc-live');
    var t = TRACKS[i];
    el.tag.textContent = 'ESC · ' + (t.ch || chapter) + (t.part ? ' · ' + t.part : '');
    el.title.textContent = t.title;
    el.tot.textContent = dur ? fmt(dur) : '--:--';
    paintChips();
    paintIcons();
  }

  function progress(){
    if(i < 0) return;
    var cur = au.currentTime || 0;
    el.cur.textContent = fmt(cur);
    if(dur){ el.bar.style.width = Math.min(100, cur/dur*100) + '%'; }
  }

  function setTrack(k){
    if(k < 0 || k >= TRACKS.length) return;
    i = k; dur = 0;
    au.src = enc(TRACKS[i].file);
    render(); /* i>=0 → 坞浮现、esc-live 加上、圆钮隐藏 */
    var pr = au.play();
    if(pr && pr.catch) pr.catch(function(){});
  }

  function toggle(){
    if(i < 0){ setTrack(0); return; }
    if(playing){ au.pause(); } else { var pr = au.play(); if(pr && pr.catch) pr.catch(function(){}); }
  }

  function step(d){
    if(i < 0){ setTrack(0); return; }
    setTrack(Math.max(0, Math.min(TRACKS.length-1, i + d)));
  }

  function stop(){
    au.pause();
    try{ au.removeAttribute('src'); au.load(); }catch(e){}
    i = -1; playing = false; dur = 0;
    dock.classList.remove('esc-folded');
    render();
  }

  au.addEventListener('play', function(){ playing = true; dock.classList.remove('esc-paused'); paintIcons(); });
  au.addEventListener('pause', function(){ playing = false; dock.classList.add('esc-paused'); paintIcons(); });
  au.addEventListener('timeupdate', progress);
  au.addEventListener('loadedmetadata', function(){ dur = au.duration || 0; el.tot.textContent = fmt(dur); });
  au.addEventListener('ended', function(){
    if(i < TRACKS.length-1){ step(1); } else { playing = false; au.currentTime = 0; dock.classList.add('esc-paused'); paintIcons(); }
  });

  /* 控制 */
  dock.querySelector('[data-esc-play]').addEventListener('click', toggle);
  dock.querySelector('[data-esc-prev]').addEventListener('click', function(){ step(-1); });
  dock.querySelector('[data-esc-next]').addEventListener('click', function(){ step(1); });
  dock.querySelector('[data-esc-close]').addEventListener('click', stop);
  dock.querySelector('[data-esc-fold]').addEventListener('click', function(){ dock.classList.add('esc-folded'); });
  dock.querySelector('[data-esc-fab]').addEventListener('click', function(){ dock.classList.remove('esc-folded'); });
  dock.querySelector('[data-esc-bar]').addEventListener('click', function(e){
    if(i < 0 || !dur) return;
    var r = this.getBoundingClientRect();
    var ratio = (e.clientX - r.left) / r.width;
    au.currentTime = Math.max(0, Math.min(dur-0.2, ratio*dur));
    progress();
  });

  /* 任何 data-esc-track 点击 → 播放该轨（封面卡两行 / 目录圆钮） */
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-esc-track]');
    if(!b) return;
    e.preventDefault(); e.stopPropagation();
    var k = parseInt(b.getAttribute('data-esc-track'), 10);
    if(k === i && playing){ toggle(); } else { setTrack(k); }
  });

  /* 暴露 */
  window.ESCAudio = { play:setTrack, toggle:toggle, stop:stop, step:step };
})();
