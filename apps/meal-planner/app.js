
/* Data shape (localStorage)
  inventory: [{id, name, location, quantity, unit, expires, tags[]}]
  recipes: [{id, title, notes, ingredients:[{name, qty, unit}]}]
  plan: { monday: {breakfast, lunch, dinner}, ... } each slot: {type:'recipe'|'note', id?, text?}
  shopping: [{id, name, qty, unit, checked}]
*/

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const store = {
  get(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

// ---------- Utilities ----------
const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0,10);
const parseTags = (txt) => (txt||'').split(',').map(s => s.trim()).filter(Boolean);
const cmpi = (a,b) => a.localeCompare(b, undefined, {sensitivity:'base'});
const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const slots = ['Breakfast','Lunch','Dinner'];
const startOfWeek = (d) => {
  const day = (d.getDay()+6)%7; // Monday start
  const s = new Date(d); s.setDate(d.getDate()-day); s.setHours(0,0,0,0); return s;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(d.getDate()+n); return x; };

// ---------- State ----------
let inventory = store.get('inventory', []);
let recipes = store.get('recipes', []);
let plan = store.get('plan', {});
let shopping = store.get('shopping', []);
let weekStart = startOfWeek(new Date());

// ---------- Tabs ----------
$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $$('.tab').forEach(x => x.classList.remove('active'));
  $('#'+b.dataset.tab).classList.add('active');
  if (b.dataset.tab==='planner') renderPlanner();
  if (b.dataset.tab==='shopping') renderShopping();
  if (b.dataset.tab==='inventory') renderInventory();
  if (b.dataset.tab==='recipes') renderRecipes();
}));

// ---------- Theme ----------
$('#toggleTheme')?.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
  localStorage.setItem('theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
});
(function(){ const t = localStorage.getItem('theme'); if (t==='light') document.documentElement.classList.add('light'); })();

// ---------- Inventory ----------
function renderInventory() {
  const q = $('#invSearch').value.trim().toLowerCase();
  const loc = $('#invLocFilter').value;
  const exp = $('#invExpiryFilter').value;
  const now = new Date();
  const list = $('#inventoryList'); list.innerHTML = '';
  inventory
    .filter(i => !q || i.name.toLowerCase().includes(q) || (i.tags||[]).some(t => t.toLowerCase().includes(q)))
    .filter(i => !loc || i.location===loc)
    .filter(i => {
      if (!exp || !i.expires) return true;
      const d = new Date(i.expires);
      const diff = (d - now) / (1000*3600*24);
      if (exp==='expired') return diff < 0;
      if (exp==='week') return diff <= 7;
      if (exp==='month') return diff <= 30;
      return true;
    })
    .sort((a,b)=>cmpi(a.name,b.name))
    .forEach(i => list.appendChild(invCard(i)));
}

function invCard(i) {
  const t = document.getElementById('cardTemplate').content.firstElementChild.cloneNode(true);
  const exp = i.expires ? new Date(i.expires) : null;
  const expTxt = exp ? `Exp: ${exp.toISOString().slice(0,10)}` : 'No date';
  t.innerHTML = `<h3>${i.name}</h3>
    <p>${i.quantity ?? ''} ${i.unit ?? ''} · <span class="badge">${i.location}</span> · <span class="small">${expTxt}</span></p>
    <div class="row">
      ${(i.tags||[]).map(x=>`<span class="tag">${x}</span>`).join('')}
    </div>
    <div class="row">
      <button data-act="use">Use</button>
      <button data-act="edit">Edit</button>
      <button data-act="del" class="muted">Delete</button>
    </div>`;
  t.querySelector('[data-act="use"]').addEventListener('click', () => {
    const use = prompt('How much did you use?', '1'); if (use===null) return;
    const val = parseFloat(use)||0;
    i.quantity = Math.max(0, (parseFloat(i.quantity)||0) - val);
    if (i.quantity===0 && confirm('Quantity is zero. Remove item?')) {
      inventory = inventory.filter(x=>x.id!==i.id);
    }
    store.set('inventory', inventory); renderInventory();
  });
  t.querySelector('[data-act="edit"]').addEventListener('click', () => openItemDialog(i));
  t.querySelector('[data-act="del"]').addEventListener('click', () => {
    if (confirm('Delete this item?')) { inventory = inventory.filter(x=>x.id!==i.id); store.set('inventory', inventory); renderInventory(); }
  });
  return t;
}

