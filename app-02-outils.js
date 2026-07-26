"use strict";
/* ============================ Utilitaires ============================ */
const todayISO = ()=> new Date().toISOString().slice(0,10);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = (s,e)=> s+'x'+e;
const aired = ep => !!ep.d && ep.d <= todayISO();

function epRuntime(show, ep){ return ep.r || show.runtime || 42; }

function seasonNums(show, withSpecials){
  return Object.keys(show.seasons||{}).map(Number)
    .filter(n => withSpecials ? true : n > 0).sort((a,b)=>a-b);
}
function allEpisodes(show, withSpecials){
  const out = [];
  seasonNums(show, withSpecials).forEach(s=>{
    (show.seasons[s]||[]).forEach(ep=> out.push(Object.assign({}, ep, {s:s})));
  });
  return out;
}
function progress(show){
  const eps = allEpisodes(show,false).filter(aired);
  const w = eps.filter(ep => show.watched[key(ep.s,ep.e)]).length;
  return { watched:w, total:eps.length, pct: eps.length ? Math.round(w/eps.length*100) : 0 };
}
function nextToWatch(show){
  const eps = allEpisodes(show,false);
  for(const ep of eps){
    if(!aired(ep)) break;
    if(!show.watched[key(ep.s,ep.e)]) return ep;
  }
  return null;
}
function isFinished(show){
  const p = progress(show);
  const ended = show.status==='Ended' || show.status==='Canceled';
  return p.total>0 && p.watched===p.total && ended && !show.next;
}

/* ===== STATUT D'UN TITRE — source unique de vérité =====
   Un titre a exactement un statut, déduit des épisodes réellement cochés :
     'avoir'   : rien de vu             (films non vus, séries à 0 épisode vu)
     'asuivre' : commencé, pas terminé  (séries en cours, y compris « à jour »)
     'vu'      : terminé                (films vus, séries finies intégralement)
   Les épisodes hors-série (saison 0) sont visibles mais ne comptent jamais.
   Aucun écran ne doit appliquer sa propre règle : tout passe par ici.        */
function statutSerie(s){
  if(progress(s).watched === 0) return 'avoir';
  if(isFinished(s)) return 'vu';
  return 'asuivre';
}
function statutFilm(m){ return m.seen ? 'vu' : 'avoir'; }
function statut(o){ return o && o.seasons !== undefined ? statutSerie(o) : statutFilm(o); }
const LIB_STATUT = { avoir:'À voir', asuivre:'À suivre', vu:'Vu' };

function fmtDur(min){
  if(!min) return '0 min';
  const d = Math.floor(min/1440), h = Math.floor((min%1440)/60), m = min%60;
  const p = [];
  if(d) p.push(d+' j');
  if(h) p.push(h+' h');
  if(m && !d) p.push(m+' min');
  return p.join(' ') || '0 min';
}
/* ===== Numérotation des épisodes — une seule fonction pour toute l'app =====
   Forme unique « S5E132 », utilisée partout : liste des épisodes, à rattraper,
   calendrier, fenêtres de confirmation et messages. */
function codeEp(s, e){ return 'S'+s+'E'+e; }

function fmtDurShort(min){
  if(!min) return '0h';
  const d = Math.floor(min/1440), h = Math.floor((min%1440)/60), m = min%60;
  if(d) return d+'j '+h+'h';
  if(h) return h+'h'+(m?String(m).padStart(2,'0'):'');
  return m+'min';
}
const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
function fmtDate(iso){
  if(!iso) return 'Date inconnue';
  const d = new Date(iso+'T12:00:00');
  return d.getDate()+' '+MOIS[d.getMonth()]+' '+d.getFullYear();
}
function fmtDateShort(iso){
  if(!iso) return '';
  const d = new Date(iso+'T12:00:00');
  return d.getDate()+' '+MOIS[d.getMonth()];
}
function fmtDayLabel(iso){
  const t = todayISO();
  if(iso===t) return "Aujourd'hui";
  const y = new Date(Date.now()-86400000).toISOString().slice(0,10);
  const tm = new Date(Date.now()+86400000).toISOString().slice(0,10);
  if(iso===y) return 'Hier';
  if(iso===tm) return 'Demain';
  const d = new Date(iso+'T12:00:00');
  return JOURS[d.getDay()]+' '+d.getDate()+' '+MOIS[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'');
}
const year = iso => iso ? iso.slice(0,4) : '';

