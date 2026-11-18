(() => {
  'use strict';
  const cfg = window.ABU_ASALA_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const money = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;
  const number = (n) => Number(n || 0).toLocaleString('ar-EG');
  const state = { categories: [], cart: new Map(), selected: {}, category: null, subcategory: null, page: 'p1', stack: ['p1'], delivery: Number(cfg.DELIVERY_FEE ?? 15), loaded: false };
  const byId = new Map();
  const $menuState = $('#menuState');
  const setState = (title, message, show = true) => { $('#stateTitle').textContent = title; $('#stateMessage').textContent = message; $menuState.classList.toggle('on', show); };
  const iconHTML = (entity, cls='ico') => {
    const url = entity.icon_url || entity.image_url || entity.icon?.file_url || entity.icon?.file || '';
    const emoji = entity.icon_emoji || (typeof entity.icon === 'string' ? entity.icon : '') || '🍽️';
    return url ? `<img class="${cls} pic" src="${escapeAttr(url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls}',textContent:'${escapeAttr(emoji)}'}))">` : `<span class="${cls}">${escapeHTML(emoji)}</span>`;
  };
  const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escapeAttr = escapeHTML;
  const idOf = (o, ...keys) => { for (const k of keys) if (o?.[k] != null) return String(o[k]); return ''; };
  const arr = (v) => Array.isArray(v) ? v : [];

  // Expected Worker response: { categories: [...] }. Each category may contain
  // subcategories, items, size_variants/variants and extras. See docs/menu-api-contract.md.
  function normalizeMenu(payload) {
    const rawCats = arr(payload?.categories);
    return rawCats.filter(c => c.is_visible !== 0 && c.is_visible !== false).map((c, ci) => {
      const sizes = arr(c.size_variants || c.variants).filter(v => v.is_visible !== 0 && v.is_visible !== false).map((v, i) => ({
        id: idOf(v,'var_id','id'), name: v.name || v.label || `حجم ${i+1}`,
        extraPrice: Number(v.extra_price ?? v.price_delta ?? 0)
      }));
      const extras = arr(c.extras || c.extra_instances).filter(x => x.is_available !== 0 && x.is_available !== false && x.is_visible !== 0 && x.is_visible !== false).map(x => ({
        id: idOf(x,'ext_id','id'), name: x.name || '', price: Number(x.price ?? x.instance_price ?? 0)
      }));
      const normalizeItem = (it, sub, si, ii) => {
        const item = {
          id: idOf(it,'itm_id','id') || `cat${ci}-sub${si}-item${ii}`,
          name: it.name || '', icon_url: it.icon_url || it.image_url || '', icon_emoji: it.icon_emoji || '',
          mainPrice: Number(it.main_price ?? it.price ?? 0),
          available: it.is_available !== 0 && it.is_available !== false && it.available !== false,
          visible: it.is_visible !== 0 && it.is_visible !== false,
          group: it.group_name || it.group?.name || '', sizes: arr(it.sizes).length ? arr(it.sizes).map(z=>({id:idOf(z,'var_id','id'),name:z.name||z.label||'',extraPrice:Number(z.extra_price??z.price_delta??0)})) : sizes,
          extras: arr(it.extras).length ? arr(it.extras).map(x=>({id:idOf(x,'ext_id','id'),name:x.name||'',price:Number(x.price??0)})) : extras,
          subcategoryId: sub?.id || ''
        };
        item.priceFor = (size) => size ? Number(it.prices?.[size.id] ?? item.mainPrice + (size.extraPrice || 0)) : item.mainPrice;
        return item;
      };
      const rawSubs = arr(c.subcategories);
      const subs = rawSubs.filter(s=>s.is_visible !== 0 && s.is_visible !== false).map((s, si) => {
        const sub = { id:idOf(s,'sub_id','id') || `sub-${ci}-${si}`, name:s.name||'', icon_url:s.icon_url||'', icon_emoji:s.icon_emoji||'', items:[] };
        sub.items = arr(s.items).filter(i=>i.is_visible !== 0 && i.is_visible !== false).map((it,ii)=>normalizeItem(it,sub,si,ii));
        return sub;
      });
      // Items may also belong directly to a category without a subcategory.
      const directItems = arr(c.items).filter(i=>i.is_visible !== 0 && i.is_visible !== false).map((it,ii)=>normalizeItem(it,null,-1,ii));
      if (directItems.length) subs.unshift({id:`direct-${ci}`,name:c.name,icon_url:c.icon_url,icon_emoji:c.icon_emoji,items:directItems,direct:true});
      return { id:idOf(c,'cat_id','id') || `cat-${ci}`, name:c.name||'', icon_url:c.icon_url||'', icon_emoji:c.icon_emoji||'', extras, sizes, subs };
    });
  }
  function allItems() { byId.clear(); state.categories.forEach(c=>c.subs.forEach(s=>s.items.forEach(i=>byId.set(i.id,i)))); }
  function selectedSize(item) { return Math.min(state.selected[item.id]?.size || 0, Math.max(0,item.sizes.length-1)); }
  function selectedExtras(item) { return state.selected[item.id]?.extras || []; }
  function itemPrice(item, sizeIndex, extraIds=[]) {
    const size = item.sizes[sizeIndex];
    const base = size ? item.priceFor(size) : item.mainPrice;
    return base + item.extras.filter(x=>extraIds.includes(x.id)).reduce((s,x)=>s+x.price,0);
  }
  function cartKey(item, sizeIndex, extraIds) { return `${item.id}::${sizeIndex}::${[...extraIds].sort().join(',')}`; }
  function parseKey(key) { const [id,sz,ex=''] = key.split('::'); return {item:byId.get(id),sizeIndex:Number(sz),extraIds:ex?ex.split(','):[]}; }
  function addToCart(item) {
    const si=selectedSize(item), ex=selectedExtras(item), key=cartKey(item,si,ex);
    state.cart.set(key,(state.cart.get(key)||0)+1); render();
  }
  function itemCard(item, compact=false, key=null, qty=0) {
    const si=key===null?selectedSize(item):parseKey(key).sizeIndex;
    const extras=key===null?selectedExtras(item):parseKey(key).extraIds;
    const size=item.sizes[si];
    const currentPrice=itemPrice(item,si,extras);
    const controls=compact ? `<div class="qty"><button data-cart="dec" data-key="${escapeAttr(key)}">−</button><b>${number(qty)}</b><button data-cart="inc" data-key="${escapeAttr(key)}">+</button></div>` : (item.available ? `<button class="add" data-add="${escapeAttr(item.id)}">أضف</button>` : '<span class="na">غير متاح</span>');
    const sizeButtons=!compact && item.sizes.length>1 ? `<div class="szs">${item.sizes.map((z,i)=>`<button class="chip ${i===si?'on':''}" data-size="${escapeAttr(item.id)}" data-index="${i}">${escapeHTML(z.name)}</button>`).join('')}</div>` : '';
    const extraButtons=!compact && item.extras.length ? `<div class="extras">${item.extras.map(x=>`<button class="chip extra-chip ${extras.includes(x.id)?'on':''}" data-extra="${escapeAttr(item.id)}" data-extra-id="${escapeAttr(x.id)}">${escapeHTML(x.name)}${x.price?` (+${number(x.price)})`:''}</button>`).join('')}</div>` : '';
    const extraLabel=compact && extras.length ? ` · ${item.extras.filter(x=>extras.includes(x.id)).map(x=>x.name).join('، ')}` : '';
    return `<article class="item ${compact?'compact':''} ${item.available?'':'off'}" data-card="${escapeAttr(item.id)}">${iconHTML(item)}<div class="meta"><span class="nm">${escapeHTML(item.name)}${compact&&size?.name?` (${escapeHTML(size.name)})`:''}${escapeHTML(extraLabel)}</span><span class="pr">${money(currentPrice)}</span>${sizeButtons}${extraButtons}</div>${controls}</article>`;
  }
  function categoryButton(x, attr, value) { return `<button class="catbtn" ${attr}="${escapeAttr(value)}"> <div class="cimg">${iconHTML(x)}</div><span class="cn">${escapeHTML(x.name)}</span></button>`; }
  function show(id) { state.page=id; document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id)); window.scrollTo(0,0); render(); }
  function go(id) { state.stack.push(id); show(id); }
  function back() { if(state.stack.length>1)state.stack.pop(); show(state.stack[state.stack.length-1]); }
  function openSub(s) { state.subcategory=s; $('#ttl').textContent=s.name; go('p3'); }
  function render() {
    if (!state.loaded) return;
    $('#cats').innerHTML=state.categories.map((c,i)=>categoryButton(c,'data-category',i)).join('');
    if(state.category) { $('#sttl').textContent=state.category.name; $('#subs').innerHTML=state.category.subs.map(s=>categoryButton(s,'data-sub',s.id)).join(''); }
    const grid=$('#grid');
    if(state.subcategory) {
      const groups=new Map(); state.subcategory.items.forEach(it=>{const g=it.group||'';if(!groups.has(g))groups.set(g,[]);groups.get(g).push(it)});
      grid.innerHTML=[...groups].map(([g,items])=>(g?`<h3 class="grp">${escapeHTML(g)}</h3>`:'')+items.map(i=>itemCard(i)).join('')).join('');
    }
    const entries=[...state.cart].map(([key,q])=>({key,q,...parseKey(key)})).filter(x=>x.item);
    const subtotal=entries.reduce((sum,e)=>sum+itemPrice(e.item,e.sizeIndex,e.extraIds)*e.q,0);
    $('#blist').innerHTML=entries.map(e=>itemCard(e.item,true,e.key,e.q)).join('');
    $('#btot').textContent=money(subtotal);
    const bar=$('#bar'); if(!state.cart.size)bar.classList.remove('open');
    bar.classList.toggle('show',['p2','ps','p3'].includes(state.page)&&state.cart.size>0);
    document.documentElement.style.setProperty('--barh',bar.classList.contains('show')?bar.offsetHeight+'px':'0px');
    $('#sum').innerHTML=entries.map(e=>`<li><span>${escapeHTML(e.item.name)} × ${number(e.q)}</span><b>${money(itemPrice(e.item,e.sizeIndex,e.extraIds)*e.q)}</b></li>`).join('');
    $('#sub').textContent=money(subtotal);$('#dlv').textContent=money(state.delivery);$('#gt').textContent=money(subtotal+state.delivery);
  }
  async function loadMenu() {
    const url=String(cfg.MENU_API_URL||'').trim(), token=String(cfg.PUBLIC_MENU_TOKEN||'').trim();
    if(!url || !token) { state.loaded=false; setState('المنيو متوقف','المنيو متوقف حاليًا. سيتم تشغيله بعد إعداد رابط واجهة المنيو وإعدادات الوصول إلى الـ API.',true); return false; }
    setState('جاري تحميل المنيو','بنحمّل الأقسام والأصناف...',true);
    try {
      const headers={'Accept':'application/json'}; headers['Authorization']=`Bearer ${token}`;
      const response=await fetch(url,{method:'GET',headers,cache:'no-store'});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      const categories=normalizeMenu(payload);
      if (payload.delivery_fee != null) state.delivery = Number(payload.delivery_fee);
      if(!categories.length) { state.categories=[];state.loaded=true;render();setState('المنيو متوقف','المنيو غير متاح حاليًا أو لم تتم إضافة أقسام بعد.',true);return false; }
      state.categories=categories;state.loaded=true;allItems();state.cart.clear();state.selected={};
      setState('','',false); $('#start').disabled=false; render();
      return true;
    } catch(err) {
      console.error('Menu loading failed:',err); state.loaded=false;
      setState('المنيو متوقف','تعذر الاتصال بالمنيو حاليًا. تأكد من إعدادات الـ API ثم حاول مرة أخرى.',true); return false;
    }
  }
  $('#start').addEventListener('click',async()=>{ if(await loadMenu()) {state.stack=['p1'];go('p2');} });
  $('#retryMenu').addEventListener('click',async()=>{if(await loadMenu()){state.stack=['p1'];go('p2');}});
  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-add]'); if(a){const it=byId.get(a.dataset.add);if(it)addToCart(it);return;}
    const sz=e.target.closest('[data-size]');if(sz){const id=sz.dataset.size;state.selected[id]={...(state.selected[id]||{}),size:Number(sz.dataset.index)};const it=byId.get(id);sz.closest('[data-card]').outerHTML=itemCard(it);return;}
    const ex=e.target.closest('[data-extra]');if(ex){const id=ex.dataset.extra, xid=ex.dataset.extraId;const current=new Set(selectedExtras(byId.get(id)));current.has(xid)?current.delete(xid):current.add(xid);state.selected[id]={...(state.selected[id]||{}),extras:[...current]};ex.closest('[data-card]').outerHTML=itemCard(byId.get(id));return;}
    const cartBtn=e.target.closest('[data-cart]');if(cartBtn){const key=cartBtn.dataset.key,q=(state.cart.get(key)||0)+(cartBtn.dataset.cart==='inc'?1:-1);q>0?state.cart.set(key,q):state.cart.delete(key);render();return;}
    const c=e.target.closest('[data-category]');if(c){state.category=state.categories[Number(c.dataset.category)];if(state.category.subs.length===1&&state.category.subs[0].direct)openSub(state.category.subs[0]);else{state.stack.push('ps');show('ps');}return;}
    const s=e.target.closest('[data-sub]');if(s){openSub(state.category.subs.find(x=>x.id===s.dataset.sub));return;}
    if(e.target.closest('[data-back]'))back();
  });
  $('#view').addEventListener('click',()=>go('p4'));
  $('#clear').addEventListener('click',()=>{state.cart.clear();render();});
  $('#again').addEventListener('click',()=>{state.cart.clear();$('#done').classList.remove('on');state.stack=['p1'];show('p1');});
  const grab=$('#grab');let y0=null;grab.onpointerdown=e=>{y0=e.clientY;grab.setPointerCapture(e.pointerId)};grab.onpointercancel=()=>y0=null;grab.onpointerup=e=>{if(y0===null)return;const d=e.clientY-y0;y0=null;d<-20?$('#bar').classList.add('open'):d>20?$('#bar').classList.remove('open'):$('#bar').classList.toggle('open')};
  new ResizeObserver(()=>document.documentElement.style.setProperty('--barh',$('#bar').classList.contains('show')?$('#bar').offsetHeight+'px':'0px')).observe($('#bar'));
  $('#send').addEventListener('click',async()=>{
    const val=id=>$(id).value.trim(), err=m=>$('#err').textContent=m;
    if(!state.cart.size)return err('الطلب فاضي'); if(!val('#fn'))return err('اكتب اسمك');
    if(!/^[0-9٠-٩+ ]{8,}$/.test(val('#fp')))return err('اكتب رقم موبايل صحيح');if(!val('#fa'))return err('اكتب العنوان');
    const orderItems=[...state.cart].map(([key,qty])=>{const e=parseKey(key);return {item_id:e.item.id,name:e.item.name,size:e.item.sizes[e.sizeIndex]?.name||null,extras:e.item.extras.filter(x=>e.extraIds.includes(x.id)).map(x=>({id:x.id,name:x.name,price:x.price})),unit_price:itemPrice(e.item,e.sizeIndex,e.extraIds),quantity:qty};});
    const subtotal=orderItems.reduce((s,x)=>s+x.unit_price*x.quantity,0);
    const payload={items:orderItems,subtotal,delivery_fee:state.delivery,total:subtotal+state.delivery,customer:{name:val('#fn'),phone:val('#fp'),address:val('#fa')},notes:val('#fm'),telegram_init_data:window.Telegram?.WebApp?.initData||''};
    const endpoint=String(cfg.ORDER_API_URL||'').trim();if(!endpoint){err('استقبال الطلبات غير مفعّل حاليًا.');return;}
    $('#send').disabled=true;err('');try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw new Error(`HTTP ${r.status}`);$('#done').classList.add('on');}catch(e){console.error(e);err('حصلت مشكلة في إرسال الطلب، جرّب تاني.');}finally{$('#send').disabled=false;}
  });
  // The landing screen stays visible. After the customer presses Start, missing
  // API/auth configuration produces the requested 'المنيو متوقف' state.
  setState('','',false);
  try { window.Telegram?.WebApp?.ready(); window.Telegram?.WebApp?.expand(); } catch (_) {}
})();