function openItemDialog(existing=null) {
  const dlg = document.getElementById('itemDialog');
  const form = document.getElementById('itemForm');
  document.getElementById('itemDialogTitle').textContent = existing ? 'Edit Item' : 'Add Item';
  form.name.value = existing?.name || '';
  form.location.value = existing?.location || 'Cupboard';
  form.quantity.value = existing?.quantity ?? 1;
  form.unit.value = existing?.unit || '';
  form.expires.value = existing?.expires || '';
  form.tags.value = (existing?.tags||[]).join(', ');
  dlg.showModal();
  dlg.returnValue = '';
  const onClose = () => {
    dlg.removeEventListener('close', onClose);
    if (dlg.returnValue === 'save') {
      const rec = {
        id: existing?.id || uid(),
        name: form.name.value.trim(),
        location: form.location.value,
        quantity: parseFloat(form.quantity.value)||0,
        unit: form.unit.value.trim(),
        expires: form.expires.value || null,
        tags: parseTags(form.tags.value)
      };
      if (!rec.name) return;
      if (existing) {
        const idx = inventory.findIndex(x=>x.id===existing.id);
        inventory[idx] = rec;
      } else {
        inventory.push(rec);
      }
      store.set('inventory', inventory);
      renderInventory();
    }
  };
  dlg.addEventListener('close', onClose);
}

$('#addItemBtn').addEventListener('click', ()=> openItemDialog());
$('#invSearch').addEventListener('input', renderInventory);
$('#invLocFilter').addEventListener('change', renderInventory);
$('#invExpiryFilter').addEventListener('change', renderInventory);

// ---------- Recipes ----------
function renderRecipes() {
  const q = $('#recSearch').value.trim().toLowerCase();
  const list = $('#recipeList'); list.innerHTML = '';
  recipes.filter(r => !q || r.title.toLowerCase().includes(q))
    .sort((a,b)=>cmpi(a.title,b.title))
    .forEach(r => list.appendChild(recipeCard(r)));
}
function recipeCard(r) {
  const t = document.getElementById('cardTemplate').content.firstElementChild.cloneNode(true);
  t.innerHTML = `<h3>${r.title}</h3>
    <p>${(r.notes||'').slice(0,180)}</p>
    <div class="row">${r.ingredients.map(i=>`<span class="tag">${i.qty||''} ${i.unit||''} ${i.name}</span>`).join('')}</div>
    <div class="row">
      <button data-act="plan">Plan</button>
      <button data-act="edit">Edit</button>
      <button data-act="del" class="muted">Delete</button>
    </div>`;
  t.querySelector('[data-act="plan"]').addEventListener('click', ()=> openPlanDialog(r));
  t.querySelector('[data-act="edit"]').addEventListener('click', ()=> openRecipeDialog(r));
  t.querySelector('[data-act="del"]').addEventListener('click', ()=> {
    if (confirm('Delete recipe?')) {
      recipes = recipes.filter(x=>x.id!==r.id); store.set('recipes', recipes); renderRecipes();
    }
  });
  return t;
}

function openRecipeDialog(existing=null) {
  const dlg = $('#recipeDialog'); const form = $('#recipeForm');
  $('#recipeDialogTitle').textContent = existing ? 'Edit Recipe' : 'New Recipe';
  form.title.value = existing?.title || '';
  form.notes.value = existing?.notes || '';
  const ingBox = $('#ingList'); ingBox.innerHTML = '';
  (existing?.ingredients || []).forEach((i, idx) => addIngChip(i.name, i.qty, i.unit));
  dlg.showModal();
  dlg.returnValue='';
  function addIngChip(name, qty, unit) {
    const chip = document.createElement('div');
    chip.className = 'badge';
    chip.textContent = `${qty||''} ${unit||''} ${name}`.trim();
    const rm = document.createElement('button'); rm.textContent='×'; rm.style.marginLeft='6px';
    rm.addEventListener('click', ()=> { chip.remove(); });
    chip.appendChild(rm); chip.dataset.name=name; chip.dataset.qty=qty||''; chip.dataset.unit=unit||'';
    ingBox.appendChild(chip);
  }
  $('#addIng').onclick = () => {
    const n = $('#ingName').value.trim(); const q = parseFloat($('#ingQty').value)||''; const u = $('#ingUnit').value.trim();
    if (!n) return; addIngChip(n, q, u); $('#ingName').value=''; $('#ingQty').value=''; $('#ingUnit').value='';
  };
  const onClose = () => {
    dlg.removeEventListener('close', onClose);
    if (dlg.returnValue==='save') {
      const rec = {
        id: existing?.id || uid(),
        title: form.title.value.trim(),
        notes: form.notes.value.trim(),
        ingredients: Array.from(ingBox.children).map(ch => ({
          name: ch.dataset.name, qty: ch.dataset.qty?parseFloat(ch.dataset.qty):null, unit: ch.dataset.unit||''
        }))
      };
      if (!rec.title) return;
      if (existing) {
        const idx = recipes.findIndex(x=>x.id===existing.id); recipes[idx] = rec;
      } else { recipes.push(rec); }
      store.set('recipes', recipes); renderRecipes();
    }
  };
  dlg.addEventListener('close', onClose);
}
$('#addRecipeBtn').addEventListener('click', ()=> openRecipeDialog());
$('#recSearch').addEventListener('input', renderRecipes);