function posterEl(path, size, cls, alt){
  if(path) return '<img class="poster '+(cls||'')+'" loading="lazy" onerror="posterFail(this)" src="'+
    IMG(path,size)+'" alt="'+esc(alt||'')+'">';
  return '<div class="poster ph '+(cls||'')+'">'+esc((alt||'?').slice(0,18))+'</div>';
}
/* Vignette d'épisode : image TMDB si elle existe, sinon un cadre neutre de même taille.
   Chargement différé pour que les longues saisons restent fluides. */
function epThumb(ep){
  if(ep && ep.st)
    return '<div class="epthumb"><img loading="lazy" decoding="async" alt="" '+
           'onerror="thumbFail(this)" src="'+IMG(ep.st,'w300')+'"></div>';
  return '<div class="epthumb ph">'+I.frame+'</div>';
}
function thumbFail(img){
  const box = img.parentNode;
  if(box){ box.classList.add('ph'); box.innerHTML = I.frame; }
}

/* Si l'affiche ne charge pas, on retombe proprement sur le titre plutôt qu'une image cassée */
function posterFail(img){
  const d = document.createElement('div');
  d.className = img.className + ' ph';
  d.textContent = (img.getAttribute('alt')||'?').slice(0,18);
  img.replaceWith(d);
}

/* ============================ UI helpers ============================ */
let toastTimer;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}
function openSheet(html){
  document.getElementById('sheetin').innerHTML = html;
  document.getElementById('sheet').classList.add('show');
}
function closeSheet(){ document.getElementById('sheet').classList.remove('show'); }
document.getElementById('sheet').addEventListener('click', e=>{ if(e.target.id==='sheet') closeSheet(); });

/* ============================ État de navigation ============================ */
let view = 'follow';
let params = {};
let ui = { profTab:'series', editServer:false, searchQ:'', searchRes:null, searching:false, searchErr:'',
           openSeasons:{}, busy:false,
           /* Découvrir : type affiché, genres cochés, tri, note minimale, page en cours */
           disc:{ type:'tv', genres:[], perimetre:'recent', tri:'populaire', noteMin:0,
                  page:1, pages:1, res:[], loading:false, err:'', charge:false } };

const DEPTH = { discover:0, follow:0, profile:0, preview:1, show:1, movie:1, settings:1, abos:1, account:2, biblio:2 };
let navDir = 'none';
function go(v, p, dir){
  if(view===v && JSON.stringify(params)===JSON.stringify(p||{})){ window.scrollTo(0,0); render(); return; }
  /* En revenant sur Découvrir sans recherche en cours, le champ se referme :
     on retrouve l'écran de suggestions net. Une recherche en cours, elle, survit. */
  if(v === 'discover' && !(ui.searchQ||'').trim()) ui.champOuvert = false;
  const a = DEPTH[view]||0, b = DEPTH[v]||0;
  navDir = dir || (b > a ? 'enter' : b < a ? 'back' : 'none');
  view = v; params = p||{}; window.scrollTo(0,0);
  if(typeof hideUndo === 'function') hideUndo();
  render();
}
/* Cible du retour selon l'écran courant — utilisée par la flèche et par le balayage */
function currentBack(){
  if(view==='show' || view==='movie') return params.from || 'follow';
  if(view==='preview') return params.from || 'discover';
  if(view==='settings') return params.from || null;
  if(view==='account') return 'settings';
  if(view==='abos') return params.from || 'profile';
  if(view==='biblio') return 'abos';
  return null;
}
function goBack(){
  if(document.getElementById('sheet').classList.contains('show')) return closeSheet();
  const t = currentBack();
  if(t) go(t, {}, 'back');
}
/* Balayage depuis le bord gauche pour revenir en arrière */
(function swipeBack(){
  let x0=null, y0=null, t0=0;
  document.addEventListener('touchstart', e=>{
    const t = e.touches[0];
    if(t.clientX <= 28 && currentBack()){ x0=t.clientX; y0=t.clientY; t0=Date.now(); } else x0=null;
  }, {passive:true});
  document.addEventListener('touchend', e=>{
    if(x0===null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX-x0, dy = Math.abs(t.clientY-y0);
    if(dx > 60 && dy < 45 && Date.now()-t0 < 700) goBack();
    x0=null;
  }, {passive:true});
})();