// ---------- Planner ----------
function renderPlanner() {
  const grid = $('#plannerGrid'); grid.innerHTML = '';
  const label = $('.weekLabel');
  const end = addDays(weekStart, 6);
  label.textContent = `${weekStart.toLocaleDateString()} – ${end.toLocaleDateString()}`;

  // header row
  const headRow = document.createElement('div');
  headRow.className = 'row';
  const head0 = document.createElement('div'); head0.className='cell head'; head0.textContent='Meal';
  grid.appendChild(head0);
  for (let i=0;i<7;i++) {
    const d = addDays(weekStart, i);
    const h = document.createElement('div'); h.className='cell head'; h.textContent = days[i] + ' ' + (d.getMonth()+1)+'/'+d.getDate();
    grid.appendChild(h);
  }
  // rows for meals
  slots.forEach(slot => {
    const label = document.createElement('div'); label.className ='cell slot-label'; label.textContent = slot; grid.appendChild(label);
    for (let i=0;i<7;i++) {
      const dkey = addDays(weekStart, i).toISOString().slice(0,10);
      plan[dkey] = plan[dkey] || {};
      const cell = document.createElement('div'); cell.className='cell';
      const entry = plan[dkey][slot.toLowerCase()];

      if (entry) {
        const div = document.createElement('div'); div.className='planned-item';
        if (entry.type==='recipe') {
          const r = recipes.find(x=>x.id===entry.id);
          div.innerHTML = `<strong>${r? r.title:'(missing recipe)'}</strong><div class="small">${slot}</div>`;
        } else {
          div.innerHTML = `<strong>${entry.text}</strong><div class="small">${slot}</div>`;
        }
        div.addEventListener('click', () => {
          if (confirm('Remove from plan?')) { delete plan[dkey][slot.toLowerCase()]; store.set('plan', plan); renderPlanner(); }
        });
        cell.appendChild(div);
      } else {
        const plus = document.createElement('button'); plus.textContent = '+ Add'; plus.addEventListener('click', ()=> openPlanDialog(null, dkey, slot.toLowerCase()));
        cell.appendChild(plus);
      }
      grid.appendChild(cell);
    }
  });
  store.set('plan', plan);
}

$('#prevWeek').addEventListener('click', ()=> { weekStart = addDays(weekStart, -7); renderPlanner(); });
$('#nextWeek').addEventListener('click', ()=> { weekStart = addDays(weekStart, 7); renderPlanner(); });
$('#clearWeek').addEventListener('click', ()=> {
  if (!confirm('Clear all meals this week?')) return;
  for (let i=0;i<7;i++) {
    const key = addDays(weekStart,i).toISOString().slice(0,10);
    plan[key] = {};
  }
  store.set('plan', plan); renderPlanner();
});

function openPlanDialog(recipe=null, dkey=null, slot=null) {
  const dlg = $('#planDialog'); const results = $('#planRecipeResults'); const input = $('#planSearch');
  results.innerHTML=''; input.value='';
  const pick = (r) => {
    // If dialog opened from recipe card, add to today by default or to provided slot
    const day = dkey || new Date().toISOString().slice(0,10);
    const sl = slot || 'dinner';
    plan[day] = plan[day] || {};
    plan[day][sl] = { type:'recipe', id:r.id };
    store.set('plan', plan);
    dlg.close();
    renderPlanner();
  };
  if (recipe) pick(recipe); else {
    dlg.showModal();
    const refresh = () => {
      const q = input.value.trim().toLowerCase();
      results.innerHTML = '';
      recipes.filter(r=>!q || r.title.toLowerCase().includes(q)).slice(0,50).forEach(r=>{
        const div = document.createElement('div'); div.className='card';
        div.innerHTML = `<h3>${r.title}</h3><div class="row">${r.ingredients.map(i=>`<span class="tag">${i.qty||''} ${i.unit||''} ${i.name}</span>`).join('')}</div>`;
        div.addEventListener('click', ()=> pick(r));
        results.appendChild(div);
      });
      // custom note option
      if (q) {
        const div = document.createElement('div'); div.className='card'; div.innerHTML=`<h3>Add note: "${q}"</h3>`;
        div.addEventListener('click', ()=> {
          const day = dkey || new Date().toISOString().slice(0,10);
          const sl = slot || 'dinner';
          plan[day] = plan[day] || {}; plan[day][sl] = { type:'note', text: q };
          store.set('plan', plan); dlg.close(); renderPlanner();
        });
        results.appendChild(div);
      }
    };
    input.oninput = refresh; refresh();
  }
}
$('#planFromRecipes').addEventListener('click', ()=> openPlanDialog());

// ---------- Shopping List ----------
function computeShoppingFromPlan() {
  // tally required ingredients for all planned recipes in current data set
  const need = {};
  Object.values(plan).forEach(day => {
    slots.forEach(s => {
      const e = day[s.toLowerCase()];
      if (e && e.type==='recipe') {
        const r = recipes.find(x=>x.id===e.id); if (!r) return;
        r.ingredients.forEach(i => {
          const key = i.name.toLowerCase() + '|' + (i.unit||'');
          need[key] = need[key] || { name: i.name, unit: i.unit||'', qty: 0 };
          need[key].qty += i.qty || 0;
        });
      }
    });
  });
  // subtract inventory qty if same name (case-insensitive) and unit matches (or unit empty)
  inventory.forEach(item => {
    const keys = [item.name.toLowerCase() + '|' + (item.unit||''), item.name.toLowerCase() + '|'];
    keys.forEach(k => {
      if (need[k]) {
        need[k].qty = Math.max(0, need[k].qty - (parseFloat(item.quantity)||0));
      }
    });
  });
  // convert to list
  const list = Object.values(need).filter(x => x.qty > 0).map(x => ({ id: uid(), name: x.name, qty: +x.qty.toFixed(2), unit: x.unit, checked: false }));
  return list;
}

function renderShopping() {
  const ul = $('#shoppingList'); ul.innerHTML='';
  shopping.forEach(item => {
    const li = document.createElement('li');
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = !!item.checked;
    cb.addEventListener('change', ()=> { item.checked = cb.checked; store.set('shopping', shopping); });
    const label = document.createElement('span'); label.textContent = `${item.qty||''} ${item.unit||''} ${item.name}`.trim();
    const del = document.createElement('button'); del.textContent='Delete'; del.className='muted';
    del.addEventListener('click', ()=> { shopping = shopping.filter(x=>x.id!==item.id); store.set('shopping', shopping); renderShopping(); });
    li.appendChild(cb); li.appendChild(label); li.appendChild(del);
    ul.appendChild(li);
  });
}
$('#regenList').addEventListener('click', ()=> { shopping = computeShoppingFromPlan(); store.set('shopping', shopping); renderShopping(); });
$('#clearChecked').addEventListener('click', ()=> { shopping = shopping.filter(x=>!x.checked); store.set('shopping', shopping); renderShopping(); });
$('#exportList').addEventListener('click', ()=> {
  const text = shopping.map(i => `- [${i.checked?'x':' '}] ${i.qty||''} ${i.unit||''} ${i.name}`).join('\n');
  const blob = new Blob([text], {type:'text/plain'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'shopping-list.txt'; a.click();
});

// ---------- Settings: Import/Export ----------
$('#exportData').addEventListener('click', ()=> {
  const data = { inventory, recipes, plan, shopping, weekStart: weekStart.toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'meal_planner_backup.json'; a.click();
});
$('#importData').addEventListener('change', (e)=> {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=> {
    try {
      const data = JSON.parse(ev.target.result);
      inventory = data.inventory || []; recipes = data.recipes || []; plan = data.plan || {}; shopping = data.shopping || [];
      weekStart = data.weekStart ? new Date(data.weekStart) : startOfWeek(new Date());
      store.set('inventory', inventory); store.set('recipes', recipes); store.set('plan', plan); store.set('shopping', shopping);
      renderInventory(); renderRecipes(); renderPlanner(); renderShopping();
      alert('Import complete.');
    } catch (err) { alert('Import failed: ' + err.message); }
  };
  reader.readAsText(file);
});

// Initial renders
renderInventory(); renderRecipes(); renderPlanner();

// Accessibility: close dialogs with Esc handled natively by <dialog>
